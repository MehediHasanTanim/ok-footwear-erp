import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { databaseConfig } from './database.config';
import { redisConfig } from './redis.config';
import { authConfig } from './auth.config';
import { awsConfig } from './aws.config';
import { smsConfig } from './sms.config';
import { procurementConfig } from './procurement.config';

import { appConfigSchema } from './app-config.schema';
import { AppConfigService } from './app-config.service';

// =============================================================================
// AppConfigModule — Global configuration with namespace-based Joi validation
// =============================================================================
//
// Loads 5 namespace configs via NestJS's registerAs() pattern:
//   - database  → PostgreSQL 16 + PgBouncer
//   - redis     → Redis 7 (ioredis)
//   - auth      → JWT, RBAC, MFA
//   - aws       → S3, SES (MinIO fallback in dev)
//   - sms       → SSL Wireless (Bangladesh SMS gateway)
//
// Validation:
//   - Joi validates ALL env vars at startup.
//   - If any required var is missing, the app throws BEFORE the HTTP server
//     binds — fail-fast.
//   - allowUnknown: true → ignore system env vars (HOME, PATH, NODE_OPTIONS).
//   - abortEarly: false  → report ALL validation errors at once.
//
// Env file loading order (first match wins):
//   1. .env.local       — Local overrides (gitignored)
//   2. .env             — Shared defaults (committed, no secrets)
//
// For staging/production: deployment pipeline provides the env vars directly
// (12-factor app). .env.staging and .env.production are reference templates.
//
// @Global: AppConfigService is available everywhere without explicit imports.

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      // Env file loading — .env.local overrides .env
      envFilePath: ['.env.local', '.env'],

      // Load namespace configs
      load: [
        databaseConfig,
        redisConfig,
        authConfig,
        awsConfig,
        smsConfig,
        procurementConfig,
      ],

      // Combined Joi schema covering all namespaces
      validationSchema: appConfigSchema,

      validationOptions: {
        // Ignore env vars not in the schema (system vars)
        allowUnknown: true,

        // Report ALL errors at once, not just the first
        abortEarly: false,
      },

      // Cache loaded config — avoid re-parsing on every access
      cache: true,
    }),
  ],

  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
