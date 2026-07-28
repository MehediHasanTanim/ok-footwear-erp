// =============================================================================
// Complaints DTOs
// =============================================================================
// OK Footwear ERP — Sprint 4, Orders Module
// =============================================================================

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum } from 'class-validator';
import type { ComplaintType, Severity } from '@prisma/client';

export class CreateComplaintDto {
  @ApiProperty({ enum: ['quality', 'delivery', 'packaging', 'documentation', 'other'] })
  @IsEnum(['quality', 'delivery', 'packaging', 'documentation', 'other'] as const)
  type!: ComplaintType;

  @ApiProperty({ enum: ['low', 'medium', 'high', 'critical'] })
  @IsEnum(['low', 'medium', 'high', 'critical'] as const)
  severity!: Severity;

  @ApiProperty({ description: 'Complaint description' })
  @IsString()
  description!: string;
}

export class UpdateRootCauseDto {
  @ApiProperty({ description: 'Root cause analysis' })
  @IsString()
  rootCause!: string;
}
