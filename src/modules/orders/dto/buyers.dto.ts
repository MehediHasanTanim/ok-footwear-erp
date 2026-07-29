// =============================================================================
// Buyers DTOs
// =============================================================================
// OK Footwear ERP — Sprint 3, Orders Module
// =============================================================================

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsNumber,
  Min,
} from 'class-validator';
import { Transform, Exclude, Expose } from 'class-transformer';
import { PaginationDto } from '@common/dto/pagination.dto';
import { IsIso4217Currency } from '../validators/iso4217.validator';

// ---------------------------------------------------------------------------
// BuyerQueryDto — search + dropdown + pagination for GET /buyers
// ---------------------------------------------------------------------------

export class BuyerQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Trigram fuzzy search on buyer name',
    example: 'Nike',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Return only id + name for dropdown (lightweight payload)',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  dropdown?: boolean = false;
}

// ---------------------------------------------------------------------------
// CreateBuyerDto
// ---------------------------------------------------------------------------

export enum PaymentTerm {
  LC_SIGHT = 'LC_SIGHT',
  LC_USANCE = 'LC_USANCE',
  TT_ADVANCE = 'TT_ADVANCE',
  TT_30_DAYS = 'TT_30_DAYS',
}

export class CreateBuyerDto {
  @ApiProperty({ example: 'Nike Inc.' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'USD', description: 'ISO 4217 3-letter currency code' })
  @IsIso4217Currency()
  currency!: string;

  @ApiProperty({ enum: PaymentTerm, example: 'LC_SIGHT' })
  @IsEnum(PaymentTerm)
  paymentTerms!: PaymentTerm;

  @ApiPropertyOptional({ example: 500000, description: 'Credit limit in currency units' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  @ApiPropertyOptional({ example: 'USA' })
  @IsOptional()
  @IsString()
  country?: string;
}

// ---------------------------------------------------------------------------
// UpdateBuyerDto
// ---------------------------------------------------------------------------

export class UpdateBuyerDto {
  @ApiPropertyOptional({ example: 'Nike Inc.' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsIso4217Currency()
  currency?: string;

  @ApiPropertyOptional({ enum: PaymentTerm })
  @IsOptional()
  @IsEnum(PaymentTerm)
  paymentTerms?: PaymentTerm;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ description: 'Soft-delete flag' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ---------------------------------------------------------------------------
// BuyerResponseDto — serialized response shape
// ---------------------------------------------------------------------------

@Exclude()
export class BuyerResponseDto {
  @Expose()
  id!: string;

  @Expose()
  name!: string;

  @Expose()
  currency!: string;

  @Expose()
  paymentTerms!: string;

  @Expose()
  @Transform(({ value }) => (value ? Number(value) : null))
  creditLimit!: number | null;

  @Expose()
  country!: string | null;

  @Expose()
  isActive!: boolean;

  @Expose()
  createdAt!: Date;

  @Expose()
  updatedAt!: Date;
}

/**
 * Lightweight dropdown response — only id + name.
 */
@Exclude()
export class BuyerDropdownDto {
  @Expose()
  id!: string;

  @Expose()
  name!: string;
}
