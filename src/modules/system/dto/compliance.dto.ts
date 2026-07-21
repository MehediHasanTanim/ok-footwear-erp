// =============================================================================
// Compliance DTOs — Create, Update, Response shapes
// =============================================================================
// OK Footwear ERP — Sprint 2, System Module
// =============================================================================

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsDateString,
  IsUUID,
  IsInt,
  Min,
  Max,
  IsIn,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

// ---------------------------------------------------------------------------
// CreateComplianceDto
// ---------------------------------------------------------------------------

export class CreateComplianceDto {
  @ApiProperty({
    example: 'Fire Safety Certificate Renewal',
    description: 'Name of the compliance item',
    maxLength: 255,
  })
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({
    example: 'Annual fire safety inspection certificate for the factory premises',
    description: 'Detailed description of the compliance item',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: 'Safety',
    description: 'Category for grouping compliance items',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiProperty({
    example: '2026-12-31',
    description: 'Expiry date (ISO 8601 date)',
  })
  @IsDateString()
  expiryDate!: string;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'UUID of the user responsible for this compliance item',
  })
  @IsOptional()
  @IsUUID()
  responsibleUserId?: string;

  @ApiPropertyOptional({
    example: 30,
    description: 'Number of days before expiry to trigger alerts',
    default: 30,
    minimum: 1,
    maximum: 365,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  alertDays?: number = 30;

  @ApiPropertyOptional({
    example: 'https://docs.example.com/fire-safety-2026.pdf',
    description: 'URL to the compliance document',
  })
  @IsOptional()
  @IsString()
  documentUrl?: string;
}

// ---------------------------------------------------------------------------
// UpdateComplianceDto — all fields optional (partial update)
// ---------------------------------------------------------------------------

export class UpdateComplianceDto {
  @ApiPropertyOptional({
    example: 'Fire Safety Certificate Renewal',
    description: 'Updated name',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    description: 'Updated description',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Updated category',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'Updated expiry date (ISO 8601 date)',
  })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Updated responsible user UUID (pass null to clear)',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  responsibleUserId?: string | null;

  @ApiPropertyOptional({
    description: 'Updated alert days',
    minimum: 1,
    maximum: 365,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  alertDays?: number;

  @ApiPropertyOptional({
    description: 'Updated status',
    enum: ['valid', 'expiring_soon', 'expired'],
  })
  @IsOptional()
  @IsIn(['valid', 'expiring_soon', 'expired'])
  status?: string;

  @ApiPropertyOptional({
    description: 'Updated document URL',
  })
  @IsOptional()
  @IsString()
  documentUrl?: string;
}

// ---------------------------------------------------------------------------
// ComplianceItemDto — API response shape (camelCase)
// ---------------------------------------------------------------------------

export class ComplianceItemDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'Fire Safety Certificate Renewal' })
  name!: string;

  @ApiProperty({ example: 'Annual fire safety inspection certificate' })
  description!: string | null;

  @ApiProperty({ example: 'Safety' })
  category!: string | null;

  @ApiProperty({ example: '2026-12-31' })
  expiryDate!: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  responsibleUserId!: string | null;

  @ApiProperty({ example: 30 })
  alertDays!: number;

  @ApiProperty({ example: 'valid', enum: ['valid', 'expiring_soon', 'expired'] })
  status!: string;

  @ApiProperty({ example: 'https://docs.example.com/cert.pdf' })
  documentUrl!: string | null;

  @ApiProperty({ example: '2026-07-20T12:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-07-20T12:00:00.000Z' })
  updatedAt!: string;
}
