// =============================================================================
// AuditService — Append-only audit trail via $queryRaw
// =============================================================================
// OK Footwear ERP — Sprint 2, System Module
//
// Prisma v5 cannot model PostgreSQL partitioned tables (PARTITION BY RANGE).
// All inserts into sys.audit_logs use $queryRawUnsafe to bypass Prisma's
// query engine. This is the documented pattern for partitioned tables.
//
// The service is designed for use by an AuditInterceptor (Sprint 2) that
// intercepts all mutating HTTP requests and records old/new values.
// =============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE' | 'SELECT';

export interface AuditEntry {
  /** Table name in the format schema.table (e.g., 'sys.users'). */
  tableName: string;

  /** Primary key of the affected record (TEXT for composite key support). */
  recordId: string;

  /** The DML action performed. */
  action: AuditAction;

  /** JSONB snapshot BEFORE the mutation (null for INSERT). */
  oldValue?: Record<string, unknown> | null;

  /** JSONB snapshot AFTER the mutation (null for DELETE). */
  newValue?: Record<string, unknown> | null;

  /** UUID of the user who performed the action (null for system actions). */
  changedBy?: string | null;

  /** Client IP address (INET type). */
  ipAddress?: string | null;

  /** Client User-Agent string. */
  userAgent?: string | null;

  /** UUID v7 correlation ID from the originating HTTP request. */
  correlationId?: string | null;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Insert a single audit log entry via raw SQL.
   *
   * Uses $queryRawUnsafe (not $executeRawUnsafe) to avoid Prisma's
   * prepared-statement limitations with partitioned tables.
   * All values are parameterized to prevent SQL injection.
   */
  async log(entry: AuditEntry): Promise<string> {
    const sql = `
      INSERT INTO sys.audit_logs (
        table_name, record_id, action, old_value, new_value,
        changed_by, ip_address, user_agent, correlation_id
      )
      VALUES (
        $1, $2, $3,
        $4::jsonb, $5::jsonb,
        $6::uuid, $7::inet, $8, $9::uuid
      )
      RETURNING id
    `;

    const params = [
      entry.tableName,
      entry.recordId,
      entry.action,
      entry.oldValue ? JSON.stringify(entry.oldValue) : null,
      entry.newValue ? JSON.stringify(entry.newValue) : null,
      entry.changedBy ?? null,
      entry.ipAddress ?? null,
      entry.userAgent ?? null,
      entry.correlationId ?? null,
    ];

    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
        sql,
        ...params,
      );

      const auditId = rows[0]!.id;
      this.logger.debug(
        `Audit: ${entry.action} on ${entry.tableName}#${entry.recordId} (id: ${auditId})`,
      );
      return auditId;
    } catch (error) {
      this.logger.error(
        `Failed to write audit log for ${entry.action} on ${entry.tableName}#${entry.recordId}`,
        (error as Error).stack,
      );
      // Audit failure must NOT break the main transaction.
      // The caller should handle this (e.g., warn + continue).
      throw error;
    }
  }

  /**
   * Bulk-insert multiple audit entries.
   *
   * Uses a single INSERT with multiple VALUES rows for efficiency.
   * All entries must target the same partition (same year) for
   * predictable performance.
   */
  async logBatch(entries: AuditEntry[]): Promise<string[]> {
    if (entries.length === 0) return [];

    // Build parameterized multi-row INSERT
    const valuePlaceholders: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    for (const entry of entries) {
      valuePlaceholders.push(
        `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, ` +
          `$${paramIndex++}::jsonb, $${paramIndex++}::jsonb, ` +
          `$${paramIndex++}::uuid, $${paramIndex++}::inet, $${paramIndex++}, $${paramIndex++}::uuid)`,
      );
      params.push(
        entry.tableName,
        entry.recordId,
        entry.action,
        entry.oldValue ? JSON.stringify(entry.oldValue) : null,
        entry.newValue ? JSON.stringify(entry.newValue) : null,
        entry.changedBy ?? null,
        entry.ipAddress ?? null,
        entry.userAgent ?? null,
        entry.correlationId ?? null,
      );
    }

    const sql = `
      INSERT INTO sys.audit_logs (
        table_name, record_id, action, old_value, new_value,
        changed_by, ip_address, user_agent, correlation_id
      )
      VALUES ${valuePlaceholders.join(', ')}
      RETURNING id
    `;

    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      sql,
      ...params,
    );

    return rows.map((r) => r.id);
  }
}
