import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  ApplyLeaveDto,
  ApproveLeaveDto,
  CarryForwardDto,
  CreateLeaveTypeDto,
  RejectLeaveDto,
  UpdateLeaveTypeDto,
} from '../dto/leave.dto';

@Injectable()
export class LeaveService {
  private readonly logger = new Logger(LeaveService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createLeaveType(dto: CreateLeaveTypeDto) {
    return this.prisma.leaveType.create({ data: dto });
  }

  async listLeaveTypes(activeOnly = true) {
    return this.prisma.leaveType.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { code: 'asc' },
    });
  }

  async updateLeaveType(id: string, dto: UpdateLeaveTypeDto) {
    await this.getLeaveType(id);
    return this.prisma.leaveType.update({ where: { id }, data: dto });
  }

  async apply(dto: ApplyLeaveDto) {
    const leaveType = await this.getLeaveType(dto.leaveTypeId);
    const totalDays = this.computeTotalDays(dto.startDate, dto.endDate, dto.halfDay, leaveType.halfDayAllowed);

    await this.assertNoOverlap(dto.employeeId, dto.startDate, dto.endDate);
    await this.assertBalance(dto.employeeId, dto.leaveTypeId, totalDays, dto.startDate);

    return this.prisma.leaveRequest.create({
      data: {
        employeeId: dto.employeeId,
        leaveTypeId: dto.leaveTypeId,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        halfDay: dto.halfDay,
        totalDays,
        reason: dto.reason,
        status: 'pending',
      },
    });
  }

  async approve(id: string, dto: ApproveLeaveDto, userId: string) {
    const req = await this.getLeaveRequest(id);
    if (req.status === 'rejected' || req.status === 'cancelled') {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'Leave request is not approvable',
      });
    }

    if (dto.stage === 'manager') {
      return this.prisma.leaveRequest.update({
        where: { id },
        data: {
          status: 'manager_approved',
          managerId: userId,
          managerDecisionAt: new Date(),
        },
      });
    }

    if (req.status !== 'manager_approved' && req.status !== 'pending') {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'Leave request must be manager-approved before HR approval',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const year = new Date(req.startDate).getFullYear();
      await this.ensureBalanceRow(tx, req.employeeId, req.leaveTypeId, year);
      await tx.leaveBalance.update({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId: req.employeeId,
            leaveTypeId: req.leaveTypeId,
            year,
          },
        },
        data: { used: { increment: Number(req.totalDays) } },
      });

      return tx.leaveRequest.update({
        where: { id },
        data: {
          status: 'hr_approved',
          hrDecisionAt: new Date(),
        },
      });
    });
  }

  async reject(id: string, dto: RejectLeaveDto) {
    await this.getLeaveRequest(id);
    return this.prisma.leaveRequest.update({
      where: { id },
      data: { status: 'rejected', rejectionReason: dto.reason },
    });
  }

  async cancel(id: string) {
    const req = await this.getLeaveRequest(id);
    if (req.status === 'hr_approved') {
      const year = new Date(req.startDate).getFullYear();
      await this.prisma.leaveBalance.update({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId: req.employeeId,
            leaveTypeId: req.leaveTypeId,
            year,
          },
        },
        data: { used: { decrement: Number(req.totalDays) } },
      });
    }
    return this.prisma.leaveRequest.update({
      where: { id },
      data: { status: 'cancelled' },
    });
  }

  async getBalance(employeeId: string, year?: number) {
    const y = year ?? new Date().getFullYear();
    const rows = await this.prisma.leaveBalance.findMany({
      where: { employeeId, year: y },
      include: { leaveType: true },
    });
    return rows.map((r) => ({
      leaveTypeId: r.leaveTypeId,
      leaveType: r.leaveType,
      year: r.year,
      openingBal: Number(r.openingBal),
      accrued: Number(r.accrued),
      adjusted: Number(r.adjusted),
      used: Number(r.used),
      balance: Number(r.openingBal) + Number(r.accrued) + Number(r.adjusted) - Number(r.used),
    }));
  }

  async accrueMonthly(asOf = new Date()) {
    const year = asOf.getFullYear();
    const types = await this.prisma.leaveType.findMany({
      where: { isActive: true, accrualType: { in: ['monthly', 'annual'] } },
    });
    const employees = await this.prisma.employee.findMany({
      where: { deletedAt: null, status: { in: ['active', 'probation'] } },
    });

    let updated = 0;
    for (const emp of employees) {
      for (const lt of types) {
        const increment =
          lt.accrualType === 'monthly'
            ? Number(lt.annualEntitlement) / 12
            : asOf.getMonth() === 0
              ? Number(lt.annualEntitlement)
              : 0;
        if (increment <= 0) continue;

        await this.ensureBalanceRow(this.prisma, emp.id, lt.id, year);
        await this.prisma.leaveBalance.update({
          where: {
            employeeId_leaveTypeId_year: {
              employeeId: emp.id,
              leaveTypeId: lt.id,
              year,
            },
          },
          data: { accrued: { increment } },
        });
        updated++;
      }
    }
    this.logger.log(`Leave accrual updated ${updated} balance row(s)`);
    return { updated };
  }

  async carryForward(dto: CarryForwardDto) {
    const balances = await this.prisma.leaveBalance.findMany({
      where: { year: dto.fromYear },
      include: { leaveType: true },
    });

    let carried = 0;
    for (const bal of balances) {
      const remaining =
        Number(bal.openingBal) + Number(bal.accrued) + Number(bal.adjusted) - Number(bal.used);
      const cap = Number(bal.leaveType.carryForwardLimit);
      const opening = Math.min(Math.max(remaining, 0), cap);
      if (opening <= 0) continue;

      await this.ensureBalanceRow(this.prisma, bal.employeeId, bal.leaveTypeId, dto.toYear);
      await this.prisma.leaveBalance.update({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId: bal.employeeId,
            leaveTypeId: bal.leaveTypeId,
            year: dto.toYear,
          },
        },
        data: { openingBal: { increment: opening } },
      });
      carried++;
    }
    return { carried };
  }

  private computeTotalDays(
    start: string,
    end: string,
    halfDay: string | undefined,
    halfDayAllowed: boolean,
  ): number {
    if (halfDay) {
      if (!halfDayAllowed) {
        throw new UnprocessableEntityException({
          statusCode: 422,
          message: 'Half-day leave is not allowed for this leave type',
        });
      }
      return 0.5;
    }
    const s = new Date(start);
    const e = new Date(end);
    if (e < s) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'endDate must be on or after startDate',
      });
    }
    const diff = Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
    return diff;
  }

  private async assertNoOverlap(employeeId: string, start: string, end: string) {
    const overlaps = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM hr.leave_requests
      WHERE employee_id = ${employeeId}::uuid
        AND status NOT IN ('rejected', 'cancelled')
        AND daterange(start_date, end_date, '[]') && daterange(${start}::date, ${end}::date, '[]')
      LIMIT 1
    `;
    if (overlaps.length > 0) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'Overlapping leave request exists for this date range',
      });
    }
  }

  private async assertBalance(
    employeeId: string,
    leaveTypeId: string,
    totalDays: number,
    startDate: string,
  ) {
    const year = new Date(startDate).getFullYear();
    await this.ensureBalanceRow(this.prisma, employeeId, leaveTypeId, year);
    const bal = await this.prisma.leaveBalance.findUnique({
      where: {
        employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year },
      },
    });
    const available =
      Number(bal!.openingBal) + Number(bal!.accrued) + Number(bal!.adjusted) - Number(bal!.used);
    if (available < totalDays) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'Insufficient leave balance',
      });
    }
  }

  private async ensureBalanceRow(
    tx: Prisma.TransactionClient | PrismaService,
    employeeId: string,
    leaveTypeId: string,
    year: number,
  ) {
    await tx.leaveBalance.upsert({
      where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } },
      create: { employeeId, leaveTypeId, year },
      update: {},
    });
  }

  private async getLeaveType(id: string) {
    const lt = await this.prisma.leaveType.findUnique({ where: { id } });
    if (!lt) {
      throw new NotFoundException({ statusCode: 404, message: 'Leave type not found' });
    }
    return lt;
  }

  private async getLeaveRequest(id: string) {
    const req = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!req) {
      throw new NotFoundException({ statusCode: 404, message: 'Leave request not found' });
    }
    return req;
  }
}
