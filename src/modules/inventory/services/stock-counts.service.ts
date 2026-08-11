import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DocNumberService } from '@modules/orders/services/doc-number.service';
import { StockTransactionsService } from './stock-transactions.service';
import {
  CreateStockCountDto,
  StockCountQueryDto,
  UpdateStockCountLineDto,
} from '../dto/stock-counts.dto';
import {
  canTransitionStockCount,
  type StockCountStatus,
} from '../state/stock-count-state-machine';

@Injectable()
export class StockCountsService {
  private readonly logger = new Logger(StockCountsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly docNumber: DocNumberService,
    private readonly stockTx: StockTransactionsService,
  ) {}

  /** Pure helper for TC-INV-U-004 — DB generated column remains source of truth on read. */
  computeVariance(systemQty: number, physicalQty: number): number {
    return physicalQty - systemQty;
  }

  async findAll(query: StockCountQueryDto) {
    const { page, limit, warehouseId, status } = query;
    const skip = (page - 1) * limit;
    const where: Prisma.StockCountWhereInput = {};
    if (warehouseId) where.warehouseId = warehouseId;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.stockCount.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { lines: true, warehouse: true },
      }),
      this.prisma.stockCount.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, totalItems: total, totalPages: Math.ceil(total / limit) || 0 },
    };
  }

  async findOne(id: string) {
    const count = await this.prisma.stockCount.findUnique({
      where: { id },
      include: { lines: { include: { item: true } }, warehouse: true },
    });
    if (!count) {
      throw new NotFoundException({ statusCode: 404, message: 'Stock count not found' });
    }
    return count;
  }

  async create(dto: CreateStockCountDto, userId: string) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: dto.warehouseId },
    });
    if (!warehouse || !warehouse.isActive) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Warehouse not found or inactive',
      });
    }

    // Snapshot: balance rows for this warehouse (qty >= 0) for active items
    const balances = await this.prisma.stockBalance.findMany({
      where: {
        warehouseId: dto.warehouseId,
        item: { isActive: true },
      },
      include: { item: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const countNumber = await this.docNumber.generate(tx, 'STC');
      const count = await tx.stockCount.create({
        data: {
          countNumber,
          warehouseId: dto.warehouseId,
          countDate: dto.countDate ? new Date(dto.countDate) : undefined,
          createdBy: userId,
          status: 'open',
          lines: {
            create: balances.map((b) => ({
              itemId: b.itemId,
              systemQty: b.quantity,
            })),
          },
        },
        include: { lines: true },
      });
      this.logger.log(`Stock count ${countNumber} created with ${balances.length} lines`);
      return count;
    });
  }

  async updateLine(countId: string, lineId: string, dto: UpdateStockCountLineDto) {
    const count = await this.findOne(countId);
    if (!['open', 'counting'].includes(count.status)) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Cannot edit lines in current status',
        detail: `Status is ${count.status}`,
      });
    }
    const line = count.lines.find((l) => l.id === lineId);
    if (!line) {
      throw new NotFoundException({ statusCode: 404, message: 'Count line not found' });
    }

    const [, updated] = await this.prisma.$transaction([
      this.prisma.stockCount.update({
        where: { id: countId },
        data: { status: count.status === 'open' ? 'counting' : count.status },
      }),
      this.prisma.stockCountLine.update({
        where: { id: lineId },
        data: {
          physicalQty: dto.physicalQty,
          ...(dto.varianceReason !== undefined && { varianceReason: dto.varianceReason }),
        },
      }),
    ]);

    return updated;
  }

  async submit(id: string) {
    const count = await this.findOne(id);
    this.assertTransition(count.status as StockCountStatus, 'variance_review');

    const missing = count.lines.filter((l) => l.physicalQty === null);
    if (missing.length > 0) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'All lines must have physical_qty before submit',
        detail: `${missing.length} line(s) missing physical quantity`,
      });
    }

    return this.prisma.stockCount.update({
      where: { id },
      data: { status: 'variance_review' },
      include: { lines: true },
    });
  }

  async approve(id: string, userId: string) {
    const count = await this.findOne(id);
    this.assertTransition(count.status as StockCountStatus, 'approved');

    for (const line of count.lines) {
      if (line.physicalQty === null) continue;
      const variance = this.computeVariance(Number(line.systemQty), Number(line.physicalQty));
      if (variance === 0) continue;

      await this.stockTx.recordMovement(
        {
          txnType: variance > 0 ? 'adjustment_in' : 'adjustment_out',
          direction: variance > 0 ? 1 : -1,
          itemId: line.itemId,
          warehouseId: count.warehouseId,
          quantity: Math.abs(variance),
          sourceModule: 'inv',
          sourceId: count.id,
          remarks: `Stock count ${count.countNumber} variance`,
        },
        userId,
      );
    }

    return this.prisma.stockCount.update({
      where: { id },
      data: {
        status: 'approved',
        approvedBy: userId,
        approvedAt: new Date(),
      },
      include: { lines: true },
    });
  }

  async cancel(id: string) {
    const count = await this.findOne(id);
    this.assertTransition(count.status as StockCountStatus, 'cancelled');
    return this.prisma.stockCount.update({
      where: { id },
      data: { status: 'cancelled' },
    });
  }

  private assertTransition(from: StockCountStatus, to: StockCountStatus) {
    if (!canTransitionStockCount(from, to)) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Invalid stock count status transition',
        detail: `Cannot transition from ${from} to ${to}`,
      });
    }
  }
}
