import { registerAs } from '@nestjs/config';
import * as Joi from 'joi';

// =============================================================================
// SmsConfig — SSL Wireless (Bangladesh SMS gateway)
// =============================================================================
//
// SSL Wireless is the primary SMS gateway for Bangladeshi enterprises.
// API: https://sms.sslwireless.com/api/v3

export interface SmsConfig {
  /** SSL Wireless API base URL. */
  apiUrl: string;

  /** SSL Wireless API token. Empty in dev (SMS disabled). */
  apiToken: string;

  /** Sender ID displayed on recipient's phone. */
  senderId: string;
}

export const smsConfig = registerAs(
  'sms',
  (): SmsConfig => ({
    apiUrl:
      process.env['SMS_API_URL'] ?? 'https://sms.sslwireless.com/api/v3',
    apiToken: process.env['SMS_API_TOKEN'] ?? '',
    senderId: process.env['SMS_SENDER_ID'] ?? 'OKFOOTWEAR',
  }),
);

// ---------------------------------------------------------------------------
// Joi validation fragment
// ---------------------------------------------------------------------------

export const smsConfigSchema = Joi.object({
  SMS_API_URL: Joi.string()
    .uri()
    .default('https://sms.sslwireless.com/api/v3')
    .messages({
      'string.uri': 'SMS_API_URL must be a valid HTTPS URL',
    }),

  SMS_API_TOKEN: Joi.string()
    .allow('')
    .optional()
    .default('')
    .description('SSL Wireless API token (empty in dev = SMS disabled)'),

  SMS_SENDER_ID: Joi.string()
    .max(11)
    .default('OKFOOTWEAR')
    .messages({
      'string.max': 'SMS_SENDER_ID must be 11 characters or fewer (carrier limit)',
    }),
});
