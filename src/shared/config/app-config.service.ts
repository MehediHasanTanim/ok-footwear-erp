import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { DatabaseConfig } from './database.config';
import type { RedisConfig } from './redis.config';
import type { AuthConfig } from './auth.config';
import type { AwsConfig } from './aws.config';
import type { SmsConfig } from './sms.config';

// =============================================================================
// AppConfigService — Typed, namespaced configuration facade
// =============================================================================
//
// Wraps @nestjs/config's ConfigService to provide typed, structured access
// to all 5 configuration namespaces.
//
// Design decisions:
// - Namespace getters return the full typed config object — callers destructure
//   what they need (e.g., `config.database.url`).
// - `getOrThrow()` ensures the app can't start with a missing namespace.
//   If a namespace failed to load, NestJS already aborted during ConfigModule
//   initialization (fail-fast); this is the second safety net.
// - App-level settings (nodeEnv, port, allowedOrigins) remain as flat getters
//   because they don't belong to any business namespace.
// - All secrets/URLs read from ConfigService — never hardcoded.

@Injectable()
export class AppConfigService {
  constructor(
    private readonly configService: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // Application-level settings
  // ---------------------------------------------------------------------------

  get nodeEnv(): string {
    return this.configService.getOrThrow<string>('NODE_ENV');
  }

  get port(): number {
    return this.configService.getOrThrow<number>('PORT');
  }

  get allowedOrigins(): string[] {
    return this.configService
      .getOrThrow<string>('ALLOWED_ORIGINS')
      .split(',')
      .map((o) => o.trim());
  }

  // ---------------------------------------------------------------------------
  // Namespace accessors — typed, fail-fast
  // ---------------------------------------------------------------------------

  /** PostgreSQL 16 + PgBouncer configuration. */
  get database(): DatabaseConfig {
    return this.configService.getOrThrow<DatabaseConfig>('database');
  }

  /** Redis 7 configuration (ioredis). */
  get redis(): RedisConfig {
    return this.configService.getOrThrow<RedisConfig>('redis');
  }

  /** JWT, RBAC, MFA configuration. */
  get auth(): AuthConfig {
    return this.configService.getOrThrow<AuthConfig>('auth');
  }

  /** AWS S3 + SES configuration (MinIO fallback in dev). */
  get aws(): AwsConfig {
    return this.configService.getOrThrow<AwsConfig>('aws');
  }

  /** SSL Wireless SMS gateway configuration. */
  get sms(): SmsConfig {
    return this.configService.getOrThrow<SmsConfig>('sms');
  }

  // ---------------------------------------------------------------------------
  // Convenience getters — commonly used flat values from namespaces
  // ---------------------------------------------------------------------------
  // Kept for backward compatibility with existing code (QueueModule, RedisModule,
  // LoggerModule). These delegate to the namespaced accessors.
  // Once all consumers migrate to config.database.url pattern, these can be
  // removed (Sprint 2 cleanup).

  /** Direct alias for config.database.url. */
  get databaseUrl(): string {
    return this.database.url;
  }

  /** Direct alias for config.database.directUrl. */
  get directDatabaseUrl(): string {
    return this.database.directUrl;
  }

  /** Direct alias for config.redis.url. */
  get redisUrl(): string {
    return this.redis.url;
  }

  /** Direct alias for config.auth.jwtSecret. */
  get jwtSecret(): string {
    return this.auth.jwtSecret;
  }

  /** Direct alias for config.auth.jwtAccessTtl. */
  get jwtAccessTtl(): string {
    return this.auth.jwtAccessTtl;
  }

  /** Direct alias for config.auth.jwtRefreshTtl. */
  get jwtRefreshTtl(): string {
    return this.auth.jwtRefreshTtl;
  }

  /** Direct alias for config.aws.region. */
  get awsRegion(): string {
    return this.aws.region;
  }

  /** Direct alias for config.aws.accessKeyId. */
  get awsAccessKeyId(): string {
    return this.aws.accessKeyId;
  }

  /** Direct alias for config.aws.secretAccessKey. */
  get awsSecretAccessKey(): string {
    return this.aws.secretAccessKey;
  }

  /** Direct alias for config.aws.s3Bucket. */
  get s3Bucket(): string {
    return this.aws.s3Bucket;
  }

  /** Direct alias for config.sms.apiUrl. */
  get smsApiUrl(): string {
    return this.sms.apiUrl;
  }

  /** Direct alias for config.sms.apiToken. */
  get smsApiToken(): string {
    return this.sms.apiToken;
  }

  /** Direct alias for config.sms.senderId. */
  get smsSenderId(): string {
    return this.sms.senderId;
  }
}
