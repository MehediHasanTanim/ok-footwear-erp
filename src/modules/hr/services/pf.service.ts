import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { PfContributionDto } from '../dto/pf-gratuity.dto';

@Injectable()
export class PfService {
  private readonly logger = new Logger(PfService.name);

  constructor(private readonly prisma: PrismaService) {}

  calculateContribution(basic: number) {
    return {
      employee: Math.round(basic * 0.1 * 100) / 100,
      employer: Math.round(basic * 0.1 * 100) / 100,
    };
  }

  async enroll(employeeId: string, enrolledDate?: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
    });
    if (!employee) {
      throw new NotFoundException({ statusCode: 404, message: 'Employee not found' });
    }

    return this.prisma.pfAccount.upsert({
      where: { employeeId },
      create: {
        employeeId,
        enrolledDate: enrolledDate ? new Date(enrolledDate) : new Date(),
      },
      update: {},
    });
  }

  async findByEmployee(employeeId: string) {
    const account = await this.prisma.pfAccount.findUnique({
      where: { employeeId },
      include: { employee: { select: { fullName: true, employeeCode: true } } },
    });
    if (!account) {
      throw new NotFoundException({ statusCode: 404, message: 'PF account not found' });
    }
    return account;
  }

  async recordContribution(accountId: string, dto: PfContributionDto) {
    const account = await this.prisma.pfAccount.findUnique({ where: { id: accountId } });
    if (!account) {
      throw new NotFoundException({ statusCode: 404, message: 'PF account not found' });
    }

    const amounts = this.calculateContribution(dto.basicSalary);
    const totalCredit = amounts.employee + amounts.employer;
    const newBalance = Number(account.balance) + totalCredit;

    return this.prisma.$transaction(async (tx) => {
      for (const [txnType, amount] of [
        ['employee_contrib', amounts.employee],
        ['employer_contrib', amounts.employer],
      ] as const) {
        await tx.pfTransaction.create({
          data: {
            pfAccountId: accountId,
            txnType,
            periodMonth: dto.month,
            periodYear: dto.year,
            amount,
            direction: 1,
            balanceAfter: newBalance,
          },
        });
      }

      return tx.pfAccount.update({
        where: { id: accountId },
        data: { balance: newBalance },
      });
    });
  }

  async getStatement(accountId: string, fromDate?: string, toDate?: string) {
    const account = await this.prisma.pfAccount.findUnique({ where: { id: accountId } });
    if (!account) {
      throw new NotFoundException({ statusCode: 404, message: 'PF account not found' });
    }

    const where: { pfAccountId: string; createdAt?: { gte?: Date; lte?: Date } } = {
      pfAccountId: accountId,
    };
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = new Date(fromDate);
      if (toDate) where.createdAt.lte = new Date(toDate);
    }

    const transactions = await this.prisma.pfTransaction.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    return {
      account,
      transactions,
      closingBalance: Number(account.balance),
    };
  }

  async annualInterestCredit(ratePct = 8) {
    const accounts = await this.prisma.pfAccount.findMany({
      where: { status: 'active', balance: { gt: 0 } },
    });

    let credited = 0;
    for (const account of accounts) {
      const interest = Math.round(Number(account.balance) * (ratePct / 100) * 100) / 100;
      if (interest <= 0) continue;

      const newBalance = Number(account.balance) + interest;
      await this.prisma.$transaction(async (tx) => {
        await tx.pfTransaction.create({
          data: {
            pfAccountId: account.id,
            txnType: 'interest',
            amount: interest,
            direction: 1,
            balanceAfter: newBalance,
          },
        });
        await tx.pfAccount.update({
          where: { id: account.id },
          data: { balance: newBalance },
        });
      });
      credited++;
    }

    this.logger.log(`PF interest credited for ${credited} account(s) at ${ratePct}%`);
    return { credited };
  }
}
