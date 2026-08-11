import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PaginationDto } from '@common/dto/pagination.dto';

export const STOCK_ITEM_CATEGORIES = [
  'raw_material',
  'sole',
  'accessory',
  'packing',
  'finished_goods',
] as const;

export class StockItemQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: STOCK_ITEM_CATEGORIES })
  @IsOptional()
  @IsIn(STOCK_ITEM_CATEGORIES)
  category?: (typeof STOCK_ITEM_CATEGORIES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  belowReorder?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isActive?: boolean;
}

export class CreateStockItemDto {
  @ApiProperty({ example: 'RM-LEATHER-01' })
  @IsString()
  @MaxLength(50)
  itemCode!: string;

  @ApiProperty({ example: 'Cow Leather Upper' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ enum: STOCK_ITEM_CATEGORIES })
  @IsIn(STOCK_ITEM_CATEGORIES)
  category!: (typeof STOCK_ITEM_CATEGORIES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subCategory?: string;

  @ApiPropertyOptional({ default: 'PCS' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  uom?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  reorderLevel?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minStock?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxStock?: number;

  @ApiPropertyOptional({ default: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  leadTimeDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? undefined : value))
  hsnCode?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateStockItemDto extends PartialType(CreateStockItemDto) {}
