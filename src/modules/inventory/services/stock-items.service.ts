import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  CreateStockItemDto,
  UpdateStockItemDto,
  StockItemQueryDto,
} from '../dto/stock-items.dto';

const TRIGRAM_THRESHOLD = 0.15;

@Injectable()
export class StockItemsService {
  private readonly logger = new Logger(StockItemsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: StockItemQueryDto) {
    const { page, limit, search, category, belowReorder, isActive } = query;
    const skip = (page - 1) * limit;

    if (search) {
      return this.findByTrigram(search, skip, limit, page, category, isActive, belowReorder);
    }

    const where: Prisma.StockItemWhereInput = {};
    if (category) where.category = category;
    if (isActive !== undefined) where.isActive = isActive;

    const [rows, total] = await Promise.all([
      this.prisma.stockItem.findMany({
        where,
        skip,
        take: limit,
        orderBy: { itemCode: 'asc' },
        include: { balances: true },
      }),
      this.prisma.stockItem.count({ where }),
    ]);

    let data = rows.map((r) => this.withBelowReorder(r));
    if (belowReorder === true) {
      data = data.filter((d) => d.belowReorder);
    } else if (belowReorder === false) {
      data = data.filter((d) => !d.belowReorder);
    }

    return {
      data,
      meta: {
        page,
        limit,
        totalItems: belowReorder === undefined ? total : data.length,
        totalPages: Math.ceil((belowReorder === undefined ? total : data.length) / limit) || 0,
      },
    };
  }

  private async findByTrigram(
    search: string,
    skip: number,
    limit: number,
    page: number,
    category?: string,
    isActive?: boolean,
    belowReorder?: boolean,
  ) {
    const categoryClause = category ? Prisma.sql`AND category = ${category}` : Prisma.empty;
    const activeClause =
      isActive === undefined
        ? Prisma.empty
        : Prisma.sql`AND is_active = ${isActive}`;

    const [idRows, countRows] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM inv.stock_items
        WHERE similarity(name, ${search}) > ${TRIGRAM_THRESHOLD}
          ${categoryClause}
          ${activeClause}
        ORDER BY similarity(name, ${search}) DESC, created_at DESC
        LIMIT ${limit} OFFSET ${skip}
      `,
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM inv.stock_items
        WHERE similarity(name, ${search}) > ${TRIGRAM_THRESHOLD}
          ${categoryClause}
          ${activeClause}
      `,
    ]);

    const ids = idRows.map((r) => r.id);
    const total = Number(countRows[0]?.count ?? 0);
    if (ids.length === 0) {
      return { data: [], meta: { page, limit, totalItems: 0, totalPages: 0 } };
    }

    const rows = await this.prisma.stockItem.findMany({
      where: { id: { in: ids } },
      include: { balances: true },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    let data = ids
      .map((id) => byId.get(id))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => this.withBelowReorder(r));

    if (belowReorder === true) data = data.filter((d) => d.belowReorder);
    if (belowReorder === false) data = data.filter((d) => !d.belowReorder);

    return {
      data,
      meta: { page, limit, totalItems: total, totalPages: Math.ceil(total / limit) || 0 },
    };
  }

  private withBelowReorder<
    T extends { reorderLevel: Prisma.Decimal | number; balances: { quantity: Prisma.Decimal | number }[] },
  >(row: T) {
    const totalQty = row.balances.reduce((s, b) => s + Number(b.quantity), 0);
    const reorderLevel = Number(row.reorderLevel);
    const { balances: _b, ...rest } = row;
    return { ...rest, totalQty, belowReorder: totalQty <= reorderLevel };
  }

  async findOne(id: string) {
    const item = await this.prisma.stockItem.findUnique({
      where: { id },
      include: { balances: true },
    });
    if (!item) {
      throw new NotFoundException({ statusCode: 404, message: 'Stock item not found' });
    }
    return this.withBelowReorder(item);
  }

  async create(dto: CreateStockItemDto, userId: string) {
    try {
      return await this.prisma.stockItem.create({
        data: {
          itemCode: dto.itemCode.toUpperCase(),
          name: dto.name,
          category: dto.category,
          subCategory: dto.subCategory,
          uom: dto.uom ?? 'PCS',
          reorderLevel: dto.reorderLevel ?? 0,
          minStock: dto.minStock ?? 0,
          maxStock: dto.maxStock,
          leadTimeDays: dto.leadTimeDays ?? 7,
          hsnCode: dto.hsnCode || null,
          isActive: dto.isActive ?? true,
          createdBy: userId,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          statusCode: 409,
          message: 'Item code already exists',
        });
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateStockItemDto) {
    await this.findOne(id);
    try {
      return await this.prisma.stockItem.update({
        where: { id },
        data: {
          ...(dto.itemCode !== undefined && { itemCode: dto.itemCode.toUpperCase() }),
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.category !== undefined && { category: dto.category }),
          ...(dto.subCategory !== undefined && { subCategory: dto.subCategory }),
          ...(dto.uom !== undefined && { uom: dto.uom }),
          ...(dto.reorderLevel !== undefined && { reorderLevel: dto.reorderLevel }),
          ...(dto.minStock !== undefined && { minStock: dto.minStock }),
          ...(dto.maxStock !== undefined && { maxStock: dto.maxStock }),
          ...(dto.leadTimeDays !== undefined && { leadTimeDays: dto.leadTimeDays }),
          ...(dto.hsnCode !== undefined && { hsnCode: dto.hsnCode }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          statusCode: 409,
          message: 'Item code already exists',
        });
      }
      throw err;
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    const updated = await this.prisma.stockItem.update({
      where: { id },
      data: { isActive: false },
    });
    this.logger.log(`Stock item deactivated: ${id}`);
    return updated;
  }
}
