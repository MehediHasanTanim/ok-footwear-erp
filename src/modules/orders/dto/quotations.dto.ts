// =============================================================================
// Quotations DTOs
// =============================================================================
// OK Footwear ERP — Sprint 4, Orders Module
// =============================================================================

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID, IsNumber, Min, Max, IsEnum, IsIn } from 'class-validator';

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
