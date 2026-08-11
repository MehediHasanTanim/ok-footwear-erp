import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  BankAccountQueryDto,
  BankTxnQueryDto,
  CreateBankAccountDto,
  UpdateBankAccountDto,
} from '../dto/bank-accounts.dto';
import { parseBankCsv, parseBankOfx } from '../utils/csv-ofx-parser';

@Injectable()
export class BankAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: BankAccountQueryDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;
    const where: Prisma.BankAccountWhereInput = {};
    if (query.isActive !== undefined) where.isActive = query.isActive;

    const [data, total] = await Promise.all([
      this.prisma.bankAccount.findMany({
        where,
        skip,
        take: limit,
        orderBy: { accountName: 'asc' },
        include: { glAccount: { select: { id: true, accountCode: true, name: true } } },
      }),
      this.prisma.bankAccount.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, totalItems: total, totalPages: Math.ceil(total / limit) || 0 },
    };
  }

  async findOne(id: string) {
    const row = await this.prisma.bankAccount.findUnique({
      where: { id },
      include: { glAccount: true },
    });
    if (!row) {
      throw new NotFoundException({ statusCode: 404, message: 'Bank account not found' });
    }
    return row;
  }

  async create(dto: CreateBankAccountDto) {
    await this.requireGlAccount(dto.glAccountId);
    return this.prisma.bankAccount.create({
      data: {
        accountName: dto.accountName,
        bankName: dto.bankName,
        branch: dto.branch,
        accountNumber: dto.accountNumber,
        accountType: dto.accountType,
        currency: dto.currency ?? 'BDT',
        glAccountId: dto.glAccountId,
        isPayroll: dto.isPayroll ?? false,
      },
    });
  }

  async update(id: string, dto: UpdateBankAccountDto) {
    await this.findOne(id);
    if (dto.glAccountId) await this.requireGlAccount(dto.glAccountId);
    return this.prisma.bankAccount.update({
      where: { id },
      data: {
        accountName: dto.accountName,
        bankName: dto.bankName,
        branch: dto.branch,
        accountNumber: dto.accountNumber,
        accountType: dto.accountType,
        currency: dto.currency,
        glAccountId: dto.glAccountId,
        isPayroll: dto.isPayroll,
        isActive: dto.isActive,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.bankAccount.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async listTransactions(accountId: string, query: BankTxnQueryDto) {
    await this.findOne(accountId);
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;
    const where: Prisma.BankTransactionWhereInput = { bankAccountId: accountId };
    if (query.isReconciled !== undefined) where.isReconciled = query.isReconciled;

    const [data, total] = await Promise.all([
      this.prisma.bankTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { txnDate: 'desc' },
      }),
      this.prisma.bankTransaction.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, totalItems: total, totalPages: Math.ceil(total / limit) || 0 },
    };
  }

  async importStatement(
    accountId: string,
    format: 'csv' | 'ofx',
    content: string,
  ) {
    await this.findOne(accountId);
    let parsed;
    try {
      parsed = format === 'ofx' ? parseBankOfx(content) : parseBankCsv(content);
    } catch (err) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: err instanceof Error ? err.message : 'Failed to parse statement',
      });
    }
    if (!parsed.length) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'No transactions found in statement',
      });
    }

    const created = await this.prisma.$transaction(
      parsed.map((t) =>
        this.prisma.bankTransaction.create({
          data: {
            bankAccountId: accountId,
            txnDate: new Date(t.txnDate),
            valueDate: t.valueDate ? new Date(t.valueDate) : undefined,
            txnType: t.txnType,
            amount: t.amount,
            description: t.description,
            referenceNo: t.referenceNo,
          },
        }),
      ),
    );

    return { imported: created.length, transactions: created };
  }

  async reconcile(txnId: string) {
    const txn = await this.prisma.bankTransaction.findUnique({ where: { id: txnId } });
    if (!txn) {
      throw new NotFoundException({ statusCode: 404, message: 'Bank transaction not found' });
    }
    return this.prisma.bankTransaction.update({
      where: { id: txnId },
      data: { isReconciled: true },
    });
  }

  private async requireGlAccount(id: string) {
    const acct = await this.prisma.chartOfAccount.findUnique({ where: { id } });
    if (!acct || !acct.isActive) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'GL account not found or inactive',
      });
    }
    if (acct.accountType !== 'ASSET') {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'Bank account must link to an ASSET GL account',
      });
    }
    return acct;
  }
}
