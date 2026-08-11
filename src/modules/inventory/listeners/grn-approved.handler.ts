import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { GrnApprovedEvent } from '@modules/procurement/events/grn-approved.event';
import { StockTransactionsService } from '../services/stock-transactions.service';

/**
 * Posts stock_transactions (direction=+1, txn_type=grn) for each accepted GRN line.
 * Replaces Sprint 5 GrnApprovedStubListener.
 */
@Injectable()
export class GrnApprovedHandler {
  private readonly logger = new Logger(GrnApprovedHandler.name);

  constructor(private readonly stockTx: StockTransactionsService) {}

  @OnEvent('grn.approved')
  async handle(event: GrnApprovedEvent): Promise<void> {
    const userId = event.approvedBy;
    if (!userId) {
      this.logger.error({
        message: 'GrnApprovedEvent missing approvedBy — skipping stock post',
        grnId: event.grnId,
      });
      return;
    }

    for (const line of event.lines ?? []) {
      if (line.acceptedQty <= 0) continue;

      try {
        await this.stockTx.recordMovement(
          {
            txnType: 'grn',
            direction: 1,
            itemId: line.itemId,
            warehouseId: line.warehouseId,
            quantity: line.acceptedQty,
            unitCost: line.unitCost,
            sourceModule: 'prc',
            sourceId: event.grnId,
          },
          userId,
        );
      } catch (err) {
        this.logger.error({
          message: 'Failed to post GRN stock movement',
          grnId: event.grnId,
          itemId: line.itemId,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    }

    this.logger.log({
      message: 'GRN stock movements posted',
      grnId: event.grnId,
      lineCount: event.lines?.length ?? 0,
    });
  }
}
