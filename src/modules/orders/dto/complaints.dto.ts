// =============================================================================
// Complaints DTOs
// =============================================================================
// OK Footwear ERP — Sprint 4, Orders Module
// =============================================================================

import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsIn } from 'class-validator';
import type { ComplaintType, Severity, ComplaintStatus } from '@prisma/client';

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

export class UpdateComplaintStatusDto {
  @ApiProperty({
    enum: ['open', 'under_investigation', 'resolved'],
    description: 'Target complaint status',
  })
  @IsIn(['open', 'under_investigation', 'resolved'])
  status!: ComplaintStatus;
}
