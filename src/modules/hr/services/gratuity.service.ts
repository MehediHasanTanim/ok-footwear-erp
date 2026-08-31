import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { FinanceService } from '@modules/finance/services/finance.service';
import { SYSTEM_COA } from '@modules/finance/services/finance.types';

@Injectable()
export class GratuityService {
  private readonly logger = new Logger(GratuityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
  ) {}

  async computeEntitlement(employeeId: string, exitDate?: string) {
    const date = exitDate ?? new Date().toISOString().slice(0, 10);
    const rows = await this.prisma.$queryRaw<{ gratuity: number | string }[]>`
      SELECT hr.compute_gratuity(${employeeId}::uuid, ${date}::date) AS gratuity
    `;
    return {
      employeeId,
      exitDate: date,
      entitlement: Number(rows[0]?.gratuity ?? 0),
    };
  }

  async getProvisions(employeeId: string) {
    return this.prisma.gratuityProvision.findMany({
      where: { employeeId },
      orderBy: { asOfDate: 'desc' },
    });
  }

  async accrueMonth(asOfDate?: string, postedBy?: string) {
    const asOf = asOfDate ? new Date(asOfDate) : new Date();
    const dateStr = asOf.toISOString().slice(0, 10);

    const employees = await this.prisma.employee.findMany({
      where: { deletedAt: null, status: { in: ['active', 'probation', 'notice_period'] } },
    });

    let provisionsCreated = 0;
    let totalCharge = 0;

    for (const emp of employees) {
      const entitlement = await this.computeEntitlement(emp.id, dateStr);
      const cumulative = entitlement.entitlement;

      const prev = await this.prisma.gratuityProvision.findFirst({
        where: { employeeId: emp.id },
        orderBy: { asOfDate: 'desc' },
      });
      const prevCumulative = prev ? Number(prev.cumulativeAmount) : 0;
      const periodCharge = Math.max(cumulative - prevCumulative, 0);

      const joinDate = emp.joinDate;
      const months =
        (asOf.getFullYear() - joinDate.getFullYear()) * 12 +
        (asOf.getMonth() - joinDate.getMonth());
      const serviceYears =
        Math.trunc(months / 12) + (months % 12 >= 6 ? 1 : 0);

      const provision = await this.prisma.gratuityProvision.upsert({
        where: {
          employeeId_asOfDate: { employeeId: emp.id, asOfDate: asOf },
        },
        create: {
          employeeId: emp.id,
          asOfDate: asOf,
          serviceYears,
          lastBasic: emp.basicSalary,
          provisionAmount: cumulative,
          cumulativeAmount: cumulative,
          periodCharge,
        },
        update: {
          serviceYears,
          lastBasic: emp.basicSalary,
          provisionAmount: cumulative,
          cumulativeAmount: cumulative,
          periodCharge,
        },
      });

      if (periodCharge > 0 && postedBy) {
        try {
          await this.postGlEntry(provision.id, periodCharge, dateStr, postedBy, emp.departmentId);
        } catch (err) {
          this.logger.warn(`Gratuity GL skip for ${emp.id}: ${(err as Error).message}`);
        }
      }

      provisionsCreated++;
      totalCharge += periodCharge;
    }

    return { provisionsCreated, totalCharge };
  }

  private async postGlEntry(
    provisionId: string,
    amount: number,
    entryDate: string,
    postedBy: string,
    departmentId: string,
  ) {
    const expense = await this.prisma.chartOfAccount.findFirst({
      where: { accountCode: SYSTEM_COA.GRATUITY_EXPENSE, isActive: true },
    });
    const liability = await this.prisma.chartOfAccount.findFirst({
      where: { accountCode: SYSTEM_COA.GRATUITY_PROVISION, isActive: true },
    });
    if (!expense || !liability) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Gratuity CoA accounts 5200/2200 missing',
      });
    }

    const period = await this.prisma.glPeriod.findFirst({
      where: {
        periodYear: new Date(entryDate).getFullYear(),
        periodMonth: new Date(entryDate).getMonth() + 1,
        status: 'open',
      },
    });
    if (!period) {
      throw new NotFoundException({ statusCode: 404, message: 'Open GL period not found' });
    }

    const journal = await this.finance.postJournal({
      periodId: period.id,
      entryDate,
      narration: `Gratuity provision accrual`,
      entryType: 'system',
      sourceModule: 'gratuity',
      sourceId: provisionId,
      postedBy,
      lines: [
        {
          accountId: expense.id,
          debit: amount,
          credit: 0,
          departmentId,
          narration: 'Gratuity expense',
        },
        {
          accountId: liability.id,
          debit: 0,
          credit: amount,
          narration: 'Gratuity provision',
        },
      ],
    });

    await this.prisma.gratuityProvision.update({
      where: { id: provisionId },
      data: { glEntryId: journal.id },
    });
  }
}
