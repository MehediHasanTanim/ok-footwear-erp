import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SizePlanEntryDto {
  @ApiProperty()
  @IsString()
  sizeLabel!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  plannedQty!: number;
}

export class CreateProductionOrderDto {
  @ApiProperty()
  @IsUUID()
  orderId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  bomId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  factoryLineId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ type: [SizePlanEntryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SizePlanEntryDto)
  sizePlan?: SizePlanEntryDto[];
}

export class UpdateProductionOrderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  factoryLineId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ type: [SizePlanEntryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SizePlanEntryDto)
  sizePlan?: SizePlanEntryDto[];
}

export class ProductionOrderQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}

export class RecordDailyProductionDto {
  @ApiProperty()
  @IsDateString()
  prodDate!: string;

  @ApiProperty()
  @IsUUID()
  factoryLineId!: string;

  @ApiProperty()
  @IsUUID()
  operationId!: string;

  @ApiPropertyOptional({ enum: ['day', 'night'], default: 'day' })
  @IsOptional()
  @IsString()
  shift?: 'day' | 'night';

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  targetQty?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  producedQty?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  rejectedQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  supervisorId?: string;
}

export class UpdateDailyProductionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  targetQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  producedQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  rejectedQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  supervisorId?: string;
}

export class DailyProductionQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  toDate?: string;
}

export class DefectDetailDto {
  @ApiProperty()
  @IsString()
  type!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  qty!: number;

  @ApiProperty()
  @IsString()
  section!: string;
}

export class CreateQcResultDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  qcDate?: string;

  @ApiProperty({ enum: ['inline', 'final'] })
  @IsString()
  qcType!: 'inline' | 'final';

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  operationId?: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  inspectedQty!: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  passedQty!: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  failedQty!: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  reworkQty?: number;

  @ApiProperty({ enum: ['pass', 'fail', 'rework', 'conditional_pass'] })
  @IsString()
  verdict!: 'pass' | 'fail' | 'rework' | 'conditional_pass';

  @ApiPropertyOptional({ type: [DefectDetailDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DefectDetailDto)
  defectDetails?: DefectDetailDto[];
}

export class AqlSampleSizeQueryDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  lotSize!: number;
}

export class CreateMachineDto {
  @ApiProperty()
  @IsString()
  machineCode!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  type!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  manufacturer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  factoryLineId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  purchaseDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assetId?: string;
}

export class UpdateMachineDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  manufacturer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  factoryLineId?: string;

  @ApiPropertyOptional({ enum: ['active', 'under_maintenance', 'breakdown', 'retired'] })
  @IsOptional()
  @IsString()
  status?: string;
}

export class CreateMaintenanceDto {
  @ApiProperty({ enum: ['preventive', 'breakdown', 'repair'] })
  @IsString()
  maintType!: 'preventive' | 'breakdown' | 'repair';

  @ApiProperty()
  @IsDateString()
  startTime!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  cost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  performedBy?: string;
}

export class CloseMaintenanceDto {
  @ApiProperty()
  @IsDateString()
  endTime!: string;
}

export class CreateScrapDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scrapDate?: string;

  @ApiProperty({
    enum: [
      'upper_offcut',
      'rejected_sole',
      'damaged_insole',
      'adhesive_waste',
      'packing_waste',
      'other',
    ],
  })
  @IsString()
  scrapType!: string;

  @ApiProperty()
  @IsString()
  section!: string;

  @ApiProperty()
  @Min(0.001)
  quantity!: number;

  @ApiProperty()
  @IsString()
  uom!: string;

  @ApiPropertyOptional()
  @IsOptional()
  unitValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class AuthorizeDisposalDto {
  @ApiProperty({ enum: ['sale', 'recycle', 'landfill'] })
  @IsString()
  disposalMethod!: 'sale' | 'recycle' | 'landfill';

  @ApiPropertyOptional()
  @IsOptional()
  saleAmount?: number;
}
