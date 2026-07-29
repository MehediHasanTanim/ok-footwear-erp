// =============================================================================
// BuyersService — Buyer CRUD with soft-delete and trigram search
// =============================================================================
// OK Footwear ERP — Sprint 3, Orders Module
// =============================================================================

import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { Prisma } from '@prisma/client';
import {
  CreateBuyerDto,
  UpdateBuyerDto,
  BuyerQueryDto,
} from '../dto/buyers.dto';

/** Minimum pg_trgm similarity score for fuzzy buyer name search. */
const TRIGRAM_THRESHOLD = 0.15;

@Injectable()
export class BuyersService {
  private readonly logger = new Logger(BuyersService.name);

  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  // CRUD
  // =========================================================================

  async findAll(query: BuyerQueryDto) {
    const { page, limit, search, dropdown } = query;
    const skip = (page - 1) * limit;

    const select = dropdown
      ? { id: true, name: true }
      : {
          id: true,
          name: true,
          currency: true,
          paymentTerms: true,
          creditLimit: true,
          country: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        };

    if (search) {
      return this.findAllByTrigram(search, skip, limit, page, select);
    }

    const where: Prisma.BuyerWhereInput = {
      deletedAt: null,
      isActive: true,
    };

    const [data, total] = await Promise.all([
      this.prisma.buyer.findMany({
        skip,
        take: limit,
        where,
        select,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.buyer.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        totalItems: total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Fuzzy search via pg_trgm similarity (threshold 0.15).
   * Uses the GIN trigram index on ord.buyers.name.
   */
  private async findAllByTrigram(
    search: string,
    skip: number,
    limit: number,
    page: number,
    select: Prisma.BuyerSelect,
  ) {
    const [idRows, countRows] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id
        FROM ord.buyers
        WHERE deleted_at IS NULL
          AND is_active = true
          AND similarity(name, ${search}) > ${TRIGRAM_THRESHOLD}
        ORDER BY similarity(name, ${search}) DESC, created_at DESC
        LIMIT ${limit} OFFSET ${skip}
      `,
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count
        FROM ord.buyers
        WHERE deleted_at IS NULL
          AND is_active = true
          AND similarity(name, ${search}) > ${TRIGRAM_THRESHOLD}
      `,
    ]);

    const ids = idRows.map((r) => r.id);
    const total = Number(countRows[0]?.count ?? 0);

    if (ids.length === 0) {
      return {
        data: [],
        meta: {
          page,
          limit,
          totalItems: total,
          totalPages: Math.ceil(total / limit) || 0,
        },
      };
    }

    const rows = await this.prisma.buyer.findMany({
      where: { id: { in: ids } },
      select,
    });

    const byId = new Map(rows.map((r) => [r.id, r]));
    const data = ids.map((id) => byId.get(id)).filter(Boolean);

    return {
      data,
      meta: {
        page,
        limit,
        totalItems: total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const buyer = await this.prisma.buyer.findUnique({
      where: { id },
    });

    if (!buyer || buyer.deletedAt) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Buyer not found',
      });
    }

    return buyer;
  }

  async create(dto: CreateBuyerDto) {
    return this.prisma.buyer.create({
      data: {
        name: dto.name,
        currency: dto.currency.toUpperCase(),
        paymentTerms: dto.paymentTerms,
        creditLimit: dto.creditLimit,
        country: dto.country,
      },
    });
  }

  async update(id: string, dto: UpdateBuyerDto) {
    const buyer = await this.prisma.buyer.findUnique({ where: { id } });

    if (!buyer || buyer.deletedAt) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Buyer not found',
      });
    }

    return this.prisma.buyer.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.currency !== undefined && { currency: dto.currency.toUpperCase() }),
        ...(dto.paymentTerms !== undefined && { paymentTerms: dto.paymentTerms }),
        ...(dto.creditLimit !== undefined && { creditLimit: dto.creditLimit }),
        ...(dto.country !== undefined && { country: dto.country }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.isActive === false && { deletedAt: new Date() }),
        // Reactivate: clear deletedAt
        ...(dto.isActive === true && { deletedAt: null }),
      },
    });
  }

  /**
   * Soft-delete: sets is_active = false and deleted_at = now().
   * Never performs a hard DELETE.
   */
  async softDelete(id: string) {
    const buyer = await this.prisma.buyer.findUnique({ where: { id } });

    if (!buyer || buyer.deletedAt) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Buyer not found',
      });
    }

    return this.prisma.buyer.update({
      where: { id },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
    });
  }
}
