import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DocNumberService } from '@modules/orders/services/doc-number.service';
import {
  RecordMovementDto,
  StockTransactionQueryDto,
} from '../dto/stock-transactions.dto';
import { StockBelowReorderEvent } from '../events/stock-below-reorder.event';

export interface StockTxnRow {
  id: string;
  txn_date: Date;
  txn_number: string;
  txn_type: string;
  item_id: string;
  warehouse_id: string;
  quantity: Prisma.Decimal | number;
  direction: number;
  unit_cost: Prisma.Decimal | number | null;
  batch_lot: string | null;
  source_module: string | null;
  source_id: string | null;
  remarks: string | null;
  created_at: Date;
  created_by: string;
}

@Injectable()
export class StockTransactionsService {
  private readonly logger = new Logger(StockTransactionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly docNumber: DocNumberService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Append-only stock movement. INSERT only — never update/delete the ledger.
   * Balance is maintained by DB trigger inv.update_stock_balance.
   */
  async recordMovement(dto: RecordMovementDto, userId: string) {
    const item = await this.prisma.stockItem.findUnique({ where: { id: dto.itemId } });
    if (!item || !item.isActive) {
      throw new NotFoundException({ statusCode: 404, message: 'Stock item not found or inactive' });
    }
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: dto.warehouseId },
    });
    if (!warehouse || !warehouse.isActive) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Warehouse not found or inactive',
      });
    }

    if (dto.direction === -1) {
      const bal = await this.prisma.stockBalance.findUnique({
        where: {
          itemId_warehouseId: { itemId: dto.itemId, warehouseId: dto.warehouseId },
        },
      });
      const available = Number(bal?.quantity ?? 0);
      if (available < dto.quantity) {
        throw new UnprocessableEntityException({
          statusCode: 422,
          message: 'Insufficient stock',
          detail: `Available ${available}, requested ${dto.quantity}`,
        });
      }
    }

    const txnDate = dto.txnDate ?? new Date().toISOString().slice(0, 10);
    const sourceIdSql = dto.sourceId
      ? Prisma.sql`${dto.sourceId}::uuid`
      : Prisma.sql`NULL`;

    const row = await this.prisma.$transaction(async (tx) => {
      const txnNumber = await this.docNumber.generate(tx, 'STXN');

      const inserted = await tx.$queryRaw<StockTxnRow[]>`
        INSERT INTO inv.stock_transactions (
          txn_date, txn_number, txn_type, item_id, warehouse_id,
          quantity, direction, unit_cost, batch_lot, source_module, source_id, remarks, created_by
        ) VALUES (
          ${txnDate}::date,
          ${txnNumber},
          ${dto.txnType},
          ${dto.itemId}::uuid,
          ${dto.warehouseId}::uuid,
          ${dto.quantity},
          ${dto.direction},
          ${dto.unitCost ?? null},
          ${dto.batchLot ?? null},
          ${dto.sourceModule ?? null},
          ${sourceIdSql},
          ${dto.remarks ?? null},
          ${userId}::uuid
        )
        RETURNING *
      `;

      return inserted[0]!;
    });

    await this.checkReorderLevel(dto.itemId, dto.warehouseId);

    this.logger.log(`Stock txn ${row.txn_number} recorded (${dto.txnType})`);
    return this.mapRow(row);
  }

  async checkReorderLevel(itemId: string, warehouseId?: string): Promise<void> {
    const item = await this.prisma.stockItem.findUnique({ where: { id: itemId } });
    if (!item) return;

    const agg = await this.prisma.stockBalance.aggregate({
      where: { itemId },
      _sum: { quantity: true },
    });
    const totalQty = Number(agg._sum.quantity ?? 0);
    const reorderLevel = Number(item.reorderLevel);

    if (totalQty <= reorderLevel) {
      this.eventEmitter.emit(
        'stock.below_reorder',
        new StockBelowReorderEvent({
          itemId,
          warehouseId,
          quantity: totalQty,
          reorderLevel,
          totalQty,
        }),
      );
    }
  }

  async findAll(query: StockTransactionQueryDto) {
    const { page, limit, itemId, warehouseId, txnType, fromDate, toDate } = query;
    const skip = (page - 1) * limit;

    const filters: Prisma.Sql[] = [Prisma.sql`TRUE`];
    if (itemId) filters.push(Prisma.sql`item_id = ${itemId}::uuid`);
    if (warehouseId) filters.push(Prisma.sql`warehouse_id = ${warehouseId}::uuid`);
    if (txnType) filters.push(Prisma.sql`txn_type = ${txnType}`);
    if (fromDate) filters.push(Prisma.sql`txn_date >= ${fromDate}::date`);
    if (toDate) filters.push(Prisma.sql`txn_date <= ${toDate}::date`);
    const where = Prisma.join(filters, ' AND ');

    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRaw<StockTxnRow[]>`
        SELECT * FROM inv.stock_transactions
        WHERE ${where}
        ORDER BY txn_date DESC, created_at DESC
        LIMIT ${limit} OFFSET ${skip}
      `,
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM inv.stock_transactions
        WHERE ${where}
      `,
    ]);

    const total = Number(countRows[0]?.count ?? 0);
    return {
      data: rows.map((r) => this.mapRow(r)),
      meta: { page, limit, totalItems: total, totalPages: Math.ceil(total / limit) || 0 },
    };
  }

  async findBalance(itemId: string, warehouseId: string) {
    return this.prisma.stockBalance.findUnique({
      where: { itemId_warehouseId: { itemId, warehouseId } },
    });
  }

  private mapRow(row: StockTxnRow) {
    return {
      id: row.id,
      txnDate: row.txn_date,
      txnNumber: row.txn_number,
      txnType: row.txn_type,
      itemId: row.item_id,
      warehouseId: row.warehouse_id,
      quantity: Number(row.quantity),
      direction: row.direction,
      unitCost: row.unit_cost === null ? null : Number(row.unit_cost),
      batchLot: row.batch_lot,
      sourceModule: row.source_module,
      sourceId: row.source_id,
      remarks: row.remarks,
      createdAt: row.created_at,
      createdBy: row.created_by,
    };
  }
}
