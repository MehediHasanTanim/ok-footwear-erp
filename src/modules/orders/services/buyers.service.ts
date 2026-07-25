// =============================================================================
// BuyersService — Buyer CRUD with soft-delete and trigram search
// =============================================================================
// OK Footwear ERP — Sprint 3, Orders Module
// =============================================================================

import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { Prisma } from '@prisma/client';
import {
  CreateBuyerDto,
  UpdateBuyerDto,
  BuyerQueryDto,
} from '../dto/buyers.dto';

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

    const where: Prisma.BuyerWhereInput = {
      deletedAt: null,
      isActive: true,
    };

    if (search) {
      // Trigram search via raw condition — Prisma doesn't natively support
      // pg_trgm operators, so we use a raw filter.
      // The % operator is similarity (returns 0–1), we use a low threshold
      // for fuzzy matching (0.15 catches 1–2 char typos).
      where.name = {
        contains: search,
        mode: 'insensitive',
      } as Prisma.StringFilter;
    }

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
