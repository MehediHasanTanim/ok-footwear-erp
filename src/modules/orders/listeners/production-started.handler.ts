import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ProductionStartedEvent } from '@modules/manufacturing/events/production-started.event';
import { PrismaService } from '@shared/database/prisma.service';
import { OrdersService } from '../services/orders.service';

@Injectable()
export class ProductionStartedHandler {
  private readonly logger = new Logger(ProductionStartedHandler.name);

  constructor(
    private readonly orders: OrdersService,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent('production.started')
  async handle(event: ProductionStartedEvent): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: event.orderId } });
    if (!order) {
      this.logger.warn({ message: 'Order not found for production.started', orderId: event.orderId });
      return;
    }

    if (order.status !== 'confirmed') {
      return;
    }

    if (!order.sampleApproved) {
      this.logger.warn({
        message: 'Skipping confirmed→in_production: sample not approved',
        orderId: event.orderId,
      });
      return;
    }

    try {
      await this.orders.transitionStatus(
        event.orderId,
        { toStatus: 'in_production' },
        event.startedBy,
      );
      this.logger.log({
        message: 'Order transitioned to in_production on production start',
        orderId: event.orderId,
      });
    } catch (err) {
      this.logger.error({
        message: 'Failed to transition order on production start',
        orderId: event.orderId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
