import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ProductionCompletedEvent } from '@modules/manufacturing/events/production-completed.event';
import { OrdersService } from '../services/orders.service';

@Injectable()
export class ProductionCompletedHandler {
  private readonly logger = new Logger(ProductionCompletedHandler.name);

  constructor(private readonly orders: OrdersService) {}

  @OnEvent('production.completed')
  async handle(event: ProductionCompletedEvent): Promise<void> {
    try {
      await this.orders.transitionStatus(
        event.orderId,
        { toStatus: 'qc' },
        event.completedBy,
      );
      this.logger.log({
        message: 'Order transitioned to qc after production QC pass',
        orderId: event.orderId,
        productionOrderId: event.productionOrderId,
      });
    } catch (err) {
      this.logger.error({
        message: 'Failed to transition order after production completed',
        orderId: event.orderId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }
}
