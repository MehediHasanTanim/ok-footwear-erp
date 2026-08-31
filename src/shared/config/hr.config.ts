import { registerAs } from '@nestjs/config';
import * as Joi from 'joi';

export interface HrConfig {
  piiEncryptionKey: string;
  pfInterestRatePct: number;
}

export const hrConfig = registerAs(
  'hr',
  (): HrConfig => ({
    piiEncryptionKey: process.env['HR_PII_ENCRYPTION_KEY']!,
    pfInterestRatePct: Number(process.env['HR_PF_INTEREST_RATE_PCT'] ?? '8'),
  }),
);

export const hrConfigSchema = Joi.object({
  HR_PII_ENCRYPTION_KEY: Joi.string()
    .length(64)
    .hex()
    .required()
    .messages({
      'string.length':
        'HR_PII_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)',
      'any.required': 'HR_PII_ENCRYPTION_KEY is required for HR PII encryption',
    }),

  HR_PF_INTEREST_RATE_PCT: Joi.number().min(0).max(100).default(8),
});
