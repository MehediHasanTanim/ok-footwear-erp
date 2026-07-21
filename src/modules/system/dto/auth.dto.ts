// =============================================================================
// Auth DTOs — Login, Refresh, TOTP
// =============================================================================
// OK Footwear ERP — Sprint 2, System Module
// =============================================================================

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, IsOptional, Length } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'admin@okfootwear.com',
    description: 'Registered email address',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'changeme123',
    description: 'Account password (min 8 characters)',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({
    example: '123456',
    description: 'TOTP 2FA code (required only if 2FA is enabled for the account)',
  })
  @IsOptional()
  @IsString()
  @Length(6, 6)
  totpToken?: string;
}

export class RefreshTokenDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIs...',
    description: 'Valid refresh token (also accepted via httpOnly cookie)',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class SetupTotpDto {
  @ApiProperty({
    example: '123456',
    description: 'TOTP code from authenticator app to verify setup',
  })
  @IsString()
  @Length(6, 6)
  token!: string;
}

export class LoginResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIs...' })
  accessToken!: string;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIs...' })
  refreshToken!: string;

  @ApiProperty()
  user!: {
    id: string;
    email: string;
    fullName: string;
    permissions: string[];
  };
}

export class MfaRequiredDto {
  @ApiProperty({ example: true })
  mfaRequired!: true;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIs...' })
  tempToken!: string;
}

// ---------------------------------------------------------------------------
// ChangePasswordDto
// ---------------------------------------------------------------------------

export class ChangePasswordDto {
  @ApiProperty({
    example: 'oldPassword123',
    description: 'Current password for verification',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  currentPassword!: string;

  @ApiProperty({
    example: 'NewSecureP@ss1',
    description: 'New password (min 8 characters)',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
