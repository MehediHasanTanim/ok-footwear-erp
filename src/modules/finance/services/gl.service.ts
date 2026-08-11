import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { FinanceService } from './finance.service';
import {
  AccountBalanceQueryDto,
  CreateGlPeriodDto,
  GlEntryQueryDto,
  PostJournalDto,
  TrialBalanceQueryDto,
} from '../dto/gl.dto';

@Injectable()
export class GlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
  ) {}

  // --- Journals -----------------------------------------------------------

  async postJournal(dto: PostJournalDto, userId: string) {
    return this.finance.postJournal({
      periodId: dto.periodId,
      entryDate: dto.entryDate,
      narration: dto.narration,
      entryType: dto.entryType,
      sourceModule: dto.sourceModule,
      sourceId: dto.sourceId,
      lines: dto.lines,
      postedBy: userId,
    });
  }

  async findAllEntries(query: GlEntryQueryDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;
    const where: Prisma.GlEntryWhereInput = {};
    if (query.periodId) where.periodId = query.periodId;
    if (query.status) where.status = query.status;
    if (query.sourceModule) where.sourceModule = query.sourceModule;

    const [data, total] = await Promise.all([
      this.prisma.glEntry.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { period: true },
      }),
      this.prisma.glEntry.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, totalItems: total, totalPages: Math.ceil(total / limit) || 0 },
    };
  }

  async findOneEntry(id: string) {
    const entry = await this.prisma.glEntry.findUnique({
      where: { id },
      include: { period: true },
    });
    if (!entry) {
      throw new NotFoundException({ statusCode: 404, message: 'GL entry not found' });
    }
    const lines = await this.finance.findLines(id);
    return { ...entry, lines };
  }

  // --- Periods ------------------------------------------------------------

  async findAllPeriods() {
    return this.prisma.glPeriod.findMany({
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
    });
  }

  async createPeriod(dto: CreateGlPeriodDto) {
    try {
      return await this.prisma.glPeriod.create({
        data: {
          periodYear: dto.periodYear,
          periodMonth: dto.periodMonth,
          status: 'open',
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          statusCode: 409,
          message: 'GL period already exists for this year/month',
        });
      }
      throw err;
    }
  }

  async closePeriod(id: string, userId: string) {
    const period = await this.requirePeriod(id);
    if (period.status !== 'open') {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: `Cannot close period in status ${period.status}`,
      });
    }
    return this.prisma.glPeriod.update({
      where: { id },
      data: { status: 'closed', closedBy: userId, closedAt: new Date() },
    });
  }

  async lockPeriod(id: string, userId: string) {
    const period = await this.requirePeriod(id);
    if (period.status !== 'closed') {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'Only closed periods can be locked',
      });
    }
    return this.prisma.glPeriod.update({
      where: { id },
      data: { status: 'locked', closedBy: userId, closedAt: period.closedAt ?? new Date() },
    });
  }

  async unlockPeriod(id: string) {
    const period = await this.requirePeriod(id);
    if (period.status !== 'locked') {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'Only locked periods can be unlocked',
      });
    }
    return this.prisma.glPeriod.update({
      where: { id },
      data: { status: 'closed' },
    });
  }

  // --- Reports ------------------------------------------------------------

  async trialBalance(query: TrialBalanceQueryDto) {
    await this.requirePeriod(query.periodId);

    const rows = await this.prisma.$queryRaw<
      {
        account_id: string;
        account_code: string;
        name: string;
        account_type: string;
        total_debit: number | string;
        total_credit: number | string;
      }[]
    >`
      WITH period_entries AS (
        SELECT e.id
        FROM fin.gl_entries e
        WHERE e.period_id = ${query.periodId}::uuid
          AND e.status = 'posted'
      ),
      line_agg AS (
        SELECT
          l.account_id,
          SUM(l.base_debit)  AS total_debit,
          SUM(l.base_credit) AS total_credit
        FROM fin.gl_entry_lines l
        JOIN period_entries pe ON pe.id = l.gl_entry_id
        GROUP BY l.account_id
      )
      SELECT
        a.id AS account_id,
        a.account_code,
        a.name,
        a.account_type::text AS account_type,
        COALESCE(la.total_debit, 0)  AS total_debit,
        COALESCE(la.total_credit, 0) AS total_credit
      FROM fin.chart_of_accounts a
      LEFT JOIN line_agg la ON la.account_id = a.id
      WHERE a.is_active = TRUE
        AND (COALESCE(la.total_debit, 0) <> 0 OR COALESCE(la.total_credit, 0) <> 0)
      ORDER BY a.account_code ASC
    `;

    return rows.map((r) => ({
      accountId: r.account_id,
      accountCode: r.account_code,
      name: r.name,
      accountType: r.account_type,
      totalDebit: Number(r.total_debit),
      totalCredit: Number(r.total_credit),
      net: Number(r.total_debit) - Number(r.total_credit),
    }));
  }

  async accountBalance(query: AccountBalanceQueryDto) {
    const account = await this.prisma.chartOfAccount.findUnique({
      where: { id: query.accountId },
    });
    if (!account) {
      throw new NotFoundException({ statusCode: 404, message: 'Account not found' });
    }

    const rows = await this.prisma.$queryRaw<
      {
        total_debit: number | string;
        total_credit: number | string;
      }[]
    >`
      WITH balance AS (
        SELECT
          COALESCE(SUM(l.base_debit), 0)  AS total_debit,
          COALESCE(SUM(l.base_credit), 0) AS total_credit
        FROM fin.gl_entry_lines l
        JOIN fin.gl_entries e ON e.id = l.gl_entry_id
        WHERE l.account_id = ${query.accountId}::uuid
          AND e.status = 'posted'
          AND l.entry_date >= ${query.fromDate}::date
          AND l.entry_date <= ${query.toDate}::date
      )
      SELECT * FROM balance
    `;

    const totalDebit = Number(rows[0]?.total_debit ?? 0);
    const totalCredit = Number(rows[0]?.total_credit ?? 0);
    return {
      accountId: account.id,
      accountCode: account.accountCode,
      name: account.name,
      fromDate: query.fromDate,
      toDate: query.toDate,
      totalDebit,
      totalCredit,
      balance: totalDebit - totalCredit,
    };
  }

  private async requirePeriod(id: string) {
    const period = await this.prisma.glPeriod.findUnique({ where: { id } });
    if (!period) {
      throw new NotFoundException({ statusCode: 404, message: 'GL period not found' });
    }
    return period;
  }
}
