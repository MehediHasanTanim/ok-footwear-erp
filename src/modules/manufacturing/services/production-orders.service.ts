import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BomService } from './bom.service';
import {
  CreateProductionOrderDto,
  ProductionOrderQueryDto,
  UpdateProductionOrderDto,
} from '../dto/production.dto';
import {
  ProductionOrderStatus,
  validateProductionTransition,
} from '../interfaces/production-order-status.enum';
import { ProductionStartedEvent } from '../events/production-started.event';

const PO_INCLUDE = {
  order: { select: { id: true, orderNumber: true, status: true, articleId: true } },
  factoryLine: true,
  bom: { select: { id: true, version: true, status: true, articleId: true } },
} satisfies Prisma.ProductionOrderInclude;

export interface SizePlanEntry {
  sizeLabel: string;
  plannedQty: number;
}

@Injectable()
export class ProductionOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bom: BomService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(dto: CreateProductionOrderDto, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { orderLines: true },
    });
    if (!order) {
      throw new NotFoundException({ statusCode: 404, message: 'Order not found' });
    }
    if (!['confirmed', 'in_production'].includes(order.status)) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'Production order requires order status confirmed or in_production',
      });
    }

    await this.bom.assertApprovedBom(order.articleId);

    let bomId = dto.bomId;
    if (!bomId) {
      const active = await this.prisma.bomHeader.findFirst({
        where: { articleId: order.articleId, status: 'approved' },
        select: { id: true },
      });
      if (!active) {
        throw new UnprocessableEntityException({
          statusCode: 422,
          message: 'No approved BOM for this article',
        });
      }
      bomId = active.id;
    } else {
      const bom = await this.prisma.bomHeader.findUnique({ where: { id: bomId } });
      if (!bom || bom.articleId !== order.articleId || bom.status !== 'approved') {
        throw new UnprocessableEntityException({
          statusCode: 422,
          message: 'BOM must be approved and belong to the order article',
        });
      }
    }

    if (dto.factoryLineId) {
      const line = await this.prisma.factoryLine.findUnique({ where: { id: dto.factoryLineId } });
      if (!line?.isActive) {
        throw new NotFoundException({ statusCode: 404, message: 'Factory line not found' });
      }
    }

    const sizePlan = this.buildSizePlan(order.orderLines, dto.sizePlan);
    const plannedQty = sizePlan.reduce((sum, s) => sum + s.plannedQty, 0);
    if (plannedQty <= 0) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'Planned quantity must be greater than zero',
      });
    }

    const created = await this.prisma.productionOrder.create({
      data: {
        orderId: dto.orderId,
        factoryLineId: dto.factoryLineId,
        bomId,
        plannedQty,
        sizePlan: sizePlan as unknown as Prisma.InputJsonValue,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        status: 'planned',
        createdBy: userId,
      },
      include: PO_INCLUDE,
    });

    return this.toDto(created);
  }

  async findAll(query: ProductionOrderQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.ProductionOrderWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.orderId) where.orderId = query.orderId;

    const [rows, total] = await Promise.all([
      this.prisma.productionOrder.findMany({
        where,
        include: PO_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.productionOrder.count({ where }),
    ]);

    return {
      data: rows.map((r) => this.toDto(r)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const po = await this.prisma.productionOrder.findUnique({
      where: { id },
      include: PO_INCLUDE,
    });
    if (!po) {
      throw new NotFoundException({ statusCode: 404, message: 'Production order not found' });
    }
    return this.toDto(po);
  }

  async update(id: string, dto: UpdateProductionOrderDto) {
    const existing = await this.prisma.productionOrder.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({ statusCode: 404, message: 'Production order not found' });
    }
    if (existing.status !== 'planned') {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'Only planned production orders can be updated',
      });
    }

    let sizePlan = existing.sizePlan as SizePlanEntry[] | null;
    let plannedQty = existing.plannedQty;
    if (dto.sizePlan) {
      sizePlan = dto.sizePlan;
      plannedQty = sizePlan.reduce((sum, s) => sum + s.plannedQty, 0);
    }

    const updated = await this.prisma.productionOrder.update({
      where: { id },
      data: {
        factoryLineId: dto.factoryLineId,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        sizePlan: sizePlan as unknown as Prisma.InputJsonValue,
        plannedQty,
      },
      include: PO_INCLUDE,
    });

    return this.toDto(updated);
  }

  async start(id: string, userId: string) {
    return this.transitionStatus(id, 'in_progress', userId, true);
  }

  async hold(id: string) {
    return this.transitionStatus(id, 'on_hold');
  }

  async transitionStatus(
    id: string,
    toStatus: ProductionOrderStatus,
    userId?: string,
    emitStarted = false,
  ) {
    const po = await this.prisma.productionOrder.findUnique({
      where: { id },
      include: PO_INCLUDE,
    });
    if (!po) {
      throw new NotFoundException({ statusCode: 404, message: 'Production order not found' });
    }

    validateProductionTransition(po.status as ProductionOrderStatus, toStatus);

    const data: Prisma.ProductionOrderUpdateInput = { status: toStatus };
    if (toStatus === 'in_progress' && !po.startDate) {
      data.startDate = new Date();
    }
    if (toStatus === 'completed') {
      data.endDate = new Date();
    }

    const updated = await this.prisma.productionOrder.update({
      where: { id },
      data,
      include: PO_INCLUDE,
    });

    if (emitStarted && toStatus === 'in_progress' && userId) {
      this.eventEmitter.emit(
        'production.started',
        new ProductionStartedEvent({
          productionOrderId: id,
          orderId: po.orderId,
          startedBy: userId,
        }),
      );
    }

    return this.toDto(updated);
  }

  async markCompleted(id: string) {
    return this.transitionStatus(id, 'completed');
  }

  private buildSizePlan(
    orderLines: { sizeLabel: string; quantity: number }[],
    overrides?: SizePlanEntry[],
  ): SizePlanEntry[] {
    if (overrides?.length) {
      return overrides;
    }
    return orderLines.map((l) => ({ sizeLabel: l.sizeLabel, plannedQty: l.quantity }));
  }

  private toDto(
    po: Prisma.ProductionOrderGetPayload<{ include: typeof PO_INCLUDE }>,
  ) {
    return {
      id: po.id,
      orderId: po.orderId,
      order: po.order,
      factoryLineId: po.factoryLineId,
      factoryLine: po.factoryLine,
      bomId: po.bomId,
      bom: po.bom,
      plannedQty: po.plannedQty,
      producedQty: po.producedQty,
      sizePlan: po.sizePlan as unknown as SizePlanEntry[],
      startDate: po.startDate,
      endDate: po.endDate,
      status: po.status,
      createdAt: po.createdAt,
      updatedAt: po.updatedAt,
      createdBy: po.createdBy,
    };
  }
}
