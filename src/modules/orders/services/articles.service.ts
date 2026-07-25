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

    const where: Prisma.ArticleWhereInput = {
      deletedAt: null,
      isActive: true,
    };

    if (search) {
      // Trigram search across code + description.
      // We use Prisma's OR + contains for case-insensitive matching.
      // The pg_trgm GIN index on code and description makes this fast.
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

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
