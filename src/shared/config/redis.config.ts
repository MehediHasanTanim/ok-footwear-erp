import { registerAs } from '@nestjs/config';
import * as Joi from 'joi';

// =============================================================================
// RedisConfig — Redis 7 with ioredis
// =============================================================================
//
// DB allocation (see src/infrastructure/redis/redis.constants.ts):
//   DB0 — BullMQ queues
//   DB1 — Auth (JWT refresh tokens, RBAC cache, MFA nonces)
//   DB2 — Application cache

export interface RedisConfig {
  /** Redis connection URL (redis:// or rediss://). */
  url: string;
}

export const redisConfig = registerAs(
  'redis',
  (): RedisConfig => ({
    url: process.env['REDIS_URL']!,
  }),
);

// ---------------------------------------------------------------------------
// Joi validation fragment
// ---------------------------------------------------------------------------

export const redisConfigSchema = Joi.object({
  REDIS_URL: Joi.string()
    .uri({ scheme: [/^redis(s)?$/] })
    .default('redis://localhost:7379')
    .messages({
      'string.uri': 'REDIS_URL must be a valid redis:// or rediss:// URI',
    }),
});
