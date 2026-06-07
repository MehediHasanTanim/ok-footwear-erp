import { Module, Global } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

/**
 * Structured JSON logger module.
 *
 * Uses nestjs-pino which wraps pino-http for HTTP request logging.
 * Correlation IDs (X-Correlation-ID header) are handled by pino-http's
 * genReqId option, generating UUID v7 on demand.
 *
 * Design decisions:
 * - @Global: logger is used in exceptions filters, interceptors, and guards
 *   that may be instantiated outside the module tree.
 * - Pretty-print in development; JSON in production for log aggregation.
 * - Redact Authorization header to prevent token leakage in logs.
 */
@Global()
@Module({
  imports: [
    PinoLoggerModule.forRoot({
      pinoHttp: {
        // Use X-Correlation-ID if present, otherwise generate UUID v7
        genReqId: (req) =>
          req.headers['x-correlation-id'] ?? crypto.randomUUID(),
        // Redact sensitive headers from logs
        redact: {
          paths: ['req.headers.authorization', 'req.headers.cookie'],
          censor: '[REDACTED]',
        },
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
            : undefined,
        serializers: {
          req: (req) => ({
            id: req.id,
            method: req.method,
            url: req.url,
          }),
          res: (res) => ({
            statusCode: res.statusCode,
          }),
        },
      },
    }),
  ],
  exports: [PinoLoggerModule],
})
export class LoggerModule {}
