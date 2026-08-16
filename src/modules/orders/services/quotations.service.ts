// =============================================================================
// QuotationsService — Commercial quotations linked to orders
// =============================================================================
// OK Footwear ERP — Sprint 4, Orders Module
// =============================================================================

import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger, UnprocessableEntityException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@shared/database/prisma.service';
import { DocNumberService } from './doc-number.service';
import { CostSheetsService } from '@modules/manufacturing/services/cost-sheets.service';
import { QuotationWonEvent } from '../events/quotation-won.event';
import { CreateQuotationDto, UpdateQuotationDto, CloseQuotationDto } from '../dto/quotations.dto';

@Injectable()
export class QuotationsService {
  private readonly logger = new Logger(QuotationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly docNumber: DocNumberService,
    private readonly eventEmitter: EventEmitter2,
    private readonly costSheets: CostSheetsService,
  ) {}

  // =========================================================================
  // Create
  // =========================================================================

  async create(orderId: string, dto: CreateQuotationDto) {
    // Validate parent order exists and is not cancelled/delivered
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true },
    });

    if (!order) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Order not found',
        detail: `Order ${orderId} does not exist.`,
      });
    }

    if (order.status === 'cancelled' || order.status === 'delivered') {
      throw new BadRequestException({
        statusCode: 422,
        message: 'Cannot create quotation',
        detail: `Order status is '${order.status}'. Quotations can only be created on active orders.`,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const quotationNumber = await this.docNumber.generate(tx, 'QUO');

      const quotation = await tx.quotation.create({
        data: {
          quotationNumber,
          orderId,
          currency: dto.currency.toUpperCase(),
          ...(dto.quotedPrice !== undefined && { quotedPrice: dto.quotedPrice }),
          ...(dto.winProbability !== undefined && { winProbability: dto.winProbability }),
          ...(dto.bomVersionId !== undefined && { bomVersionId: dto.bomVersionId }),
        },
      });

      this.logger.log(`Quotation created: ${quotationNumber} for order ${orderId}`);
      return quotation;
    });
  }

  // =========================================================================
  // Query
  // =========================================================================

  async findByOrder(orderId: string) {
    return this.prisma.quotation.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(quotationId: string) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      include: {
        order: {
          select: { id: true, orderNumber: true, status: true },
        },
      },
    });

    if (!quotation) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Quotation not found',
      });
    }

    return quotation;
  }

  // =========================================================================
  // Update (draft only)
  // =========================================================================

  async update(quotationId: string, dto: UpdateQuotationDto) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
    });

    if (!quotation) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Quotation not found',
      });
    }

    if (quotation.status !== 'draft') {
      throw new BadRequestException({
        statusCode: 422,
        message: 'Cannot edit quotation',
        detail: `Quotation status is '${quotation.status}'. Only draft quotations can be edited.`,
      });
    }

    return this.prisma.quotation.update({
      where: { id: quotationId },
      data: {
        ...(dto.quotedPrice !== undefined && { quotedPrice: dto.quotedPrice }),
        ...(dto.winProbability !== undefined && { winProbability: dto.winProbability }),
        ...(dto.currency !== undefined && { currency: dto.currency.toUpperCase() }),
        ...(dto.bomVersionId !== undefined && { bomVersionId: dto.bomVersionId }),
      },
    });
  }

  // =========================================================================
  // Send (draft → sent)
  // =========================================================================

  async send(quotationId: string) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
    });

    if (!quotation) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Quotation not found',
      });
    }

    if (quotation.status !== 'draft') {
      throw new BadRequestException({
        statusCode: 422,
        message: 'Invalid status transition',
        detail: `Cannot send quotation with status '${quotation.status}'. Must be 'draft'.`,
      });
    }

    return this.prisma.quotation.update({
      where: { id: quotationId },
      data: { status: 'sent', sentAt: new Date() },
    });
  }

  // =========================================================================
  // Close (sent → won | lost)
  // =========================================================================

  async close(quotationId: string, dto: CloseQuotationDto) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
    });

    if (!quotation) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Quotation not found',
      });
    }

    if (quotation.status !== 'sent') {
      throw new BadRequestException({
        statusCode: 422,
        message: 'Invalid status transition',
        detail: `Cannot close quotation with status '${quotation.status}'. Must be 'sent'.`,
      });
    }

    // --- Won: enforce only-one-won-per-order ---
    if (dto.outcome === 'won') {
      const existingWon = await this.prisma.quotation.count({
        where: { orderId: quotation.orderId, status: 'won', id: { not: quotationId } },
      });

      if (existingWon > 0) {
        throw new ConflictException({
          statusCode: 409,
          message: 'Duplicate won quotation',
          detail: 'Another quotation for this order has already been marked as won. Only one won quotation is allowed per order.',
        });
      }
    }

    const updated = await this.prisma.quotation.update({
      where: { id: quotationId },
      data: {
        status: dto.outcome,
        closedAt: new Date(),
        ...(dto.outcomeReason !== undefined && { outcomeReason: dto.outcomeReason }),
      },
    });

    // --- Emit QuotationWonEvent post-commit for 'won' ---
    if (dto.outcome === 'won') {
      const event = new QuotationWonEvent({
        quotationId,
        orderId: quotation.orderId,
        quotedPrice: quotation.quotedPrice?.toNumber() ?? null,
      });

      this.eventEmitter.emit('quotation.won', event);
      this.logger.log(`Quotation won: ${quotation.quotationNumber}, event emitted`);
    }

    return updated;
  }

  // =========================================================================
  // Conversion Rate KPI
  // =========================================================================

  async getConversionRate(filters?: { buyerId?: string; dateRange?: { from: Date; to: Date } }) {
    const where: Record<string, unknown> = {};

    if (filters?.buyerId) {
      where['order'] = { buyerId: filters.buyerId };
    }

    if (filters?.dateRange) {
      where['closedAt'] = {
        gte: filters.dateRange.from,
        lte: filters.dateRange.to,
      };
    }

    // Using groupBy for clean aggregation — Prisma's groupBy is efficient
    // for counts and avoids raw SQL for maintainability.
    const [totalResult, wonResult] = await Promise.all([
      this.prisma.quotation.groupBy({
        by: ['status'],
        where: {
          ...where,
          status: { in: ['won', 'lost'] },
        } as any,
        _count: { status: true },
      }),
      this.prisma.quotation.count({
        where: { ...where, status: 'won' } as any,
      }),
    ]);

    const total = totalResult.reduce((sum, r) => sum + r._count.status, 0);
    const rate = total > 0 ? (wonResult / total) * 100 : 0;

    return {
      total,
      won: wonResult,
      rate: Math.round(rate * 100) / 100,
    };
  }

  /**
   * Fill quotation totalCost / quotedPrice from the BOM template cost sheet.
   */
  async autoPopulateCostFromBom(quotationId: string, bomVersionId: string) {
    const quotation = await this.prisma.quotation.findUnique({ where: { id: quotationId } });
    if (!quotation) {
      throw new NotFoundException({ statusCode: 404, message: 'Quotation not found' });
    }
    if (quotation.status !== 'draft') {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Only draft quotations can be populated from a BOM',
      });
    }

    const bom = await this.prisma.bomHeader.findUnique({ where: { id: bomVersionId } });
    if (!bom) {
      throw new NotFoundException({ statusCode: 404, message: 'BOM not found' });
    }
    if (bom.status !== 'approved') {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'Cost populate requires an approved BOM',
      });
    }

    const sheet = await this.costSheets.findByBom(bomVersionId);

    return this.prisma.quotation.update({
      where: { id: quotationId },
      data: {
        bomVersionId,
        totalCost: sheet.totalCost,
        quotedPrice: sheet.sellingPrice,
        costBreakdown: {
          materialCost: sheet.materialCost,
          trimsCost: sheet.trimsCost,
          labourCost: sheet.labourCost,
          overheadCost: sheet.overheadCost,
          targetMarginPct: sheet.targetMarginPct,
          sellingPrice: sheet.sellingPrice,
        },
      },
    });
  }
}
