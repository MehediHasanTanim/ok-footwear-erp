import { registerAs } from '@nestjs/config';
import * as Joi from 'joi';

// =============================================================================
// AwsConfig — S3 (MinIO in dev), SES (Mailpit in dev)
// =============================================================================
//
// In development, AWS credentials can be empty — the app falls back to
// MinIO / Mailpit. In production, credentials are required.

export interface AwsConfig {
  /** AWS region. */
  region: string;

  /** AWS access key ID. Empty in dev (uses MinIO). */
  accessKeyId: string;

  /** AWS secret access key. Empty in dev (uses MinIO). */
  secretAccessKey: string;

  /** S3 bucket name. */
  s3Bucket: string;
}

export const awsConfig = registerAs(
  'aws',
  (): AwsConfig => ({
    region: process.env['AWS_REGION'] ?? 'ap-southeast-1',
    accessKeyId: process.env['AWS_ACCESS_KEY_ID'] ?? '',
    secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] ?? '',
    s3Bucket: process.env['S3_BUCKET'] ?? 'ok-footwear-dev',
  }),
);

// ---------------------------------------------------------------------------
// Joi validation fragment
// ---------------------------------------------------------------------------

export const awsConfigSchema = Joi.object({
  AWS_REGION: Joi.string()
    .default('ap-southeast-1')
    .description('AWS region for S3 and SES'),

  AWS_ACCESS_KEY_ID: Joi.string()
    .allow('')
    .optional()
    .default('')
    .description('AWS access key ID (empty in dev = MinIO fallback)'),

  AWS_SECRET_ACCESS_KEY: Joi.string()
    .allow('')
    .optional()
    .default('')
    .description('AWS secret access key (empty in dev = MinIO fallback)'),

  S3_BUCKET: Joi.string()
    .default('ok-footwear-dev')
    .description('S3 bucket name'),
});
