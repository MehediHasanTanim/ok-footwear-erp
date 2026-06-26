import {
  Inject,
  Logger,
  Module,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { default as IORedis } from 'ioredis';

import { AppConfigService } from '@shared/config/app-config.service';

import {
  REDIS_AUTH,
  REDIS_CACHE,
  REDIS_DB_AUTH,
  REDIS_DB_CACHE,
  REDIS_DB_QUEUE,
  REDIS_QUEUE,
} from './redis.constants';
import { RedisHealthService } from './redis-health.service';

// ---------------------------------------------------------------------------
// Type alias for the provider definition objects
// ---------------------------------------------------------------------------
interface RedisProviderDef {
  token: symbol;
  db: number;
  label: string;
}

/**
 * Per-client configuration for the three ioredis instances.
 *
 * Ordered by priority: QUEUE first because BullMQ will be initialized
 * against it and is the most latency-sensitive.
 */
const CLIENT_DEFS: readonly RedisProviderDef[] = [
  { token: REDIS_QUEUE, db: REDIS_DB_QUEUE, label: 'QUEUE' },
  { token: REDIS_AUTH, db: REDIS_DB_AUTH, label: 'AUTH' },
  { token: REDIS_CACHE, db: REDIS_DB_CACHE, label: 'CACHE' },
] as const;

// ---------------------------------------------------------------------------
// Retry & timeout constants
// ---------------------------------------------------------------------------
/** Maximum time (ms) to wait for initial Redis connection before aborting. */
const INITIAL_CONNECT_TIMEOUT_MS = 10_000;

/** Base delay (ms) for exponential backoff on reconnection attempts. */
const RETRY_BASE_DELAY_MS = 200;

/** Maximum delay (ms) between reconnection attempts. */
const RETRY_MAX_DELAY_MS = 5_000;

// ---------------------------------------------------------------------------
// Shared retry strategy for all three ioredis clients
// ---------------------------------------------------------------------------

/**
 * Creates a retry strategy with exponential backoff and logging.
 *
 * Key design decisions:
 * - No hard limit on retry count — runtime reconnections retry indefinitely.
 *   Startup enforcement is handled by a timeout wrapper in onModuleInit,
 *   NOT by limiting the retry strategy.
 * - Exponential backoff capped at 5s so transient outages recover quickly.
 * - Each retry is logged so operators can correlate with monitoring alerts.
 */
function createRetryStrategy(label: string): (times: number) => number {
  return (times: number): number => {
    const delay = Math.min(times * RETRY_BASE_DELAY_MS, RETRY_MAX_DELAY_MS);
    const logger = new Logger(`RedisClient:${label}`);
    logger.warn(`Reconnect attempt #${times} — waiting ${delay}ms`);
    return delay;
  };
}

// ---------------------------------------------------------------------------
// Factory: creates an ioredis client with lazyConnect
// ---------------------------------------------------------------------------

function createRedisClient(
  configService: AppConfigService,
  db: number,
  label: string,
): Redis {
  const url = configService.redisUrl;

  return new IORedis(url, {
    db,
    lazyConnect: true,

    // TCP-level connect timeout
    connectTimeout: 10_000,

    // Redis command timeout (blocking commands like BLPOP excluded)
    commandTimeout: 10_000,

    // Reconnect on connection loss with exponential backoff
    retryStrategy: createRetryStrategy(label),

    // DEVIATION: enableReadyCheck is left at its default (true).
    // This adds ~0.1ms latency per command but prevents commands from
    // being queued against a silently-disconnected socket.
    //
    // reconnectOnError: always return true — ioredis will attempt to
    // reconnect on READONLY and other common transient errors.
    reconnectOnError: (_err: Error): boolean => true,

    // BullMQ compatibility: must be null so BullMQ controls its own retries.
    // Applied to all three clients for consistency (no functional impact on
    // AUTH/CACHE clients).
    maxRetriesPerRequest: null,

    // Friendly name visible in Redis CLIENT LIST for debugging
    connectionName: `ok-erp-${label.toLowerCase()}`,
  });
}

// ---------------------------------------------------------------------------
// Build provider definitions for @Module()
// ---------------------------------------------------------------------------

function buildRedisProviders(): Array<{
  provide: symbol;
  inject: (typeof AppConfigService)[];
  useFactory: (configService: AppConfigService) => Redis;
}> {
  return CLIENT_DEFS.map((def) => ({
    provide: def.token,
    inject: [AppConfigService] as const,
    useFactory: (configService: AppConfigService): Redis =>
      createRedisClient(configService, def.db, def.label),
  }));
}

// ---------------------------------------------------------------------------
// RedisModule
// ---------------------------------------------------------------------------

/**
 * Redis infrastructure module.
 *
 * Provides three singleton ioredis clients, each connected to a separate
 * logical database:
 *   - REDIS_QUEUE → DB0 (BullMQ job data)
 *   - REDIS_AUTH  → DB1 (JWT refresh tokens, RBAC cache, MFA nonces)
 *   - REDIS_CACHE → DB2 (application query/response cache)
 *
 * Startup behavior (fail-fast):
 *   1. Factory providers create ioredis instances with lazyConnect=true.
 *   2. onModuleInit explicitly connects all three with a 10s timeout each.
 *      If any client fails, the module init throws → app startup aborted.
 *   3. RedisHealthService.onApplicationBootstrap does a final PING check.
 *
 * Shutdown behavior:
 *   4. onModuleDestroy calls client.quit() on all three for graceful disconnect.
 */
@Module({
  providers: [...buildRedisProviders(), RedisHealthService],
  exports: [REDIS_QUEUE, REDIS_AUTH, REDIS_CACHE],
})
export class RedisModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisModule.name);

  constructor(
    @Inject(REDIS_QUEUE) private readonly queueClient: Redis,
    @Inject(REDIS_AUTH) private readonly authClient: Redis,
    @Inject(REDIS_CACHE) private readonly cacheClient: Redis,
  ) {}

  // -----------------------------------------------------------------------
  // onModuleInit — connect all clients with a hard timeout
  // -----------------------------------------------------------------------

  async onModuleInit(): Promise<void> {
    const entries: Array<{ label: string; client: Redis }> = [
      { label: 'QUEUE', client: this.queueClient },
      { label: 'AUTH', client: this.authClient },
      { label: 'CACHE', client: this.cacheClient },
    ];

    for (const { label, client } of entries) {
      await this.connectWithTimeout(client, label);
    }

    this.logger.log(
      'All 3 Redis clients connected (DB0=QUEUE, DB1=AUTH, DB2=CACHE)',
    );
  }

  // -----------------------------------------------------------------------
  // onModuleDestroy — graceful disconnect
  // -----------------------------------------------------------------------

  async onModuleDestroy(): Promise<void> {
    const clients: Array<{ label: string; client: Redis }> = [
      { label: 'QUEUE', client: this.queueClient },
      { label: 'AUTH', client: this.authClient },
      { label: 'CACHE', client: this.cacheClient },
    ];

    await Promise.allSettled(
      clients.map(async ({ label, client }) => {
        try {
          await client.quit();
          this.logger.log(`Redis ${label} client disconnected`);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(`Redis ${label} disconnect warning: ${message}`);
        }
      }),
    );
  }

  // -----------------------------------------------------------------------
  // Private: connect a single client with timeout
  // -----------------------------------------------------------------------

  /**
   * Connect a single ioredis client with a hard timeout.
   *
   * If the connection isn't established within INITIAL_CONNECT_TIMEOUT_MS,
   * the pending connect promise is rejected, ioredis is force-disconnected
   * to stop any in-progress retry loop, and the error propagates up to
   * abort module initialization.
   */
  private async connectWithTimeout(
    client: Redis,
    label: string,
  ): Promise<void> {
    try {
      await Promise.race([
        client.connect(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  `Redis ${label} connection timeout after ${INITIAL_CONNECT_TIMEOUT_MS}ms`,
                ),
              ),
            INITIAL_CONNECT_TIMEOUT_MS,
          ),
        ),
      ]);
    } catch (error) {
      // Kill the retry loop — ioredis may still be attempting reconnects
      client.disconnect();
      const message =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Redis ${label} init FAILED: ${message}`);
      throw new Error(
        `Failed to connect Redis ${label} client: ${message}`,
      );
    }
  }
}
