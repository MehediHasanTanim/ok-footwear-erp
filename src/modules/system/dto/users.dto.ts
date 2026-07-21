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
  IsArray,
  IsUUID,
  ArrayMaxSize,
} from 'class-validator';
import { PaginationDto } from '@common/dto/pagination.dto';

// ---------------------------------------------------------------------------
// UserQueryDto — search + pagination for GET /users
// ---------------------------------------------------------------------------

export class UserQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description:
      'Search across email, first name, middle name, and last name (case-insensitive partial match)',
    example: 'kalam',
  })
  @IsOptional()
  @IsString()
  search?: string;
}

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

  @ApiPropertyOptional({
    description: 'Optional list of role UUIDs to assign at creation time',
    example: ['550e8400-e29b-41d4-a716-446655440000'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(20)
  roleIds?: string[];
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

  @ApiPropertyOptional({
    description: 'Replace all roles for the user with this list of role UUIDs',
    example: ['550e8400-e29b-41d4-a716-446655440000'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(20)
  roleIds?: string[];
}
