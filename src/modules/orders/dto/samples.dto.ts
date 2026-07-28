// =============================================================================
// Samples DTOs
// =============================================================================
// OK Footwear ERP — Sprint 4, Orders Module
// =============================================================================

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID, IsInt, Min, IsEnum, IsDateString } from 'class-validator';
import type { SampleType } from '@prisma/client';

export class CreateSampleDto {
  @ApiPropertyOptional({ example: 1, description: 'Round number (auto-incremented if omitted)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  roundNumber?: number;

  @ApiProperty({ enum: ['PP', 'counter', 'size_set', 'TOP'], description: 'Sample type' })
  @IsEnum(['PP', 'counter', 'size_set', 'TOP'] as const)
  sampleType!: SampleType;

  @ApiPropertyOptional({ example: '2026-08-01', description: 'Dispatch date' })
  @IsOptional()
  @IsDateString()
  dispatchDate?: string;

  @ApiPropertyOptional({ example: '2026-08-15', description: 'Received date' })
  @IsOptional()
  @IsDateString()
  receivedDate?: string;

  @ApiPropertyOptional({ description: 'Remarks' })
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class UpdateSampleDto {
  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsOptional()
  @IsDateString()
  dispatchDate?: string;

  @ApiPropertyOptional({ example: '2026-08-15' })
  @IsOptional()
  @IsDateString()
  receivedDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class RejectSampleDto {
  @ApiProperty({ description: 'Reason for rejection' })
  @IsString()
  remarks!: string;
}
