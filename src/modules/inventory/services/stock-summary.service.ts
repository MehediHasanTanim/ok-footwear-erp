import {
  Injectable,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { REDIS_AUTH } from '@infrastructure/redis/redis.constants';
import { StockSummaryQueryDto } from '../dto/stock-counts.dto';

const LOCK_KEY = 'inv:stock_summary:refresh';
const LOCK_TTL = 300;

interface StockSummaryRow {
  item_id: string;
  item_code: string;
  name: string;
  category: string;
  uom: string;
  reorder_level: Prisma.Decimal | number;
  total_qty: Prisma.Decimal | number;
  total_value: Prisma.Decimal | number;
  avg_unit_cost: Prisma.Decimal | number;
  below_reorder: boolean;
}

@Injectable()
export class StockSummaryService {
  private readonly logger = new Logger(StockSummaryService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_AUTH) private readonly redis: Redis,
  ) {}

  async findAll(query: StockSummaryQueryDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const { belowReorder, category, search } = query;
    const skip = (page - 1) * limit;

    const filters: Prisma.Sql[] = [Prisma.sql`TRUE`];
    if (belowReorder === true) filters.push(Prisma.sql`below_reorder = TRUE`);
    if (belowReorder === false) filters.push(Prisma.sql`below_reorder = FALSE`);
    if (category) filters.push(Prisma.sql`category = ${category}`);
    if (search) filters.push(Prisma.sql`(name ILIKE ${'%' + search + '%'} OR item_code ILIKE ${'%' + search + '%'})`);
    const where = Prisma.join(filters, ' AND ');

    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRaw<StockSummaryRow[]>`
        SELECT * FROM inv.stock_summary
        WHERE ${where}
        ORDER BY item_code ASC
        LIMIT ${limit}::int OFFSET ${skip}::int
      `,
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM inv.stock_summary
        WHERE ${where}
      `,
    ]);

    const total = Number(countRows[0]?.count ?? 0);
    return {
      data: rows.map((r) => ({
        itemId: r.item_id,
        itemCode: r.item_code,
        name: r.name,
        category: r.category,
        uom: r.uom,
        reorderLevel: Number(r.reorder_level),
        totalQty: Number(r.total_qty),
        totalValue: Number(r.total_value),
        avgUnitCost: Number(r.avg_unit_cost),
        belowReorder: r.below_reorder,
      })),
      meta: { page, limit, totalItems: total, totalPages: Math.ceil(total / limit) || 0 },
    };
  }

  /**
   * REFRESH MATERIALIZED VIEW CONCURRENTLY behind Redis NX lock.
   * Callable from POST /inventory/stock-summary/refresh or k8s CronJob.
   */
  async refresh(): Promise<{ refreshed: boolean; reason?: string }> {
    const acquired = await this.redis.set(
      LOCK_KEY,
      process.pid.toString(),
      'EX',
      LOCK_TTL,
      'NX',
    );

    if (!acquired) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Stock summary refresh already in progress',
      });
    }

    try {
      await this.prisma.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY inv.stock_summary`;
      this.logger.log('inv.stock_summary refreshed (CONCURRENTLY)');
      return { refreshed: true };
    } finally {
      await this.redis.del(LOCK_KEY);
    }
  }
}
