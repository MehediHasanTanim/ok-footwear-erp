import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppConfigService, appConfigSchema } from './app-config.service';

/**
 * Global configuration module.
 *
 * Registers ConfigModule.forRoot() with Joi validation and makes
 * AppConfigService available throughout the application without
 * requiring explicit imports.
 *
 * @Global decorator: avoid importing AppConfigModule in every feature module.
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['.env.local', '.env'],
      validationSchema: appConfigSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false, // report all errors, not just the first
      },
      cache: true,
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
