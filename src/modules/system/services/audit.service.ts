// =============================================================================
// AuditService — Append-only audit trail via $queryRaw + query support
// =============================================================================
// OK Footwear ERP — Sprint 2, System Module
//
// Prisma v5 cannot model PostgreSQL partitioned tables (PARTITION BY RANGE).
// All operations on sys.audit_logs use $queryRawUnsafe to bypass Prisma's
// query engine. This is the documented pattern for partitioned tables.
//
// The service is designed for use by an AuditInterceptor (Sprint 2) that
// intercepts all mutating HTTP requests and records old/new values.
// Query methods support the AuditController for log retrieval.
// =============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { AuditQueryDto, type AuditActionFilter } from '../dto/audit.dto';

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
// Query row type — returned by query() (snake_case from raw SQL)
// ---------------------------------------------------------------------------

export interface AuditLogRow {
  id: string;
  table_name: string;
  record_id: string;
  action: AuditActionFilter;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  changed_by: string | null;
  ip_address: string | null;
  user_agent: string | null;
  correlation_id: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Query input — all filters are optional
// ---------------------------------------------------------------------------

export interface AuditQueryInput {
  tableName?: string;
  recordId?: string;
  action?: AuditActionFilter;
  changedBy?: string;
  fromDate?: string;
  toDate?: string;
  correlationId?: string;
  page: number;
  limit: number;
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

  // ===========================================================================
  // Query Methods — Parameterized reads against the partitioned table
  // ===========================================================================

  /**
   * Build a parameterized WHERE clause and params array from query filters.
   *
   * Design rationale:
   * - Uses $1, $2, ... positional params for PostgreSQL parameterized queries.
   * - All filters are AND-ed together (intersection).
   * - Date filters use `>=` / `<` to leverage partition pruning.
   * - Returns { clause, params, nextIndex } so the caller can append
   *   OFFSET/LIMIT params.
   */
  private buildWhereClause(
    filters: Omit<AuditQueryInput, 'page' | 'limit'>,
  ): { clause: string; params: unknown[]; nextIndex: number } {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filters.tableName) {
      conditions.push(`table_name = $${idx++}`);
      params.push(filters.tableName);
    }
    if (filters.recordId) {
      conditions.push(`record_id = $${idx++}`);
      params.push(filters.recordId);
    }
    if (filters.action) {
      conditions.push(`action = $${idx++}`);
      params.push(filters.action);
    }
    if (filters.changedBy) {
      conditions.push(`changed_by = $${idx++}::uuid`);
      params.push(filters.changedBy);
    }
    if (filters.fromDate) {
      conditions.push(`created_at >= $${idx++}::timestamptz`);
      params.push(filters.fromDate);
    }
    if (filters.toDate) {
      // Use < next day for exclusive upper bound to include the full day
      conditions.push(`created_at < $${idx++}::timestamptz`);
      params.push(filters.toDate);
    }
    if (filters.correlationId) {
      conditions.push(`correlation_id = $${idx++}::uuid`);
      params.push(filters.correlationId);
    }

    const clause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    return { clause, params, nextIndex: idx };
  }

  /**
   * Query audit logs with filters and pagination.
   *
   * Returns rows ordered by created_at DESC (most recent first).
   * The response shape uses camelCase via the controller mapping.
   */
  async query(filters: AuditQueryInput): Promise<AuditLogRow[]> {
    const { clause, params, nextIndex } = this.buildWhereClause(filters);

    const offset = (filters.page - 1) * filters.limit;
    const sql = `
      SELECT
        id,
        table_name,
        record_id,
        action,
        old_value,
        new_value,
        changed_by,
        host(ip_address) AS ip_address,
        user_agent,
        correlation_id,
        created_at
      FROM sys.audit_logs
      ${clause}
      ORDER BY created_at DESC
      LIMIT $${nextIndex}
      OFFSET $${nextIndex + 1}
    `;

    params.push(filters.limit, offset);

    return this.prisma.$queryRawUnsafe<AuditLogRow[]>(sql, ...params);
  }

  /**
   * Count total matching audit log rows for pagination metadata.
   */
  async count(filters: Omit<AuditQueryInput, 'page' | 'limit'>): Promise<number> {
    const { clause, params } = this.buildWhereClause(filters);

    const sql = `SELECT COUNT(*)::int AS total FROM sys.audit_logs ${clause}`;

    const rows = await this.prisma.$queryRawUnsafe<Array<{ total: number }>>(
      sql,
      ...params,
    );
    return rows[0]?.total ?? 0;
  }

  /**
   * Look up a single audit log entry by its UUID.
   *
   * The PK index on id is on the parent table, so PostgreSQL scans all
   * partitions efficiently using the index. Returns null if not found.
   */
  async findById(id: string): Promise<AuditLogRow | null> {
    const sql = `
      SELECT
        id,
        table_name,
        record_id,
        action,
        old_value,
        new_value,
        changed_by,
        host(ip_address) AS ip_address,
        user_agent,
        correlation_id,
        created_at
      FROM sys.audit_logs
      WHERE id = $1::uuid
    `;

    const rows = await this.prisma.$queryRawUnsafe<AuditLogRow[]>(sql, id);
    return rows[0] ?? null;
  }
}
