import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PayrollDisbursedEvent } from '@modules/hr/events/payroll-disbursed.event';
import { PrismaService } from '@shared/database/prisma.service';
import { FinanceService } from '../services/finance.service';
import { SYSTEM_COA } from '../services/finance.types';

/**
 * Posts salary expense + net payable GL journal when HR disburses payroll.
 */
@Injectable()
export class PayrollDisbursedHandler {
  private readonly logger = new Logger(PayrollDisbursedHandler.name);

  constructor(
    private readonly finance: FinanceService,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent(PayrollDisbursedEvent.NAME)
  async handle(event: PayrollDisbursedEvent): Promise<void> {
    if (!event.disbursedBy || !event.periodId || !event.payrollRunId) {
      this.logger.error({
        message: 'PayrollDisbursedEvent missing required fields — skipping',
        event,
      });
      return;
    }

    const amount = Number(event.totalNet);
    if (!Number.isFinite(amount) || amount <= 0) {
      this.logger.warn({
        message: 'PayrollDisbursedEvent has non-positive net — skipping',
        payrollRunId: event.payrollRunId,
        totalNet: event.totalNet,
      });
      return;
    }

    const [expense, payable] = await Promise.all([
      this.prisma.chartOfAccount.findUnique({
        where: { accountCode: SYSTEM_COA.SALARY_EXPENSE },
      }),
      this.prisma.chartOfAccount.findUnique({
        where: { accountCode: SYSTEM_COA.NET_SALARY_PAYABLE },
      }),
    ]);

    if (!expense || !payable) {
      this.logger.error({
        message: 'System CoA 5100/2100 missing — cannot post payroll journal',
        payrollRunId: event.payrollRunId,
      });
      return;
    }

    const journal = await this.finance.postJournal({
      periodId: event.periodId,
      entryDate: event.entryDate,
      narration: `Payroll disbursement ${event.payrollRunId}`,
      entryType: 'system',
      sourceModule: 'payroll',
      sourceId: event.payrollRunId,
      lines: [
        { accountId: expense.id, debit: amount, credit: 0 },
        { accountId: payable.id, debit: 0, credit: amount },
      ],
      postedBy: event.disbursedBy,
    });

    this.logger.log({
      message: 'Payroll GL journal posted',
      payrollRunId: event.payrollRunId,
      entryNumber: journal.entryNumber,
      amount,
    });
  }
}
