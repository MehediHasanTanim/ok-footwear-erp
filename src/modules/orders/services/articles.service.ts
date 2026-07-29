// =============================================================================
// ArticlesService — Article CRUD with soft-delete and trigram search
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
  CreateArticleDto,
  UpdateArticleDto,
  ArticleQueryDto,
} from '../dto/articles.dto';

/** Minimum pg_trgm similarity score for fuzzy article search. */
const TRIGRAM_THRESHOLD = 0.15;

@Injectable()
export class ArticlesService {
  private readonly logger = new Logger(ArticlesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  // CRUD
  // =========================================================================

  async findAll(query: ArticleQueryDto) {
    const { page, limit, search, category, season } = query;
    const skip = (page - 1) * limit;

    if (search) {
      return this.findAllByTrigram(search, skip, limit, page, category, season);
    }

    const where: Prisma.ArticleWhereInput = {
      deletedAt: null,
      isActive: true,
    };

    if (category) {
      where.category = category;
    }

    if (season) {
      where.season = season;
    }

    const [data, total] = await Promise.all([
      this.prisma.article.findMany({
        skip,
        take: limit,
        where,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.article.count({ where }),
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
   * Fuzzy search via pg_trgm similarity on code OR description (threshold 0.15).
   * Uses GIN trigram indexes on ord.articles.code and ord.articles.description.
   */
  private async findAllByTrigram(
    search: string,
    skip: number,
    limit: number,
    page: number,
    category?: string,
    season?: string,
  ) {
    const categoryFilter =
      category !== undefined && category !== null
        ? Prisma.sql`AND category = ${category}`
        : Prisma.empty;
    const seasonFilter =
      season !== undefined && season !== null
        ? Prisma.sql`AND season = ${season}`
        : Prisma.empty;

    const [idRows, countRows] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id
        FROM ord.articles
        WHERE deleted_at IS NULL
          AND is_active = true
          AND (
            similarity(code, ${search}) > ${TRIGRAM_THRESHOLD}
            OR similarity(COALESCE(description, ''), ${search}) > ${TRIGRAM_THRESHOLD}
          )
          ${categoryFilter}
          ${seasonFilter}
        ORDER BY GREATEST(
          similarity(code, ${search}),
          similarity(COALESCE(description, ''), ${search})
        ) DESC, created_at DESC
        LIMIT ${limit} OFFSET ${skip}
      `,
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count
        FROM ord.articles
        WHERE deleted_at IS NULL
          AND is_active = true
          AND (
            similarity(code, ${search}) > ${TRIGRAM_THRESHOLD}
            OR similarity(COALESCE(description, ''), ${search}) > ${TRIGRAM_THRESHOLD}
          )
          ${categoryFilter}
          ${seasonFilter}
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

    const rows = await this.prisma.article.findMany({
      where: { id: { in: ids } },
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
    const article = await this.prisma.article.findUnique({
      where: { id },
    });

    if (!article || article.deletedAt) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Article not found',
      });
    }

    return article;
  }

  async create(dto: CreateArticleDto) {
    const existing = await this.prisma.article.findUnique({
      where: { code: dto.code },
    });

    if (existing) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Article code already exists',
        detail: `An article with code '${dto.code}' already exists.`,
      });
    }

    return this.prisma.article.create({
      data: {
        code: dto.code,
        description: dto.description,
        sizeSystem: dto.sizeSystem,
        category: dto.category,
        season: dto.season,
      },
    });
  }

  async update(id: string, dto: UpdateArticleDto) {
    const article = await this.prisma.article.findUnique({ where: { id } });

    if (!article || article.deletedAt) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Article not found',
      });
    }

    // If code is being changed, check uniqueness
    if (dto.code && dto.code !== article.code) {
      const existing = await this.prisma.article.findUnique({
        where: { code: dto.code },
      });
      if (existing) {
        throw new ConflictException({
          statusCode: 409,
          message: 'Article code already exists',
          detail: `An article with code '${dto.code}' already exists.`,
        });
      }
    }

    return this.prisma.article.update({
      where: { id },
      data: {
        ...(dto.code !== undefined && { code: dto.code }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.sizeSystem !== undefined && { sizeSystem: dto.sizeSystem }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.season !== undefined && { season: dto.season }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.isActive === false && { deletedAt: new Date() }),
        ...(dto.isActive === true && { deletedAt: null }),
      },
    });
  }

  /**
   * Soft-delete: sets is_active = false and deleted_at = now().
   * Never performs a hard DELETE.
   */
  async softDelete(id: string) {
    const article = await this.prisma.article.findUnique({ where: { id } });

    if (!article || article.deletedAt) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Article not found',
      });
    }

    return this.prisma.article.update({
      where: { id },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
    });
  }
}
