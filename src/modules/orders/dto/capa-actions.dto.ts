// =============================================================================
// CAPA Actions DTOs
// =============================================================================
// OK Footwear ERP — Sprint 4, Orders Module
// =============================================================================

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID, IsDateString, IsEnum, MinDate } from 'class-validator';
import { Transform } from 'class-transformer';
import type { CapaActionStatus } from '@prisma/client';

export class CreateCapaActionDto {
  @ApiProperty({ description: 'CAPA action description' })
  @IsString()
  description!: string;

  @ApiProperty({ description: 'Owner user ID (sys.users FK)' })
  @IsUUID('4')
  ownerId!: string;

  @ApiProperty({ example: '2026-12-31', description: 'Due date (must be future)' })
  @IsDateString()
  dueDate!: string;
}

export class UpdateCapaActionDto {
  @ApiPropertyOptional({ description: 'Updated description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Updated owner ID' })
  @IsOptional()
  @IsUUID('4')
  ownerId?: string;

  @ApiPropertyOptional({ example: '2027-01-15', description: 'Updated due date' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ description: 'Evidence / notes' })
  @IsOptional()
  @IsString()
  evidence?: string;
}

export class UpdateCapaStatusDto {
  @ApiProperty({ enum: ['open', 'in_progress', 'done'], description: 'New CAPA status' })
  @IsEnum(['open', 'in_progress', 'done'] as const)
  status!: CapaActionStatus;
}
