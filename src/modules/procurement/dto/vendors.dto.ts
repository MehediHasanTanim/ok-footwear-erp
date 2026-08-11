import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsInt,
  IsNumber,
  IsEmail,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '@common/dto/pagination.dto';
import type { VendorType, VendorStatus } from '@prisma/client';

export class CreateVendorCategoryDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  code!: string;
}

export class UpdateVendorCategoryDto extends PartialType(CreateVendorCategoryDto) {}

export class CreateVendorDto {
  @ApiProperty({ example: 'VND-001' })
  @IsString()
  vendorCode!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ enum: ['raw_material', 'sole', 'accessory', 'packaging', 'machine', 'service'] })
  @IsEnum(['raw_material', 'sole', 'accessory', 'packaging', 'machine', 'service'] as const)
  type!: VendorType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tradeLicense?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tinNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankAccount?: string;

  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @IsInt()
  @Min(0)
  paymentTerms?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  @ApiPropertyOptional({ enum: ['approved', 'blacklisted', 'under_review'] })
  @IsOptional()
  @IsEnum(['approved', 'blacklisted', 'under_review'] as const)
  status?: VendorStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateVendorDto extends PartialType(CreateVendorDto) {}

export class VendorQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ['approved', 'blacklisted', 'under_review'] })
  @IsOptional()
  @IsEnum(['approved', 'blacklisted', 'under_review'] as const)
  status?: VendorStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  dropdown?: boolean;
}
