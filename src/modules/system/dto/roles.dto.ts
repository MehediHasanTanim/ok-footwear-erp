// =============================================================================
// Roles DTOs
// =============================================================================
// OK Footwear ERP — Sprint 2
// =============================================================================

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ example: 'finance_manager' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: 'Finance department manager' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateRoleDto {
  @ApiPropertyOptional({ example: 'finance_manager_v2' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}
