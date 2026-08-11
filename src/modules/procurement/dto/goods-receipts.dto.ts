import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsNumber,
  IsDateString,
  IsArray,
  ValidateNested,
  Min,
  ArrayMinSize,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { GrLineQcStatus } from '@prisma/client';

export class CreateGrLineDto {
  @ApiProperty()
  @IsUUID()
  poLineId!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.001)
  receivedQty!: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  acceptedQty?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  rejectedQty?: number;

  @ApiPropertyOptional({ enum: ['pending', 'accepted', 'rejected', 'hold'] })
  @IsOptional()
  @IsEnum(['pending', 'accepted', 'rejected', 'hold'] as const)
  qcStatus?: GrLineQcStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  batchLot?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;
}

export class CreateGoodsReceiptDto {
  @ApiProperty()
  @IsUUID()
  poId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  receiptDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vehicleNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [CreateGrLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateGrLineDto)
  lines!: CreateGrLineDto[];
}

export class UpdateGrLineDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0.001)
  receivedQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  acceptedQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  rejectedQty?: number;

  @ApiPropertyOptional({ enum: ['pending', 'accepted', 'rejected', 'hold'] })
  @IsOptional()
  @IsEnum(['pending', 'accepted', 'rejected', 'hold'] as const)
  qcStatus?: GrLineQcStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;
}

export class ApproveGoodsReceiptDto {
  @ApiProperty({ description: 'Target warehouse for inventory posting' })
  @IsUUID()
  warehouseId!: string;
}

export class RejectGoodsReceiptDto {
  @ApiProperty()
  @IsString()
  reason!: string;
}
