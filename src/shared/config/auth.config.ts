import { registerAs } from '@nestjs/config';
import * as Joi from 'joi';

// =============================================================================
// AuthConfig — JWT, RBAC, MFA
// =============================================================================

export interface AuthConfig {
  /** JWT signing secret. Must be >= 32 chars. */
  jwtSecret: string;

  /** JWT access token TTL (e.g., '8h', '15m'). */
  jwtAccessTtl: string;

  /** JWT refresh token TTL (e.g., '30d', '7d'). */
  jwtRefreshTtl: string;

  /** AES-256-GCM encryption key for TOTP secrets (64-char hex = 32 bytes). */
  totpEncryptionKey: string;
}

export const authConfig = registerAs(
  'auth',
  (): AuthConfig => ({
    jwtSecret: process.env['JWT_SECRET']!,
    jwtAccessTtl: process.env['JWT_ACCESS_TTL'] ?? '8h',
    jwtRefreshTtl: process.env['JWT_REFRESH_TTL'] ?? '30d',
    totpEncryptionKey: process.env['TOTP_ENCRYPTION_KEY']!,
  }),
);

// ---------------------------------------------------------------------------
// Joi validation fragment
// ---------------------------------------------------------------------------

export const authConfigSchema = Joi.object({
  JWT_SECRET: Joi.string()
    .min(32)
    .required()
    .messages({
      'string.min': 'JWT_SECRET must be at least 32 characters',
      'any.required': 'JWT_SECRET is required — generate with: openssl rand -hex 64',
    }),

  JWT_ACCESS_TTL: Joi.string()
    .pattern(/^\d+[smhd]$/)
    .default('8h')
    .messages({
      'string.pattern.base': 'JWT_ACCESS_TTL must be like "8h", "15m", "30s"',
    }),

  JWT_REFRESH_TTL: Joi.string()
    .pattern(/^\d+[smhd]$/)
    .default('30d')
    .messages({
      'string.pattern.base': 'JWT_REFRESH_TTL must be like "30d", "7d"',
    }),

  TOTP_ENCRYPTION_KEY: Joi.string()
    .length(64)
    .hex()
    .required()
    .messages({
      'string.length': 'TOTP_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes) — generate with: openssl rand -hex 32',
      'string.hex': 'TOTP_ENCRYPTION_KEY must be hex-encoded',
      'any.required': 'TOTP_ENCRYPTION_KEY is required for TOTP secret encryption',
    }),
});
