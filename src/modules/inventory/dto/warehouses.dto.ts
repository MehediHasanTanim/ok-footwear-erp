import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationDto } from '@common/dto/pagination.dto';

export const WAREHOUSE_TYPES = [
  'raw_material',
  'accessories',
  'finished_goods',
  'packing',
  'general',
] as const;

export class WarehouseQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: WAREHOUSE_TYPES })
  @IsOptional()
  @IsIn(WAREHOUSE_TYPES)
  type?: (typeof WAREHOUSE_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isActive?: boolean;
}

export class CreateWarehouseDto {
  @ApiProperty({ example: 'RM-WH-01' })
  @IsString()
  @MaxLength(20)
  code!: string;

  @ApiProperty({ example: 'Raw Material Warehouse' })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: 'Building A' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiPropertyOptional({ enum: WAREHOUSE_TYPES, default: 'general' })
  @IsOptional()
  @IsIn(WAREHOUSE_TYPES)
  type?: (typeof WAREHOUSE_TYPES)[number];
}

export class UpdateWarehouseDto extends PartialType(CreateWarehouseDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
