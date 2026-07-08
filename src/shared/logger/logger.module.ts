import { Module, Global } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { v7 as uuidv7 } from 'uuid';

import { AppConfigService } from '@shared/config/app-config.service';
import { CorrelationStore } from './correlation-store';
import { AppLogger } from './app-logger.service';

// =============================================================================
// LoggerModule — Structured JSON logging with correlation ID propagation
// =============================================================================
//
// Wraps nestjs-pino (which wraps pino-http) to provide:
//   - UUID v7 correlation_id in every log line (time-ordered, sortable)
//   - AsyncLocalStorage-based propagation (no req-scoped injection)
//   - X-Correlation-ID response header (always present)
//   - Required log fields: correlation_id, user_id, method, path,
//     status_code, duration_ms, module
//   - JSON structured format in production; pino-pretty in development
//   - Sensitive header redaction (Authorization, Cookie)
//
// @Global: logger is used in guards, filters, interceptors, and pipes
// that may be instantiated outside the normal module tree.

@Global()
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      // DEVIATION: We import AppConfigModule in the AppModule, but since
      // LoggerModule needs ConfigService for NODE_ENV, we use forRootAsync.
      // AppConfigModule is already @Global() so importing here is redundant
      // but harmless — NestJS deduplicates.
      inject: [AppConfigService],
      useFactory: (configService: AppConfigService) => ({
        pinoHttp: {
          // -------------------------------------------------------------
          // Log level — from env or default to 'info'
          // -------------------------------------------------------------
          level: configService.nodeEnv === 'production' ? 'info' : 'debug',

          // -------------------------------------------------------------
          // Correlation ID — read from req.id set by CorrelationMiddleware
          // -------------------------------------------------------------
          // req.id is set as UUID v7 in correlation.middleware.ts.
          // If somehow the middleware didn't run (shouldn't happen), fall
          // back to generating a v7 on the spot.
          genReqId: (req) => {
            const existing = (req as unknown as Record<string, unknown>).id;
            if (typeof existing === 'string' && existing.length > 0) {
              return existing;
            }
            return uuidv7();
          },

          // -------------------------------------------------------------
          // Mixin — inject correlation_id, user_id, and module into
          //        every HTTP auto-log line
          // -------------------------------------------------------------
          mixin() {
            const ctx = CorrelationStore.getStore();
            return {
              correlation_id: ctx?.correlationId,
              user_id: ctx?.userId,
              // module for HTTP-level logs defaults to 'http'; individual
              // services use AppLogger which sets their own module name
              module: 'http',
            };
          },

          // -------------------------------------------------------------
          // Custom serializers — log only the fields we need
          // -------------------------------------------------------------
          serializers: {
            req: (req) => ({
              method: req.method,
              path: req.url,
              // Do NOT include headers — they contain sensitive data
              // and the redact paths below handle header-level redaction
              // but we don't want full headers in logs anyway.
            }),
            res: (res) => ({
              status_code: res.statusCode,
            }),
          },

          // -------------------------------------------------------------
          // Custom log level for specific paths (health, metrics = trace)
          // -------------------------------------------------------------
          customLogLevel(_req, res, err) {
            if (err) return 'error'; // Always log errors
            if (res.statusCode >= 500) return 'error';
            if (res.statusCode >= 400) return 'warn';
            return 'info'; // Default: info level for success responses
          },

          // -------------------------------------------------------------
          // Auto-logging: skip health/metrics endpoints
          // -------------------------------------------------------------
          autoLogging: {
            ignore: (req) =>
              req.url?.startsWith('/health') === true ||
              req.url?.startsWith('/metrics') === true,
          },

          // -------------------------------------------------------------
          // Redact sensitive headers from logs
          // -------------------------------------------------------------
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["x-api-key"]',
            ],
            censor: '[REDACTED]',
          },

          // -------------------------------------------------------------
          // Quiet suppression of pino-http startup logs
          // -------------------------------------------------------------
          quietReqLogger: true,

          // -------------------------------------------------------------
          // Transport: pino-pretty in dev, raw JSON in prod
          // Gracefully falls back to JSON if pino-pretty is not installed
          // (e.g., stripped by npm prune --production).
          // -------------------------------------------------------------
          ...(configService.nodeEnv !== 'production'
            ? (() => {
                try {
                  require.resolve('pino-pretty');
                  return {
                    transport: {
                      target: 'pino-pretty',
                      options: {
                        colorize: true,
                        singleLine: false,
                        translateTime: 'SYS:standard',
                        ignore: 'pid,hostname',
                        messageFormat: '[{module}] {msg}',
                      },
                    },
                  };
                } catch {
                  return {};
                }
              })()
            : {}),
        },

        // Exclude health/metrics from pino-http middleware entirely
        exclude: ['/health', '/metrics'],
      }),
    }),
  ],

  providers: [
    // AppLogger wraps PinoLogger with automatic correlation_id + module injection
    AppLogger,
  ],

  exports: [PinoLoggerModule, AppLogger],
})
export class LoggerModule {}
