import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsNumber,
  IsDateString,
  Min,
} from 'class-validator';
import { PaginationDto } from '@common/dto/pagination.dto';

export class CreateVendorInvoiceDto {
  @ApiProperty()
  @IsUUID()
  vendorId!: string;

  @ApiProperty()
  @IsUUID()
  grnId!: string;

  @ApiProperty()
  @IsString()
  invoiceNo!: string;

  @ApiProperty()
  @IsDateString()
  invoiceDate!: string;

  @ApiProperty()
  @IsDateString()
  dueDate!: string;

  @ApiPropertyOptional({ example: 'BDT' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  grossAmount!: number;
}

export class RecordPaymentDto {
  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  amount!: number;
}

export class VendorInvoiceQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}
