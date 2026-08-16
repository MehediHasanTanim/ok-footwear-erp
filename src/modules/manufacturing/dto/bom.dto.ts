import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { COMPONENT_TYPES } from '../interfaces/bom-status.enum';

export class BomLineDto {
  @ApiProperty()
  @IsUUID()
  itemId!: string;

  @ApiProperty({ enum: COMPONENT_TYPES })
  @IsIn([...COMPONENT_TYPES])
  componentType!: string;

  @ApiProperty({ description: 'Net quantity per pair' })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  qtyPerUnit!: number;

  @ApiProperty()
  @IsString()
  uom!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  sizeSpecific?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sizeLabel?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  wastagePct?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class BomSizeOverrideDto {
  @ApiProperty()
  @IsUUID()
  itemId!: string;

  @ApiProperty()
  @IsString()
  sizeLabel!: string;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  qtyPerUnit!: number;
}

export class CreateBomDto {
  @ApiProperty()
  @IsUUID()
  articleId!: string;

  @ApiPropertyOptional({ example: '1.0' })
  @IsOptional()
  @IsString()
  version?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Copy lines from this BOM (same article)' })
  @IsOptional()
  @IsUUID()
  duplicateFromId?: string;

  @ApiPropertyOptional({ type: [BomLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BomLineDto)
  lines?: BomLineDto[];

  @ApiPropertyOptional({ type: [BomSizeOverrideDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BomSizeOverrideDto)
  sizeOverrides?: BomSizeOverrideDto[];
}

export class UpdateBomDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: [BomLineDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BomLineDto)
  lines?: BomLineDto[];

  @ApiPropertyOptional({ type: [BomSizeOverrideDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BomSizeOverrideDto)
  sizeOverrides?: BomSizeOverrideDto[];
}

export class GenerateCostSheetDto {
  @ApiProperty({ example: 12.5 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  labourCost!: number;

  @ApiProperty({ example: 5 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  overheadCost!: number;

  @ApiProperty({ example: 20, description: 'Target margin %' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  targetMarginPct!: number;
}

export class UpdateCostSheetDto {
  @ApiProperty({ example: 22 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  targetMarginPct!: number;
}
