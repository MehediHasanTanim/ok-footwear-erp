import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PaginationDto } from '@common/dto/pagination.dto';

export class StockCountQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  warehouseId?: string;

  @ApiPropertyOptional({
    enum: ['open', 'counting', 'variance_review', 'approved', 'cancelled'],
  })
  @IsOptional()
  @IsIn(['open', 'counting', 'variance_review', 'approved', 'cancelled'])
  status?: string;
}

export class CreateStockCountDto {
  @ApiProperty()
  @IsUUID('4')
  warehouseId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  countDate?: string;
}

export class UpdateStockCountLineDto {
  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  physicalQty!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  varianceReason?: string;
}

export class StockSummaryQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  belowReorder?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
