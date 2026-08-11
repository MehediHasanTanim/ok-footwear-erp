import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { PaginationDto } from '@common/dto/pagination.dto';

export class CreateDeliveryChallanDto {
  @ApiProperty()
  @IsUUID()
  orderId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dcDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vehicleNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  carrier?: string;
}

export class RecordPodDto {
  @ApiProperty({ example: '2026-08-10' })
  @IsDateString()
  podDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  podReceiver?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  podNotes?: string;
}

export class ConfirmDeliveryDto {
  @ApiProperty({ description: 'Open GL period for AR journal' })
  @IsUUID()
  periodId!: string;

  @ApiPropertyOptional({ example: '2026-08-10' })
  @IsOptional()
  @IsDateString()
  entryDate?: string;

  @ApiPropertyOptional({ description: 'Invoice due date (default +30d)' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class DeliveryChallanQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

export class BuyerInvoiceQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  buyerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

export class RecordCollectionDto {
  @ApiProperty({ example: 1000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;
}
