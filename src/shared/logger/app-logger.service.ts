import { Injectable, LoggerService } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { CorrelationStore } from './correlation-store';

// =============================================================================
// AppLogger — Structured logger with automatic field injection
// =============================================================================
//
// Wraps nestjs-pino's PinoLogger to inject correlation_id, user_id, and module
// into every log statement automatically. Services inject this instead of
// PinoLogger directly.
//
// Usage:
//   constructor(private readonly logger: AppLogger) {
//     this.logger.setModule('PayrollService');
//   }
//   this.logger.info('Generated payslip', { employeeId: '123' });
//
// Output (JSON):
//   { "level":30, "msg":"Generated payslip", "correlation_id":"019ee...",
//     "module":"PayrollService", "employeeId":"123", ... }
//
// For HTTP auto-logs (pino-http), module defaults to 'http'. To customize:
//   Use AppLogger.setModule() in a NestJS interceptor or guard.

@Injectable()
export class AppLogger implements LoggerService {
  /** The module/class name — set via setModule() or setContext(). */
  private moduleName = 'unknown';

  constructor(private readonly pinoLogger: PinoLogger) {}

  // -----------------------------------------------------------------------
  // Module name
  // -----------------------------------------------------------------------

  /**
   * Set the module name for this logger instance.
   *
   * Call in constructor to tag all logs from this service with the module.
   * Also sets the PinoLogger context for compatibility with nestjs-pino.
   */
  setModule(name: string): void {
    this.moduleName = name;
    this.pinoLogger.setContext(name);
  }

  /**
   * Get the current module name.
   */
  getModule(): string {
    return this.moduleName;
  }

  // -----------------------------------------------------------------------
  // Log methods — each adds correlation_id, user_id, and module
  // -----------------------------------------------------------------------

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.pinoLogger.info(this.buildMergeObject(), String(message), ...optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.pinoLogger.error(this.buildMergeObject(), String(message), ...optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.pinoLogger.warn(this.buildMergeObject(), String(message), ...optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.pinoLogger.debug(this.buildMergeObject(), String(message), ...optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.pinoLogger.trace(this.buildMergeObject(), String(message), ...optionalParams);
  }

  /** Alias for log() — convenience. */
  info(message: unknown, ...optionalParams: unknown[]): void {
    this.log(message, ...optionalParams);
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  /**
   * Build the merge object injected into every log statement.
   *
   * This is the first argument to pino's log methods, which merges these
   * fields into the output JSON alongside any additional fields from the
   * log call itself.
   */
  private buildMergeObject(): Record<string, unknown> {
    const ctx = CorrelationStore.getStore();

    return {
      correlation_id: ctx?.correlationId,
      user_id: ctx?.userId,
      module: this.moduleName,
    };
  }
}
