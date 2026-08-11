// =============================================================================
// Quotations DTOs
// =============================================================================
// OK Footwear ERP — Sprint 4, Orders Module
// =============================================================================

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsNumber,
  Min,
  Max,
  IsIn,
  IsDateString,
} from 'class-validator';

export class CreateQuotationDto {
  @ApiProperty({ example: 'USD', description: 'ISO 4217 currency code' })
  @IsString()
  currency!: string;

  @ApiPropertyOptional({ example: 12.5, description: 'Quoted unit price' })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  quotedPrice?: number;

  @ApiPropertyOptional({ example: 75.0, description: 'Win probability 0-100' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  winProbability?: number;

  @ApiPropertyOptional({
    description: 'Optional BOM version UUID (cost fill deferred until Manufacturing)',
  })
  @IsOptional()
  @IsUUID()
  bomVersionId?: string;
}

export class UpdateQuotationDto {
  @ApiPropertyOptional({ example: 12.5 })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  quotedPrice?: number;

  @ApiPropertyOptional({ example: 75.0, description: 'Win probability 0-100' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  winProbability?: number;

  @ApiPropertyOptional({ example: 'EUR' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({
    description: 'Optional BOM version UUID (cost fill deferred until Manufacturing)',
  })
  @IsOptional()
  @IsUUID()
  bomVersionId?: string;
}

export class CloseQuotationDto {
  @ApiProperty({ enum: ['won', 'lost'], description: 'Outcome of the quotation' })
  @IsIn(['won', 'lost'])
  outcome!: 'won' | 'lost';

  @ApiPropertyOptional({ description: 'Reason for the outcome' })
  @IsOptional()
  @IsString()
  outcomeReason?: string;
}

export class ConversionRateQueryDto {
  @ApiPropertyOptional({ description: 'Filter by buyer UUID' })
  @IsOptional()
  @IsUUID()
  buyerId?: string;

  @ApiPropertyOptional({ description: 'Closed-at range start (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Closed-at range end (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class PopulateFromBomDto {
  @ApiProperty({ description: 'BOM version UUID to populate cost from' })
  @IsUUID()
  bomVersionId!: string;
}
