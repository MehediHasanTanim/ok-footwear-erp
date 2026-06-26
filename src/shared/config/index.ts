// Module + Service
export { AppConfigModule } from './app-config.module';
export { AppConfigService } from './app-config.service';

// Combined schema
export { appConfigSchema } from './app-config.schema';

// Namespace types
export type { DatabaseConfig } from './database.config';
export type { RedisConfig } from './redis.config';
export type { AuthConfig } from './auth.config';
export type { AwsConfig } from './aws.config';
export type { SmsConfig } from './sms.config';

// Namespace config objects (for direct injection via @Inject(databaseConfig.KEY))
export { databaseConfig } from './database.config';
export { redisConfig } from './redis.config';
export { authConfig } from './auth.config';
export { awsConfig } from './aws.config';
export { smsConfig } from './sms.config';
