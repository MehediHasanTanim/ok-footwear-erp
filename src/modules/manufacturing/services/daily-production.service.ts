import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  DailyProductionQueryDto,
  RecordDailyProductionDto,
  UpdateDailyProductionDto,
} from '../dto/production.dto';

export interface DailyProductionRow {
  id: string;
  production_order_id: string;
  prod_date: Date;
  factory_line_id: string;
  operation_id: string;
  shift: string;
  target_qty: number;
  produced_qty: number;
  rejected_qty: number;
  efficiency_pct: Prisma.Decimal | number | null;
  supervisor_id: string | null;
  locked: boolean;
  created_at: Date;
}

@Injectable()
export class DailyProductionService {
  private readonly logger = new Logger(DailyProductionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(productionOrderId: string, dto: RecordDailyProductionDto, _userId: string) {
    const po = await this.prisma.productionOrder.findUnique({
      where: { id: productionOrderId },
      include: { order: { select: { articleId: true } } },
    });
    if (!po) {
      throw new NotFoundException({ statusCode: 404, message: 'Production order not found' });
    }
    if (po.status !== 'in_progress') {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'Daily entry requires production order in_progress',
      });
    }

    const line = await this.prisma.factoryLine.findUnique({ where: { id: dto.factoryLineId } });
    if (!line?.isActive) {
      throw new NotFoundException({ statusCode: 404, message: 'Factory line not found' });
    }

    const operation = await this.prisma.operation.findUnique({ where: { id: dto.operationId } });
    if (!operation) {
      throw new NotFoundException({ statusCode: 404, message: 'Operation not found' });
    }

    const routingCount = await this.prisma.articleRouting.count({
      where: { articleId: po.order.articleId, operationId: dto.operationId },
    });
    if (routingCount === 0) {
      this.logger.warn({
        message: 'Operation not in article routing — allowing entry',
        articleId: po.order.articleId,
        operationId: dto.operationId,
      });
    }

    const rows = await this.prisma.$queryRaw<DailyProductionRow[]>`
      INSERT INTO mfg.daily_productions (
        production_order_id, prod_date, factory_line_id, operation_id, shift,
        target_qty, produced_qty, rejected_qty, supervisor_id
      ) VALUES (
        ${productionOrderId}::uuid,
        ${dto.prodDate}::date,
        ${dto.factoryLineId}::uuid,
        ${dto.operationId}::uuid,
        ${dto.shift ?? 'day'},
        ${dto.targetQty ?? 0},
        ${dto.producedQty ?? 0},
        ${dto.rejectedQty ?? 0},
        ${dto.supervisorId ?? null}::uuid
      )
      RETURNING id, production_order_id, prod_date, factory_line_id, operation_id, shift,
                target_qty, produced_qty, rejected_qty, efficiency_pct, supervisor_id,
                locked, created_at
    `;

    await this.refreshProducedQty(productionOrderId);
    return this.toDto(rows[0]!);
  }

  async update(id: string, dto: UpdateDailyProductionDto) {
    const existing = await this.findRawById(id);
    if (!existing) {
      throw new NotFoundException({ statusCode: 404, message: 'Daily production entry not found' });
    }
    if (existing.locked) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'Daily production entry is locked and cannot be updated',
      });
    }

    const targetQty = dto.targetQty ?? existing.target_qty;
    const producedQty = dto.producedQty ?? existing.produced_qty;
    const rejectedQty = dto.rejectedQty ?? existing.rejected_qty;
    const supervisorId = dto.supervisorId ?? existing.supervisor_id;

    const rows = await this.prisma.$queryRaw<DailyProductionRow[]>`
      UPDATE mfg.daily_productions
      SET target_qty = ${targetQty},
          produced_qty = ${producedQty},
          rejected_qty = ${rejectedQty},
          supervisor_id = ${supervisorId}::uuid
      WHERE id = ${id}::uuid AND locked = FALSE
      RETURNING id, production_order_id, prod_date, factory_line_id, operation_id, shift,
                target_qty, produced_qty, rejected_qty, efficiency_pct, supervisor_id,
                locked, created_at
    `;

    if (rows.length === 0) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'Daily production entry is locked and cannot be updated',
      });
    }

    await this.refreshProducedQty(existing.production_order_id);
    return this.toDto(rows[0]!);
  }

  async list(productionOrderId: string, query: DailyProductionQueryDto) {
    const po = await this.prisma.productionOrder.findUnique({ where: { id: productionOrderId } });
    if (!po) {
      throw new NotFoundException({ statusCode: 404, message: 'Production order not found' });
    }

    const fromDate = query.fromDate ?? '1900-01-01';
    const toDate = query.toDate ?? '2099-12-31';

    const rows = await this.prisma.$queryRaw<DailyProductionRow[]>`
      SELECT id, production_order_id, prod_date, factory_line_id, operation_id, shift,
             target_qty, produced_qty, rejected_qty, efficiency_pct, supervisor_id,
             locked, created_at
      FROM mfg.daily_productions
      WHERE production_order_id = ${productionOrderId}::uuid
        AND prod_date >= ${fromDate}::date
        AND prod_date <= ${toDate}::date
      ORDER BY prod_date DESC, shift ASC
    `;

    return rows.map((r) => this.toDto(r));
  }

  async refreshProducedQty(productionOrderId: string): Promise<void> {
    const agg = await this.prisma.$queryRaw<{ total: bigint | number | null }[]>`
      SELECT COALESCE(SUM(produced_qty), 0)::bigint AS total
      FROM mfg.daily_productions
      WHERE production_order_id = ${productionOrderId}::uuid
    `;
    const total = Number(agg[0]?.total ?? 0);
    await this.prisma.productionOrder.update({
      where: { id: productionOrderId },
      data: { producedQty: total },
    });
  }

  private async findRawById(id: string): Promise<DailyProductionRow | null> {
    const rows = await this.prisma.$queryRaw<DailyProductionRow[]>`
      SELECT id, production_order_id, prod_date, factory_line_id, operation_id, shift,
             target_qty, produced_qty, rejected_qty, efficiency_pct, supervisor_id,
             locked, created_at
      FROM mfg.daily_productions
      WHERE id = ${id}::uuid
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  private toDto(row: DailyProductionRow) {
    return {
      id: row.id,
      productionOrderId: row.production_order_id,
      prodDate: row.prod_date,
      factoryLineId: row.factory_line_id,
      operationId: row.operation_id,
      shift: row.shift,
      targetQty: row.target_qty,
      producedQty: row.produced_qty,
      rejectedQty: row.rejected_qty,
      efficiencyPct: row.efficiency_pct != null ? Number(row.efficiency_pct) : null,
      supervisorId: row.supervisor_id,
      locked: row.locked,
      createdAt: row.created_at,
    };
  }
}
