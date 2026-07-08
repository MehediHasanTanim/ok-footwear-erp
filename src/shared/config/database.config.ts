import { registerAs } from '@nestjs/config';
import * as Joi from 'joi';

// =============================================================================
// DatabaseConfig — PostgreSQL 16 + PgBouncer
// =============================================================================

export interface DatabaseConfig {
  /** PgBouncer connection URL (port 6432, ?pgbouncer=true). */
  url: string;

  /** Direct PostgreSQL connection URL for migrations (port 5432). */
  directUrl: string;
}

export const databaseConfig = registerAs(
  'database',
  (): DatabaseConfig => ({
    url: process.env['DATABASE_URL']!,
    directUrl: process.env['DIRECT_DATABASE_URL']!,
  }),
);

// ---------------------------------------------------------------------------
// Joi validation fragment
// ---------------------------------------------------------------------------

export const databaseConfigSchema = Joi.object({
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required()
    .messages({
      'string.uri': 'DATABASE_URL must be a valid postgresql:// URI',
      'any.required': 'DATABASE_URL is required — app cannot start without database',
    }),

  DIRECT_DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required()
    .messages({
      'string.uri': 'DIRECT_DATABASE_URL must be a valid postgresql:// URI',
      'any.required': 'DIRECT_DATABASE_URL is required for prisma migrate',
    }),
});
