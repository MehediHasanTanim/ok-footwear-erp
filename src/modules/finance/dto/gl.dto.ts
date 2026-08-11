import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '@common/dto/pagination.dto';

export class JournalLineDto {
  @ApiProperty()
  @IsUUID()
  accountId!: string;

  @ApiProperty({ example: 1000 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  debit!: number;

  @ApiProperty({ example: 0 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  credit!: number;

  @ApiPropertyOptional({ default: 'BDT' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  fxRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  costCenter?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  narration?: string;
}

export class PostJournalDto {
  @ApiProperty()
  @IsUUID()
  periodId!: string;

  @ApiProperty({ example: '2026-08-01' })
  @IsDateString()
  entryDate!: string;

  @ApiProperty()
  @IsString()
  narration!: string;

  @ApiPropertyOptional({ enum: ['manual', 'system', 'reversal'], default: 'manual' })
  @IsOptional()
  @IsEnum(['manual', 'system', 'reversal'])
  entryType?: 'manual' | 'system' | 'reversal';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceModule?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @ApiProperty({ type: [JournalLineDto] })
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines!: JournalLineDto[];
}

export class GlEntryQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  periodId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceModule?: string;
}

export class CreateGlPeriodDto {
  @ApiProperty({ example: 2026 })
  @IsNumber()
  periodYear!: number;

  @ApiProperty({ example: 8 })
  @IsNumber()
  @Min(1)
  periodMonth!: number;
}

export class TrialBalanceQueryDto {
  @ApiProperty()
  @IsUUID()
  periodId!: string;
}

export class AccountBalanceQueryDto {
  @ApiProperty()
  @IsUUID()
  accountId!: string;

  @ApiProperty({ example: '2026-01-01' })
  @IsDateString()
  fromDate!: string;

  @ApiProperty({ example: '2026-12-31' })
  @IsDateString()
  toDate!: string;
}
