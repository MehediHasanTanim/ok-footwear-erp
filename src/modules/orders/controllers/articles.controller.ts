// =============================================================================
// ArticlesController — Article CRUD Endpoints
// =============================================================================
// OK Footwear ERP — Sprint 3, Orders Module
// =============================================================================

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { ArticlesService } from '../services/articles.service';
import {
  CreateArticleDto,
  UpdateArticleDto,
  ArticleQueryDto,
} from '../dto/articles.dto';

@ApiTags('articles')
@ApiBearerAuth()
@Controller('articles')
@UseGuards(JwtAuthGuard, RbacGuard)
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  // =========================================================================
  // GET /articles
  // =========================================================================

  @Get()
  @Permissions('orders:read')
  @ApiOperation({ summary: 'List articles (paginated, searchable, filterable)' })
  @ApiResponse({ status: 200, description: 'Paginated article list' })
  findAll(@Query() query: ArticleQueryDto) {
    return this.articlesService.findAll(query);
  }

  // =========================================================================
  // GET /articles/:id
  // =========================================================================

  @Get(':id')
  @Permissions('orders:read')
  @ApiOperation({ summary: 'Get article by ID' })
  @ApiResponse({ status: 200, description: 'Article detail' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  findOne(@Param('id') id: string) {
    return this.articlesService.findOne(id);
  }

  // =========================================================================
  // POST /articles
  // =========================================================================

  @Post()
  @Permissions('orders:create')
  @ApiOperation({ summary: 'Create a new article' })
  @ApiResponse({ status: 201, description: 'Article created' })
  @ApiResponse({ status: 409, description: 'Article code already exists' })
  @HttpCode(201)
  create(@Body() dto: CreateArticleDto) {
    return this.articlesService.create(dto);
  }

  // =========================================================================
  // PATCH /articles/:id
  // =========================================================================

  @Patch(':id')
  @Permissions('orders:update')
  @ApiOperation({ summary: 'Update article fields (soft-delete via isActive=false)' })
  @ApiResponse({ status: 200, description: 'Article updated' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  @ApiResponse({ status: 409, description: 'Article code already exists' })
  update(@Param('id') id: string, @Body() dto: UpdateArticleDto) {
    return this.articlesService.update(id, dto);
  }

  // =========================================================================
  // DELETE /articles/:id — soft-delete only
  // =========================================================================

  @Delete(':id')
  @Permissions('orders:delete')
  @ApiOperation({ summary: 'Soft-delete an article (sets isActive=false)' })
  @ApiResponse({ status: 200, description: 'Article soft-deleted' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  @HttpCode(200)
  remove(@Param('id') id: string) {
    return this.articlesService.softDelete(id);
  }
}
