// =============================================================================
// AuditInterceptor — Automatic Audit Trail
// =============================================================================
// OK Footwear ERP — Sprint 2
//
// Intercepts POST/PATCH/PUT/DELETE requests on @AuditTable() methods.
// Captures old_value (pre-mutation), new_value (post-mutation), and writes
// to the partitioned sys.audit_logs table via $queryRaw.
//
// Architecture:
//   - pre-hook: read entity BEFORE handler (for old_value on PATCH/PUT/DELETE)
//   - tap(): capture response body as new_value, write audit row
//
// Error handling: audit failures must NEVER fail the main request.
// All audit writes are wrapped in try/catch with warning-level logs.
// =============================================================================

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Observable, of } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { PrismaService } from '@shared/database/prisma.service';
import { AuditService } from '@modules/system/services/audit.service';
import { CorrelationStore } from '@shared/logger/correlation-store';
import {
  AUDIT_TABLE_KEY,
  SKIP_AUDIT_KEY,
} from '@common/decorators/audit.decorator';
import type { AuditAction } from '@modules/system/services/audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  /** Methods that trigger audit logging. */
  private static readonly AUDITED_METHODS = new Set([
    'POST',
    'PATCH',
    'PUT',
    'DELETE',
  ]);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method.toUpperCase();
    const handler = context.getHandler();

    // -------------------------------------------------------------------
    // Skip conditions
    // -------------------------------------------------------------------
    if (!AuditInterceptor.AUDITED_METHODS.has(method)) return next.handle();

    const skipAudit = this.reflector.get<boolean>(SKIP_AUDIT_KEY, handler);
    if (skipAudit) return next.handle();

    const tableName = this.reflector.get<string>(AUDIT_TABLE_KEY, handler);
    if (!tableName) return next.handle();

    // -------------------------------------------------------------------
    // Extract context
    // -------------------------------------------------------------------
    const correlationCtx = CorrelationStore.getStore();
    const user = (request as unknown as Record<string, unknown>)['user'] as
      | { sub?: string }
      | undefined;
    const recordId = this.extractRecordId(request);
    const action = this.methodToAction(method);
    const ip = request.ip ?? null;
    const userAgent = request.headers['user-agent'] ?? null;

    // -------------------------------------------------------------------
    // Pre-hook: capture old_value (for UPDATE/DELETE)
    // -------------------------------------------------------------------
    const oldValuePromise =
      action === 'UPDATE' || action === 'DELETE'
        ? this.fetchOldValue(tableName, recordId)
        : Promise.resolve(null);

    // -------------------------------------------------------------------
    // tap() on observable: capture new_value, write audit row
    // -------------------------------------------------------------------
    return next.handle().pipe(
      tap(async (responseBody) => {
        try {
          const oldValue = await oldValuePromise;

          await this.auditService.log({
            tableName,
            recordId: recordId ?? 'unknown',
            action,
            oldValue: oldValue ?? undefined,
            newValue:
              action !== 'DELETE'
                ? this.sanitizeBody(responseBody)
                : undefined,
            changedBy: user?.sub ?? null,
            ipAddress: ip,
            userAgent,
            correlationId: correlationCtx?.correlationId ?? null,
          });
        } catch (err) {
          this.logger.warn(
            `Audit write failed for ${action} on ${tableName}`,
            (err as Error).message,
          );
        }
      }),
      catchError((err) => {
        // Even on error, attempt to write failed audit
        this.writeFailureAudit(tableName, recordId, action, ip, userAgent, err);
        throw err; // Re-throw — audit failure must not swallow errors
      }),
    );
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  /** Map HTTP method to audit action. */
  private methodToAction(method: string): AuditAction {
    switch (method) {
      case 'POST': return 'INSERT';
      case 'PATCH':
      case 'PUT': return 'UPDATE';
      case 'DELETE': return 'DELETE';
      default: return 'INSERT';
    }
  }

  /** Extract record ID from route params (assumes :id param). */
  private extractRecordId(request: Request): string | null {
    const params = request.params as Record<string, string> | undefined;
    return params?.['id'] ?? params?.['userId'] ?? params?.['roleId'] ?? null;
  }

  /** Fetch the entity before mutation for old_value capture. */
  private async fetchOldValue(
    tableName: string,
    recordId: string | null,
  ): Promise<Record<string, unknown> | null> {
    if (!recordId) return null;

    try {
      const rows = await this.prisma.$queryRawUnsafe<
        Array<Record<string, unknown>>
      >(
        `SELECT * FROM ${tableName} WHERE id = $1::uuid LIMIT 1`,
        recordId,
      );
      return rows[0] ?? null;
    } catch (err) {
      this.logger.warn(
        `Failed to fetch old_value from ${tableName}#${recordId}`,
        (err as Error).message,
      );
      return null;
    }
  }

  /** Remove sensitive fields from audit body. */
  private sanitizeBody(body: unknown): Record<string, unknown> | null {
    if (!body || typeof body !== 'object') return null;
    const sanitized = { ...(body as Record<string, unknown>) };
    // Never audit passwords or secrets
    delete sanitized['password'];
    delete sanitized['passwordHash'];
    delete sanitized['password_hash'];
    delete sanitized['totpSecretEncrypted'];
    delete sanitized['totp_secret_encrypted'];
    delete sanitized['token'];
    delete sanitized['accessToken'];
    delete sanitized['refreshToken'];
    return sanitized;
  }

  /** Write a failure audit entry (non-blocking). */
  private writeFailureAudit(
    tableName: string,
    recordId: string | null,
    action: AuditAction,
    ip: string | null,
    userAgent: string | null,
    error: Error,
  ): void {
    // Fire-and-forget — do not await
    this.auditService
      .log({
        tableName,
        recordId: recordId ?? 'unknown',
        action,
        newValue: { error: error.message, event: 'request_failed' },
        ipAddress: ip,
        userAgent,
      })
      .catch(() => {
        // Silently ignore — we're already in an error path
      });
  }
}
