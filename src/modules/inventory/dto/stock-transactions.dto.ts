import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '@common/dto/pagination.dto';

export const STOCK_TXN_TYPES = [
  'grn',
  'production_issue',
  'production_return',
  'delivery',
  'return_from_buyer',
  'transfer_in',
  'transfer_out',
  'adjustment_in',
  'adjustment_out',
  'opening_stock',
  'write_off',
  'outsource_issue',
  'outsource_return',
] as const;

export type StockTxnType = (typeof STOCK_TXN_TYPES)[number];

export class StockTransactionQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  itemId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  warehouseId?: string;

  @ApiPropertyOptional({ enum: STOCK_TXN_TYPES })
  @IsOptional()
  @IsIn(STOCK_TXN_TYPES)
  txnType?: StockTxnType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  toDate?: string;
}

export class RecordMovementDto {
  @ApiProperty({ enum: STOCK_TXN_TYPES })
  @IsIn(STOCK_TXN_TYPES)
  txnType!: StockTxnType;

  @ApiProperty({ enum: [1, -1] })
  @Type(() => Number)
  @IsIn([1, -1])
  direction!: 1 | -1;

  @ApiProperty()
  @IsUUID('4')
  itemId!: string;

  @ApiProperty()
  @IsUUID('4')
  warehouseId!: string;

  @ApiProperty({ example: 100 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  txnDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  batchLot?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceModule?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  sourceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}
