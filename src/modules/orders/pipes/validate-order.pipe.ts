// =============================================================================
// ValidateOrderPipe — Resolves parent order and attaches to request
// =============================================================================
// OK Footwear ERP — Sprint 4, Orders Module
//
// Design Decision B (resolved): Inject PrismaService via NestJS DI.
// NestJS pipes CAN inject services when registered as @Injectable().
// This pipe resolves the parent order once and makes it available to
// all nested controllers via request.order, eliminating redundant
// prisma.order.findUniqueOrThrow calls in every service method.
//
// If DI injection causes issues in a specific NestJS version, the
// fallback is per-service validation (documented in the prompt).
// =============================================================================

import { Injectable, PipeTransform, ArgumentMetadata, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';

@Injectable()
export class ValidateOrderPipe implements PipeTransform<string, Promise<{ id: string; status: string; orderNumber: string }>> {
  constructor(private readonly prisma: PrismaService) {}

  async transform(orderId: string, _metadata: ArgumentMetadata) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, orderNumber: true },
    });

    if (!order) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Order not found',
        detail: `Order with ID '${orderId}' does not exist.`,
      });
    }

    return order;
  }
}
