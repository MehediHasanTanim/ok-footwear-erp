import {
  NestFactory,
  Reflector,
} from '@nestjs/core';
import {
  ValidationPipe,
  Logger,
  ShutdownSignal,
  ClassSerializerInterceptor,
} from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from '@/app.module';
import { AppConfigService } from '@shared/config/app-config.service';
import { CorrelationMiddleware } from '@shared/logger';
import {
  HttpExceptionFilter,
  validationExceptionFactory,
} from '@common/filters';
import { ResponseInterceptor } from '@common/interceptors';

/**
 * Bootstrap the NestJS application with the Express adapter.
 *
 * Key decisions:
 * - Express adapter (not Fastify): chosen for broader middleware ecosystem
 *   compatibility (helmet, pino-http, express-session for potential SSE fallback).
 * - Correlation middleware runs FIRST (before helmet, before pino-http) to
 *   ensure correlation_id is available for all downstream middleware and loggers.
 * - Helmet with production-grade security headers: CSP, HSTS, X-Frame-Options.
 * - CORS: strict origin whitelist from ALLOWED_ORIGINS env var. Unlisted
 *   origins are rejected with a CORS error (handled by Express cors middleware).
 * - Global HttpExceptionFilter: transforms ALL errors into RFC 7807
 *   application/problem+json format.
 * - Global interceptors (registration order matters):
 *   1. ResponseInterceptor (outermost) — wraps 2xx in { data, timestamp }.
 *   2. ClassSerializerInterceptor (innermost) — strips @Exclude() fields
 *      BEFORE the envelope wrapper applies.
 * - ValidationPipe with structured errors: custom exceptionFactory produces
 *   { field, message } arrays for RFC 7807 compliance.
 * - Swagger conditional: enabled only in non-production environments.
 * - SIGTERM handling: graceful shutdown for k8s rolling deployments.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(), {
    bufferLogs: true,
  });

  // ---------------------------------------------------------------------------
  // Correlation ID middleware — MUST run before all other middleware
  // ---------------------------------------------------------------------------
  const correlationMiddleware = new CorrelationMiddleware();
  app.use(correlationMiddleware.use.bind(correlationMiddleware));

  // Retrieve typed config service
  const configService = app.get(AppConfigService);
  const isProduction = configService.nodeEnv === 'production';

  // ---------------------------------------------------------------------------
  // Helmet — security headers
  // ---------------------------------------------------------------------------
  app.use(
    helmet({
      // Content Security Policy: restrict script/style sources to self
      contentSecurityPolicy: isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:'],
              connectSrc: ["'self'"],
              fontSrc: ["'self'"],
              objectSrc: ["'none'"],
              mediaSrc: ["'self'"],
              frameSrc: ["'none'"],
            },
          }
        : false, // Disable CSP in dev to allow Swagger UI and Bull Board

      // HTTP Strict Transport Security — enforce HTTPS for 1 year
      strictTransportSecurity: isProduction
        ? {
            maxAge: 31_536_000, // 365 days in seconds
            includeSubDomains: true,
            preload: true,
          }
        : false,

      // Prevent clickjacking
      xFrameOptions: { action: 'deny' },

      // Prevent MIME type sniffing
      xContentTypeOptions: true,

      // Referrer Policy
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },

      // Disable X-Powered-By header
      hidePoweredBy: true,
    }),
  );

  // ---------------------------------------------------------------------------
  // CORS — strict origin whitelist from ALLOWED_ORIGINS env var
  // ---------------------------------------------------------------------------
  const allowedOrigins = configService.allowedOrigins;

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, Postman, curl)
      if (!origin) {
        callback(null, true);
        return;
      }

      // DEVIATION: In development, allow localhost on any port.
      // This avoids needing to update ALLOWED_ORIGINS every time the
      // frontend dev server changes ports.
      if (!isProduction && origin.startsWith('http://localhost:')) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(
          new Error(
            `Origin "${origin}" is not allowed. ` +
              `Configure ALLOWED_ORIGINS to include this origin.`,
          ),
        );
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
    exposedHeaders: ['X-Correlation-ID', 'Retry-After'],
  });

  // ---------------------------------------------------------------------------
  // Global prefix for API versioning
  // ---------------------------------------------------------------------------
  app.setGlobalPrefix('api/v1');

  // ---------------------------------------------------------------------------
  // Global interceptors — ORDER MATTERS
  // ---------------------------------------------------------------------------
  app.useGlobalInterceptors(
    new ResponseInterceptor(),
    new ClassSerializerInterceptor(app.get(Reflector)),
  );

  // ---------------------------------------------------------------------------
  // Global RFC 7807 exception filter — catches ALL errors
  // ---------------------------------------------------------------------------
  app.useGlobalFilters(new HttpExceptionFilter());

  // ---------------------------------------------------------------------------
  // Global validation pipe — strict whitelist + transform + structured errors
  // ---------------------------------------------------------------------------
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: false,
      },
      forbidUnknownValues: true,
      exceptionFactory: (validationErrors) =>
        validationExceptionFactory(validationErrors),
    }),
  );

  // ---------------------------------------------------------------------------
  // Swagger / OpenAPI — non-production only
  // ---------------------------------------------------------------------------
  if (!isProduction) {
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
