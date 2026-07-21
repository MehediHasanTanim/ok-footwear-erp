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

export class AddPermissionDto {
  @ApiPropertyOptional({
    description: 'Permission UUID (use this OR module+action)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsOptional()
  @IsString()
  permissionId?: string;

  @ApiPropertyOptional({
    description: 'Module name (use with action instead of permissionId)',
    example: 'orders',
  })
  @IsOptional()
  @IsString()
  module?: string;

  @ApiPropertyOptional({
    description: 'Action name (use with module instead of permissionId)',
    example: 'read',
  })
  @IsOptional()
  @IsString()
  action?: string;
}
