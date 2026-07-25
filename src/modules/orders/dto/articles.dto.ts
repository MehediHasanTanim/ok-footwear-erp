// =============================================================================
// Articles DTOs
// =============================================================================
// OK Footwear ERP — Sprint 3, Orders Module
// =============================================================================

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
} from 'class-validator';
import { PaginationDto } from '@common/dto/pagination.dto';

// ---------------------------------------------------------------------------
// ArticleQueryDto — search + pagination for GET /articles
// ---------------------------------------------------------------------------

export class ArticleQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Trigram fuzzy search on article code and description',
    example: 'RUN-001',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by category',
    example: 'Running',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'Filter by season',
    example: 'SS24',
  })
  @IsOptional()
  @IsString()
  season?: string;
}

// ---------------------------------------------------------------------------
// CreateArticleDto
// ---------------------------------------------------------------------------

export class CreateArticleDto {
  @ApiProperty({ example: 'RUN-001', description: 'Unique article code' })
  @IsString()
  code!: string;

  @ApiProperty({ example: 'Men\'s Running Shoe Model X' })
  @IsString()
  description!: string;

  @ApiPropertyOptional({ example: 'EU', description: 'Size system: EU, UK, US' })
  @IsOptional()
  @IsString()
  sizeSystem?: string;

  @ApiPropertyOptional({ example: 'Running' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'SS24', description: 'Season code (nullable)' })
  @IsOptional()
  @IsString()
  season?: string;
}

// ---------------------------------------------------------------------------
// UpdateArticleDto
// ---------------------------------------------------------------------------

export class UpdateArticleDto {
  @ApiPropertyOptional({ example: 'RUN-001-V2' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ example: 'Updated description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'UK' })
  @IsOptional()
  @IsString()
  sizeSystem?: string;

  @ApiPropertyOptional({ example: 'Trail Running' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'AW24' })
  @IsOptional()
  @IsString()
  season?: string;

  @ApiPropertyOptional({ description: 'Soft-delete flag' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ---------------------------------------------------------------------------
// ArticleResponseDto — serialized response shape
// ---------------------------------------------------------------------------

import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class ArticleResponseDto {
  @Expose()
  id!: string;

  @Expose()
  code!: string;

  @Expose()
  description!: string;

  @Expose()
  sizeSystem!: string | null;

  @Expose()
  category!: string | null;

  @Expose()
  season!: string | null;

  @Expose()
  isActive!: boolean;

  @Expose()
  createdAt!: Date;

  @Expose()
  updatedAt!: Date;
}
