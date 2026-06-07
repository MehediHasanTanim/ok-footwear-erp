import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Joi from 'joi';

/**
 * Validated, typed application configuration.
 *
 * Design decisions:
 * - Joi validation runs at module init (fail-fast on missing/invalid env vars).
 * - All secrets/URLs read from ConfigService — never hardcoded.
 * - Getters provide defaults for dev-friendliness (e.g., default port 3000).
 *
 * Add new config sections by extending the envSchema and getter methods.
 */

export const appConfigSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'staging', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),

  // CORS
  CORS_ORIGINS: Joi.string().default('http://localhost:5173'),

  // Database (Prisma will read DATABASE_URL directly)
  // DEVIATION: DATABASE_URL is optional in Sprint 1 — Prisma is set up
  // in a separate Sprint 1 task. Will be made required in Sprint 2.
  DATABASE_URL: Joi.string().uri().optional().default(''),

  // Redis
  REDIS_URL: Joi.string().uri().default('redis://localhost:6379'),

  // JWT
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.string().default('8h'),
  JWT_REFRESH_TTL: Joi.string().default('30d'),

  // AWS (optional in dev)
  AWS_REGION: Joi.string().default('ap-southeast-1'),
  AWS_ACCESS_KEY_ID: Joi.string().allow('').optional().default(''),
  AWS_SECRET_ACCESS_KEY: Joi.string().allow('').optional().default(''),
  S3_BUCKET: Joi.string().default('ok-footwear-dev'),

  // SMS (SSL Wireless — Bangladesh provider)
  SMS_API_URL: Joi.string().uri().default('https://sms.sslwireless.com/api/v3'),
  SMS_API_TOKEN: Joi.string().allow('').optional().default(''),
  SMS_SENDER_ID: Joi.string().default('OKFOOTWEAR'),
});

export type AppConfig = {
  NODE_ENV: string;
  PORT: number;
  CORS_ORIGINS: string;
  DATABASE_URL: string;
  REDIS_URL: string;
  JWT_SECRET: string;
  JWT_ACCESS_TTL: string;
  JWT_REFRESH_TTL: string;
  AWS_REGION: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  S3_BUCKET: string;
  SMS_API_URL: string;
  SMS_API_TOKEN: string;
  SMS_SENDER_ID: string;
};

@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService<AppConfig>) {}

  get nodeEnv(): string {
    return this.configService.get('NODE_ENV')!;
  }

  get port(): number {
    return this.configService.get('PORT')!;
  }

  get corsOrigins(): string[] {
    return this.configService
      .get('CORS_ORIGINS')!
      .split(',')
      .map((o: string) => o.trim());
  }

  get databaseUrl(): string {
    return this.configService.get('DATABASE_URL')!;
  }

  get redisUrl(): string {
    return this.configService.get('REDIS_URL')!;
  }

  get jwtSecret(): string {
    return this.configService.get('JWT_SECRET')!;
  }

  get jwtAccessTtl(): string {
    return this.configService.get('JWT_ACCESS_TTL')!;
  }

  get jwtRefreshTtl(): string {
    return this.configService.get('JWT_REFRESH_TTL')!;
  }

  get awsRegion(): string {
    return this.configService.get('AWS_REGION')!;
  }

  get awsAccessKeyId(): string {
    return this.configService.get('AWS_ACCESS_KEY_ID')!;
  }

  get awsSecretAccessKey(): string {
    return this.configService.get('AWS_SECRET_ACCESS_KEY')!;
  }

  get s3Bucket(): string {
    return this.configService.get('S3_BUCKET')!;
  }

  get smsApiUrl(): string {
    return this.configService.get('SMS_API_URL')!;
  }

  get smsApiToken(): string {
    return this.configService.get('SMS_API_TOKEN')!;
  }

  get smsSenderId(): string {
    return this.configService.get('SMS_SENDER_ID')!;
  }
}
