import * as Joi from 'joi';

import { databaseConfigSchema } from './database.config';
import { redisConfigSchema } from './redis.config';
import { authConfigSchema } from './auth.config';
import { awsConfigSchema } from './aws.config';
import { smsConfigSchema } from './sms.config';
import { procurementConfigSchema } from './procurement.config';

// =============================================================================
// Combined Application Configuration Schema
// =============================================================================
//
// Concatenates all 5 namespace schemas into a single Joi object that
// validates EVERY environment variable at startup.
//
// If any required variable is missing or invalid, the application throws
// during module initialization — before the HTTP server binds.
//
// Validation options (set in AppConfigModule):
//   - allowUnknown: true  → Ignore env vars not in the schema (e.g., system
//                          vars like HOME, PATH, NODE_OPTIONS).
//   - abortEarly: false   → Report ALL validation errors, not just the first.
//                          This gives operators a complete list of missing vars.

export const appConfigSchema = Joi.object({
  // Application-level settings (not part of any namespace)
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'staging', 'production')
    .default('development')
    .description('Runtime environment'),

  PORT: Joi.number()
    .port()
    .default(3000)
    .description('HTTP server port'),

  ALLOWED_ORIGINS: Joi.string()
    .default('http://localhost:7173')
    .description('Comma-separated allowed CORS origins — rejects unlisted origins with 403'),

  // -----------------------------------------------------------------------
  // Namespace schemas — each validates its own env var prefix
  // -----------------------------------------------------------------------
})
  .concat(databaseConfigSchema)
  .concat(redisConfigSchema)
  .concat(authConfigSchema)
  .concat(awsConfigSchema)
  .concat(smsConfigSchema)
  .concat(procurementConfigSchema);
