// =============================================================================
// OrdersService — Order CRUD, state machine, milestones, events
// =============================================================================
// OK Footwear ERP — Sprint 3, Orders Module
// =============================================================================

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from '@shared/database/prisma.service';
import { Prisma } from '@prisma/client';
import {
  CreateOrderDto,
  UpdateOrderDto,
  OrderQueryDto,
  StatusTransitionDto,
  OrderResponseDto,
} from '../dto/orders.dto';
import {
  OrderStatus,
  validateTransition,
} from './order-state-machine';
import { OrderConfirmedEvent } from '../events/order-confirmed.event';
import { DocNumberService } from './doc-number.service';

// =========================================================================
// Milestone Lead-Time Constants
// =========================================================================
// PLACEHOLDER VALUES — Tanim, tune these based on actual factory lead times.
// Each constant represents the number of days BEFORE delivery_date that
// the milestone is planned.
//
// Example: if delivery_date is Dec 31, and SHIPMENT_LEAD_DAYS = 7,
// then shipment planned_date = Dec 24.
//
// These are used ONLY for planning — they do not enforce constraints
// elsewhere in the DB or application.
// =========================================================================

/** Days before delivery: shipment (booking, docs, container) */
export const SHIPMENT_LEAD_DAYS = 7;

/** Days before delivery: packing (carton marking, stuffing plan) */
export const PACKING_LEAD_DAYS = 14;

/** Days before delivery: QC (final inspection, AQL sampling) */
export const QC_LEAD_DAYS = 21;

/** Days before delivery: bulk production start */
export const BULK_START_LEAD_DAYS = 60;

/** Days before delivery: PP sample submission */
export const PP_SAMPLE_LEAD_DAYS = 75;

/** Days before delivery: material booking (leather, sole, accessories) */
export const MATERIAL_BOOKING_LEAD_DAYS = 90;

const ORDER_DETAIL_INCLUDE = {
  buyer: { select: { name: true, currency: true } },
  article: { select: { code: true, description: true } },
  orderLines: true,
} as const;

const ORDER_FULL_INCLUDE = {
  ...ORDER_DETAIL_INCLUDE,
  milestones: {
    orderBy: { plannedDate: 'asc' as const },
  },
};

// =========================================================================
// Service
// =========================================================================

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly docNumber: DocNumberService,
  ) {}

  // =========================================================================
  // Serialization
  // =========================================================================

  private toResponse(order: unknown): OrderResponseDto {
    const raw = order as Record<string, unknown>;
    const lines = Array.isArray(raw['orderLines']) ? raw['orderLines'] : [];

    const normalized = {
      ...raw,
      orderLines: lines.map((line: Record<string, unknown>) => ({
        ...line,
        unitPrice:
          line['unitPrice'] != null ? Number(String(line['unitPrice'])) : null,
      })),
    };

    return plainToInstance(OrderResponseDto, normalized, {
      excludeExtraneousValues: true,
    });
  }

  // =========================================================================
  // Query
  // =========================================================================

  async findAll(query: OrderQueryDto) {
    const { page, limit, status, buyerId, deliveryDateFrom, deliveryDateTo } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {};

    if (status) {
      where.status = status as Prisma.EnumOrderStatusFilter['equals'];
    }

    if (buyerId) {
      where.buyerId = buyerId;
    }

    if (deliveryDateFrom || deliveryDateTo) {
      where.deliveryDate = {};
      if (deliveryDateFrom) {
        (where.deliveryDate as Prisma.DateTimeFilter).gte = new Date(deliveryDateFrom);
      }
      if (deliveryDateTo) {
        (where.deliveryDate as Prisma.DateTimeFilter).lte = new Date(deliveryDateTo);
      }
    }

    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        skip,
        take: limit,
        where,
        include: ORDER_DETAIL_INCLUDE,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.toResponse(row)),
      meta: {
        page,
        limit,
        totalItems: total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: ORDER_FULL_INCLUDE,
    });

    if (!order) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Order not found',
      });
    }

    return this.toResponse(order);
  }

  // =========================================================================
  // Create
  // =========================================================================

  /**
   * Creates a new order inside a transaction:
   * 1. Validates buyer and article exist and are active
   * 2. Validates sum(orderLines.quantity) === totalQuantity
   * 3. Calls next_doc_number() to get a unique, concurrency-safe order number
   * 4. Inserts order + order_lines in the same transaction
   *
   * The order is always created in 'draft' status.
   */
  async create(dto: CreateOrderDto): Promise<OrderResponseDto> {
    // Validate sum (done by class-validator, but double-check in service
    // as a defense-in-depth measure)
    const lineSum = dto.orderLines.reduce((s, l) => s + l.quantity, 0);
    if (lineSum !== dto.totalQuantity) {
      throw new BadRequestException({
        statusCode: 422,
        message: 'Validation failed',
        errors: [
          {
            field: 'orderLines',
            message: `Sum of orderLines quantities (${lineSum}) must equal totalQuantity (${dto.totalQuantity})`,
          },
        ],
      });
    }

    const order = await this.prisma.$transaction(async (tx) => {
      // Validate buyer
      const buyer = await tx.buyer.findUnique({
        where: { id: dto.buyerId },
        select: { id: true, isActive: true, deletedAt: true },
      });

      if (!buyer || !buyer.isActive || buyer.deletedAt) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'Invalid buyer',
          detail: 'Buyer not found or is inactive.',
          field: 'buyerId',
        });
      }

      // Validate article
      const article = await tx.article.findUnique({
        where: { id: dto.articleId },
        select: { id: true, isActive: true, deletedAt: true },
      });

      if (!article || !article.isActive || article.deletedAt) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'Invalid article',
          detail: 'Article not found or is inactive.',
          field: 'articleId',
        });
      }

      const orderNumber = await this.docNumber.generate(tx, 'ORD');

      return tx.order.create({
        data: {
          orderNumber,
          buyerId: dto.buyerId,
          articleId: dto.articleId,
          status: 'draft',
          totalQuantity: dto.totalQuantity,
          deliveryDate: new Date(dto.deliveryDate),
          currency: dto.currency.toUpperCase(),
          orderLines: {
            create: dto.orderLines.map((line) => ({
              sizeLabel: line.sizeLabel,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
            })),
          },
        },
        include: ORDER_DETAIL_INCLUDE,
      });
    });

    this.logger.log(`Order created: ${order.orderNumber} (id: ${order.id})`);

    return this.toResponse(order);
  }

  // =========================================================================
  // Update (draft-only mutable fields)
  // =========================================================================

  /**
   * Updates mutable fields on a draft order.
   * Rejects edits to orders that are confirmed or beyond.
   */
  async update(id: string, dto: UpdateOrderDto) {
    const order = await this.prisma.order.findUnique({ where: { id } });

    if (!order) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Order not found',
      });
    }

    if (order.status !== 'draft') {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Cannot edit order',
        detail: `Order status is '${order.status}'. Only draft orders can be edited.`,
      });
    }

    // If articleId changed, validate new article
    if (dto.articleId && dto.articleId !== order.articleId) {
      const article = await this.prisma.article.findUnique({
        where: { id: dto.articleId },
        select: { id: true, isActive: true, deletedAt: true },
      });

      if (!article || !article.isActive || article.deletedAt) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'Invalid article',
          detail: 'Article not found or is inactive.',
          field: 'articleId',
        });
      }
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        ...(dto.articleId !== undefined && { articleId: dto.articleId }),
        ...(dto.totalQuantity !== undefined && { totalQuantity: dto.totalQuantity }),
        ...(dto.deliveryDate !== undefined && { deliveryDate: new Date(dto.deliveryDate) }),
        ...(dto.currency !== undefined && { currency: dto.currency.toUpperCase() }),
        ...(dto.sampleApproved !== undefined && { sampleApproved: dto.sampleApproved }),
      },
      include: ORDER_DETAIL_INCLUDE,
    });

    return this.toResponse(updated);
  }

  // =========================================================================
  // Status Transition
  // =========================================================================

  /**
   * Performs a status transition on an order.
   *
   * Validates the transition against STATUS_TRANSITIONS map.
   * Special handling:
   *   - draft → confirmed: sets confirmed_at/confirmed_by, generates milestones,
   *     and emits OrderConfirmedEvent AFTER the transaction commits.
   *   - → cancelled: requires cancellation_reason, sets cancelled_at.
   *
   * @param userId Authenticated user UUID (JWT `sub`) required when confirming.
   */
  async transitionStatus(id: string, dto: StatusTransitionDto, userId?: string) {
    const toStatus = dto.toStatus as OrderStatus;

    // Fetch current order state
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { orderLines: true },
    });

    if (!order) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Order not found',
      });
    }

    const fromStatus = order.status as OrderStatus;

    // Validate transition (throws BadRequestException if invalid)
    validateTransition(fromStatus, toStatus, order.sampleApproved);

    // ── Cancellation path ──────────────────────────────────────────────
    if (toStatus === 'cancelled') {
      if (!dto.cancellationReason) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'Cancellation reason required',
          detail: 'cancellationReason is required when cancelling an order.',
        });
      }

      const cancelled = await this.prisma.order.update({
        where: { id },
        data: {
          status: toStatus,
          cancelledAt: new Date(),
          cancellationReason: dto.cancellationReason,
        },
        include: ORDER_FULL_INCLUDE,
      });

      return this.toResponse(cancelled);
    }

    // ── Confirmation path ─────────────────────────────────────────────
    if (fromStatus === 'draft' && toStatus === 'confirmed') {
      if (!userId) {
        throw new UnauthorizedException({
          statusCode: 401,
          message: 'Authenticated user required to confirm an order',
        });
      }

      const confirmedBy = userId;

      // Run confirm + milestone generation in a single transaction.
      // If milestone generation fails, the entire transaction rolls back
      // and the order stays in 'draft'.
      const result = await this.prisma.$transaction(async (tx) => {
        // Update order status
        const updated = await tx.order.update({
          where: { id },
          data: {
            status: toStatus,
            confirmedAt: new Date(),
            confirmedBy,
          },
          include: ORDER_DETAIL_INCLUDE,
        });

        // Generate milestones
        await this.generateMilestonesInTx(tx, id, updated.deliveryDate);

        return updated;
      });

      // Emit event AFTER the transaction commits.
      // This is critical: listeners in Procurement/Manufacturing must only
      // react to durably-committed state.
      const event = new OrderConfirmedEvent({
        orderId: id,
        deliveryDate: order.deliveryDate,
        buyerId: order.buyerId,
        confirmedBy,
      });

      this.eventEmitter.emit('order.confirmed', event);

      this.logger.log(
        `Order confirmed: ${order.orderNumber} → milestones generated, OrderConfirmedEvent emitted`,
      );

      return this.toResponse(result);
    }

    // ── All other transitions ─────────────────────────────────────────
    const updated = await this.prisma.order.update({
      where: { id },
      data: { status: toStatus },
      include: ORDER_FULL_INCLUDE,
    });

    return this.toResponse(updated);
  }

  // =========================================================================
  // Cancel (convenience wrapper)
  // =========================================================================

  /**
   * Thin wrapper around transitionStatus for DELETE /orders/:id.
   * Maps to the cancel transition, not a hard delete.
   */
  async cancel(id: string, reason?: string) {
    return this.transitionStatus(id, {
      toStatus: 'cancelled',
      cancellationReason: reason ?? 'Cancelled via API',
    });
  }

  // =========================================================================
  // Milestone Generation
  // =========================================================================

  /**
   * Generate all 6 order_milestones rows for a confirmed order.
   *
   * Called ONLY from the draft → confirmed transition (never on create,
   * never on any other transition).
   *
   * planned_date for each milestone is back-calculated from delivery_date
   * using the lead-time constants defined at the top of this file.
   *
   * This method runs inside the confirmation transaction — if it fails,
   * the entire confirmation rolls back.
   */
  private async generateMilestonesInTx(
    tx: Prisma.TransactionClient,
    orderId: string,
    deliveryDate: Date,
  ): Promise<void> {
    const del = new Date(deliveryDate);

    const milestones: Prisma.OrderMilestoneCreateManyInput[] = [
      {
        orderId,
        milestoneType: 'material_booking',
        plannedDate: addDays(del, -MATERIAL_BOOKING_LEAD_DAYS),
        status: 'pending',
      },
      {
        orderId,
        milestoneType: 'pp_sample',
        plannedDate: addDays(del, -PP_SAMPLE_LEAD_DAYS),
        status: 'pending',
      },
      {
        orderId,
        milestoneType: 'bulk_start',
        plannedDate: addDays(del, -BULK_START_LEAD_DAYS),
        status: 'pending',
      },
      {
        orderId,
        milestoneType: 'qc',
        plannedDate: addDays(del, -QC_LEAD_DAYS),
        status: 'pending',
      },
      {
        orderId,
        milestoneType: 'packing',
        plannedDate: addDays(del, -PACKING_LEAD_DAYS),
        status: 'pending',
      },
      {
        orderId,
        milestoneType: 'shipment',
        plannedDate: addDays(del, -SHIPMENT_LEAD_DAYS),
        status: 'pending',
      },
    ];

    // Bulk-create all 6 milestones in one query
    await tx.orderMilestone.createMany({
      data: milestones,
    });

    this.logger.log(
      `Generated 6 milestones for order ${orderId} (delivery: ${deliveryDate.toISOString().split('T')[0]})`,
    );
  }
}

// ---------------------------------------------------------------------------
// Helper: add/subtract days from a Date (pure function, no mutation)
// ---------------------------------------------------------------------------

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
