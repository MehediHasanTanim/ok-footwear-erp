import { Injectable, Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { Redis } from 'ioredis';

// ---------------------------------------------------------------------------
// Local type: matches @nestjs/throttler's ThrottlerStorageRecord
// (not exported from the package's public API in v6, so we replicate it)
// ---------------------------------------------------------------------------
interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

// =============================================================================
// RedisSlidingWindowStorage — Sliding-window rate limiter backed by Redis
// =============================================================================
//
// Uses Redis sorted sets (ZSET) to implement a sliding-window rate limiting
// algorithm. Unlike fixed-window (which resets at interval boundaries), the
// sliding window tracks individual request timestamps and removes expired
// ones, giving a true "last N seconds" count.
//
// Algorithm (per key):
//   1. ADD  current timestamp to sorted set (score = ms, member = unique ID).
//   2. REM  members older than (now - ttl*1000) from the sorted set.
//   3. COUNT remaining members → totalHits.
//   4. EXPIRE the key after ttl seconds (auto-cleanup).
//   5. Calculate timeToExpire from the oldest remaining member.
//
// Key format: ratelimit:{throttlerName}:{key}
// Example:   ratelimit:default:192.168.1.1
//
// All operations for a single increment are atomic via a MULTI/EXEC pipeline
// (ioredis.multi()), ensuring no race conditions between concurrent requests.

@Injectable()
export class RedisSlidingWindowStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisSlidingWindowStorage.name);

  /** Redis key prefix for rate limit data. */
  private readonly PREFIX = 'ratelimit';

  constructor(private readonly redis: Redis) {}

  /**
   * Increment the hit count for a key and return the throttling state.
   *
   * @param key           Unique identifier (e.g., IP address, user ID).
   * @param ttl           Time-to-live in SECONDS for the sliding window.
   * @param limit         Maximum allowed hits within the window.
   * @param blockDuration Duration in SECONDS to block after limit exceeded.
   * @param throttlerName Name of the throttler configuration (e.g., 'default').
   */
  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const redisKey = `${this.PREFIX}:${throttlerName}:${key}`;
    const now = Date.now();
    const windowStart = now - ttl * 1_000;
    const member = `${now}:${Math.random().toString(36).slice(2, 10)}`;

    try {
      // Atomic pipeline — all ZSET operations execute sequentially on Redis
      const results = await this.redis
        .multi()
        // 1. Add current request to the sorted set
        .zadd(redisKey, now, member)
        // 2. Remove requests older than the sliding window
        .zremrangebyscore(redisKey, 0, windowStart)
        // 3. Count requests within the window
        .zcard(redisKey)
        // 4. Set expiry on the key for auto-cleanup (ttl + buffer)
        .expire(redisKey, ttl + 1)
        // 5. Get the oldest timestamp in the window (for timeToExpire)
        .zrange(redisKey, 0, 0, 'WITHSCORES')
        .exec();

      if (!results) {
        // Redis pipeline returned null — connection issue
        this.logger.warn('Redis MULTI pipeline returned null — rate limiting degraded');
        return {
          totalHits: 0,
          timeToExpire: 0,
          isBlocked: false,
          timeToBlockExpire: 0,
        };
      }

      // Extract results: zcard is at index 3 (0=zadd, 1=zremrangebyscore, 2=zcard, 3=expire, 4=zrange)
      const totalHits = (results[2]?.[1] as number) ?? 0;
      const oldestEntry = results[4]?.[1] as [string, string] | undefined;
      const oldestTimestamp = oldestEntry?.[1]
        ? parseInt(oldestEntry[1], 10)
        : now;

      // Time until the oldest request expires from the window (in ms)
      const timeToExpireMs = Math.max(0, oldestTimestamp + ttl * 1_000 - now);
      const timeToExpire = Math.ceil(timeToExpireMs / 1_000); // seconds

      // Check if blocked
      const isBlocked = totalHits > limit;
      const timeToBlockExpire = isBlocked ? blockDuration : 0;

      return {
        totalHits,
        timeToExpire,
        isBlocked,
        timeToBlockExpire,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Redis rate limit error for key "${redisKey}": ${message}`,
      );

      // DEVIATION: On Redis failure, we return a "pass" record (not blocked).
      // This is a deliberate choice: rate limiting should not become a single
      // point of failure. If Redis is down, we fail open rather than blocking
      // ALL traffic. The Redis health check (RedisHealthService) already
      // prevents app startup if Redis is unreachable at boot time.
      return {
        totalHits: 0,
        timeToExpire: 0,
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }
}
