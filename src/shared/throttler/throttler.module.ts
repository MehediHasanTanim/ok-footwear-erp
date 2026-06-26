import { Module } from '@nestjs/common';
import { ThrottlerModule as NestThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';

import { RedisModule, REDIS_CACHE } from '@infrastructure/redis';
import type { Redis } from 'ioredis';

import { RedisSlidingWindowStorage } from './redis-throttler-storage.service';

// =============================================================================
// ThrottlerModule — Redis-backed sliding-window rate limiting
// =============================================================================
//
// Replaces the previous in-memory ThrottlerModule.forRoot() in AppModule
// with a Redis-backed implementation using sorted-set sliding windows.
//
// Configuration:
//   - 100 requests per 60s window per IP address
//   - Blocked for 60s after exceeding limit (configurable via env later)
//   - Retry-After header included in 429 responses
//   - Global ThrottlerGuard via APP_GUARD provider
//
// Redis storage:
//   - Uses REDIS_CACHE client (Redis DB2 — application cache)
//   - Sliding window via ZSET (zadd + zremrangebyscore + zcard)
//   - Fails open if Redis is unreachable (rate limiting degraded, not broken)

@Module({
  imports: [
    // Need RedisModule for the REDIS_CACHE ioredis client
    RedisModule,

    NestThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [REDIS_CACHE],
      useFactory: (redis: Redis) => ({
        throttlers: [
          {
            name: 'default',
            ttl: 60_000, // 60 seconds in ms
            limit: 100, // 100 requests per window
          },
        ],
        storage: new RedisSlidingWindowStorage(redis),
        errorMessage: 'Too many requests. Please try again later.',
      }),
    }),
  ],

  providers: [
    // Global ThrottlerGuard — applies to ALL routes
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class ThrottlerModule {}
