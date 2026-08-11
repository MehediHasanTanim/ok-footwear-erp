import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DocNumberService } from '@modules/orders/services/doc-number.service';
import {
  GlEntryLineRow,
  PostJournalInput,
  PostJournalLineInput,
} from './finance.types';

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly docNumber: DocNumberService,
  ) {}

  /**
   * Sole writer of posted GL headers + partitioned gl_entry_lines.
   * Validates debit=credit and open period; lines via $queryRaw only.
   */
  async postJournal(input: PostJournalInput) {
    this.assertBalanced(input.lines);

    const period = await this.prisma.glPeriod.findUnique({
      where: { id: input.periodId },
    });
    if (!period) {
      throw new NotFoundException({ statusCode: 404, message: 'GL period not found' });
    }
    if (period.status !== 'open') {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: `Cannot post to a ${period.status} GL period`,
      });
    }

    const accountIds = [...new Set(input.lines.map((l) => l.accountId))];
    const accounts = await this.prisma.chartOfAccount.findMany({
      where: { id: { in: accountIds }, isActive: true },
    });
    if (accounts.length !== accountIds.length) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'One or more GL accounts are missing or inactive',
      });
    }

    const entry = await this.prisma.$transaction(async (tx) => {
      const entryNumber = await this.docNumber.generate(tx, 'JV');
      const header = await tx.glEntry.create({
        data: {
          entryNumber,
          periodId: input.periodId,
          entryDate: new Date(input.entryDate),
          entryType: input.entryType ?? 'manual',
          sourceModule: input.sourceModule,
          sourceId: input.sourceId,
          narration: input.narration,
          status: 'posted',
          reversalOf: input.reversalOf,
          postedAt: new Date(),
          postedBy: input.postedBy,
          createdBy: input.postedBy,
        },
      });

      for (const line of input.lines) {
        await this.insertLine(tx, header.id, input.entryDate, line);
      }

      return header;
    });

    const lines = await this.findLines(entry.id);
    this.logger.log(`Journal ${entry.entryNumber} posted (${lines.length} lines)`);
    return { ...entry, lines };
  }

  async findLines(glEntryId: string) {
    const rows = await this.prisma.$queryRaw<GlEntryLineRow[]>`
      SELECT * FROM fin.gl_entry_lines
      WHERE gl_entry_id = ${glEntryId}::uuid
      ORDER BY debit DESC, credit DESC
    `;
    return rows.map((r) => this.mapLine(r));
  }

  private assertBalanced(lines: PostJournalLineInput[]) {
    if (!lines?.length || lines.length < 2) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'Journal requires at least two lines',
      });
    }

    let debit = 0;
    let credit = 0;
    for (const line of lines) {
      const d = Number(line.debit) || 0;
      const c = Number(line.credit) || 0;
      if ((d > 0 && c > 0) || (d === 0 && c === 0) || d < 0 || c < 0) {
        throw new UnprocessableEntityException({
          statusCode: 422,
          message: 'Each line must have either debit or credit (not both, not neither)',
        });
      }
      debit += d;
      credit += c;
    }

    if (Math.round(debit * 10000) !== Math.round(credit * 10000)) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'Journal must balance: total debit must equal total credit',
        detail: `Debit ${debit} ≠ credit ${credit}`,
      });
    }
  }

  private async insertLine(
    tx: Prisma.TransactionClient,
    glEntryId: string,
    entryDate: string,
    line: PostJournalLineInput,
  ) {
    const deptSql = line.departmentId
      ? Prisma.sql`${line.departmentId}::uuid`
      : Prisma.sql`NULL`;

    try {
      await tx.$queryRaw`
        INSERT INTO fin.gl_entry_lines (
          gl_entry_id, account_id, debit, credit, currency, fx_rate,
          department_id, cost_center, entry_date, narration
        ) VALUES (
          ${glEntryId}::uuid,
          ${line.accountId}::uuid,
          ${line.debit},
          ${line.credit},
          ${line.currency ?? 'BDT'},
          ${line.fxRate ?? 1},
          ${deptSql},
          ${line.costCenter ?? null},
          ${entryDate}::date,
          ${line.narration ?? null}
        )
      `;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('closed') || msg.includes('locked') || msg.includes('GL period')) {
        throw new UnprocessableEntityException({
          statusCode: 422,
          message: msg.includes('locked')
            ? 'Cannot post to a locked GL period'
            : 'Cannot post to a closed GL period',
        });
      }
      throw err;
    }
  }

  private mapLine(r: GlEntryLineRow) {
    return {
      id: r.id,
      glEntryId: r.gl_entry_id,
      accountId: r.account_id,
      debit: Number(r.debit),
      credit: Number(r.credit),
      currency: r.currency,
      fxRate: Number(r.fx_rate),
      baseDebit: Number(r.base_debit),
      baseCredit: Number(r.base_credit),
      departmentId: r.department_id,
      costCenter: r.cost_center,
      entryDate: r.entry_date,
      narration: r.narration,
    };
  }
}
