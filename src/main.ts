import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger, ShutdownSignal } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from '@/app.module';
import { AppConfigService } from '@shared/config/app-config.service';

/**
 * Bootstrap the NestJS application with the Express adapter.
 *
 * Key decisions:
 * - Express adapter (not Fastify): chosen for broader middleware ecosystem
 *   compatibility (helmet, pino-http, express-session for potential SSE fallback).
 * - ValidationPipe with whitelist: strips unknown properties to prevent mass-assignment.
 * - Swagger conditional: enabled only in non-production environments.
 * - SIGTERM handling: graceful shutdown for k8s rolling deployments.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(), {
    bufferLogs: true,
  });

  // Retrieve typed config service
  const configService = app.get(AppConfigService);

  // ---------------------------------------------------------------------------
  // Global security middleware
  // ---------------------------------------------------------------------------
  app.use(helmet());

  // ---------------------------------------------------------------------------
  // CORS — configured from environment
  // ---------------------------------------------------------------------------
  app.enableCors({
    origin: configService.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
  });

  // ---------------------------------------------------------------------------
  // Global prefix for API versioning
  // ---------------------------------------------------------------------------
  app.setGlobalPrefix('api/v1');

  // ---------------------------------------------------------------------------
  // Global validation pipe — strict whitelist + transform
  // ---------------------------------------------------------------------------
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: false, // explicit types in DTOs only
      },
      // Do not strip validated DTOs of unknown props on non-whitelisted paths
      forbidUnknownValues: true,
    }),
  );

  // ---------------------------------------------------------------------------
  // Swagger / OpenAPI — non-production only
  // ---------------------------------------------------------------------------
  if (configService.nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('OK Footwear ERP API')
      .setDescription('Bangladesh-based footwear manufacturing & export ERP')
      .setVersion('0.1.0')
      .addBearerAuth()
      .addServer(`http://localhost:${configService.port}`, 'Local development')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  // ---------------------------------------------------------------------------
  // Graceful shutdown hooks
  // ---------------------------------------------------------------------------
  app.enableShutdownHooks([ShutdownSignal.SIGTERM, ShutdownSignal.SIGINT]);

  // ---------------------------------------------------------------------------
  // Start listening
  // ---------------------------------------------------------------------------
  const logger = new Logger('Bootstrap');
  const port = configService.port;

  await app.listen(port);
  logger.log(`🚀 OK Footwear ERP running on http://localhost:${port}`);
  logger.log(`📖 Swagger docs: http://localhost:${port}/api/docs`);
}

void bootstrap();
