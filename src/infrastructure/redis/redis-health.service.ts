import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { REDIS_QUEUE } from './redis.constants';

/**
 * Redis connection health check.
 *
 * Runs during application bootstrap (before HTTP server starts). If the Redis
 * instance is unreachable, the PING will throw and NestJS will abort startup.
 * This satisfies the constraint: "Health check must block app startup if Redis
 * unreachable."
 *
 * We only PING the queue client (DB0) because all three clients share the same
 * Redis host/port. If DB0 is reachable, DB1 and DB2 are reachable too.
 */
@Injectable()
export class RedisHealthService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RedisHealthService.name);

  constructor(
    @Inject(REDIS_QUEUE) private readonly redis: Redis,
  ) {}

  /**
   * Called automatically by NestJS after all modules are initialized but
   * before the HTTP server starts accepting connections.
   *
   * Throws if Redis is unreachable → app startup fails fast.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const response = await this.redis.ping();
      this.logger.log(`Redis health check OK — PING → "${response}"`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Redis health check FAILED: ${message}`);
      throw new Error(
        `Redis unreachable — aborting startup. Cause: ${message}`,
      );
    }
  }
}
