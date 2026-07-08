// =============================================================================
// Users DTOs — Create, Update
// =============================================================================
// OK Footwear ERP — Sprint 2
// =============================================================================

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  IsOptional,
  MinLength,
  IsBoolean,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'user@okfootwear.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'SecureP@ss1', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'Md' })
  @IsString()
  firstName!: string;

  @ApiPropertyOptional({ example: 'Abul' })
  @IsOptional()
  @IsString()
  middleName?: string;

  @ApiProperty({ example: 'Kalam' })
  @IsString()
  lastName!: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'user@okfootwear.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'NewP@ssword1', minLength: 8 })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional({ example: 'Md' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Abul' })
  @IsOptional()
  @IsString()
  middleName?: string;

  @ApiPropertyOptional({ example: 'Kalam' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
