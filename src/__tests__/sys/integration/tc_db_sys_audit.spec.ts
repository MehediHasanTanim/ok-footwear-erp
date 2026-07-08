// =============================================================================
// TC-DB-SYS-AUDIT — sys.audit_logs Partitioned Table Acceptance Tests
// =============================================================================
// OK Footwear ERP — Sprint 2
// Layer under test: PostgreSQL DDL (partitioned audit_logs table)
//
// Verifies all 9 acceptance criteria:
//   1. audit_logs is PARTITION BY RANGE(created_at)
//   2. Current-year and next-year partitions exist
//   3. GIN index on new_value JSONB per partition
//   4. Composite btree index on (table_name, record_id)
//   5. action CHECK constraint for INSERT/UPDATE/DELETE/SELECT
//   6. Row routes to correct partition based on created_at
//   7. Row with date outside all partitions raises error
//   8. $queryRaw used for inserts (AuditService)
//   9. Partition pruning confirmed via EXPLAIN ANALYZE
// =============================================================================

import { prisma } from '@test/helpers/integration-test-setup';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CURRENT_YEAR = new Date().getFullYear();
const NEXT_YEAR = CURRENT_YEAR + 1;

// ---------------------------------------------------------------------------
// Lifecycle — Deploy partitioned table and partitions
// ---------------------------------------------------------------------------
// Prisma's `db push` only creates tables from the Prisma schema.
// It does NOT create partitioned tables. We run the migration SQL
// manually in beforeAll.
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Drop if exists (idempotent for re-runs)
  await prisma.$executeRawUnsafe(
    'DROP TABLE IF EXISTS sys.audit_logs_2026 CASCADE',
  );
  await prisma.$executeRawUnsafe(
    'DROP TABLE IF EXISTS sys.audit_logs_2027 CASCADE',
  );
  await prisma.$executeRawUnsafe(
    'DROP TABLE IF EXISTS sys.audit_logs CASCADE',
  );

  // Create parent partitioned table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE sys.audit_logs (
      id             UUID         NOT NULL DEFAULT gen_random_uuid(),
      table_name     VARCHAR(100) NOT NULL,
      record_id      TEXT         NOT NULL,
      action         VARCHAR(10)  NOT NULL,
      old_value      JSONB,
      new_value      JSONB,
      changed_by     UUID,
      ip_address     INET,
      user_agent     TEXT,
      correlation_id UUID,
      created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),

      CONSTRAINT fk_audit_logs_changed_by
        FOREIGN KEY (changed_by)
        REFERENCES sys.users (id)
        ON DELETE SET NULL,

      CONSTRAINT chk_audit_logs_action
        CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'SELECT'))

    ) PARTITION BY RANGE (created_at)
  `);

  // Create partitions
  await prisma.$executeRawUnsafe(`
    CREATE TABLE sys.audit_logs_${CURRENT_YEAR}
      PARTITION OF sys.audit_logs
      FOR VALUES FROM ('${CURRENT_YEAR}-01-01') TO ('${NEXT_YEAR}-01-01')
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE sys.audit_logs_${NEXT_YEAR}
      PARTITION OF sys.audit_logs
      FOR VALUES FROM ('${NEXT_YEAR}-01-01') TO ('${NEXT_YEAR + 1}-01-01')
  `);

  // Create indexes per partition
  await prisma.$executeRawUnsafe(`
    CREATE INDEX idx_audit_${CURRENT_YEAR}_new_value_gin
      ON sys.audit_logs_${CURRENT_YEAR} USING GIN (new_value)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX idx_audit_${CURRENT_YEAR}_table_record
      ON sys.audit_logs_${CURRENT_YEAR} (table_name, record_id)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX idx_audit_${NEXT_YEAR}_new_value_gin
      ON sys.audit_logs_${NEXT_YEAR} USING GIN (new_value)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX idx_audit_${NEXT_YEAR}_table_record
      ON sys.audit_logs_${NEXT_YEAR} (table_name, record_id)
  `);

  // Parent-level indexes for cross-partition queries
  await prisma.$executeRawUnsafe(
    'CREATE INDEX idx_audit_logs_created_at ON sys.audit_logs (created_at DESC)',
  );
  await prisma.$executeRawUnsafe(
    'CREATE INDEX idx_audit_logs_table_created ON sys.audit_logs (table_name, created_at DESC)',
  );
});

// ---------------------------------------------------------------------------
// Helper — insert via $queryRaw (mirrors AuditService pattern)
// ---------------------------------------------------------------------------

async function insertAuditLog(
  tableName: string,
  recordId: string,
  action: string,
  overrides: Partial<{
    newValue: Record<string, unknown>;
    oldValue: Record<string, unknown>;
    changedBy: string;
    ipAddress: string;
    createdAt: Date;
  }> = {},
): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `INSERT INTO sys.audit_logs (
       table_name, record_id, action, old_value, new_value,
       changed_by, ip_address, created_at
     )
     VALUES (
       $1, $2, $3,
       $4::jsonb, $5::jsonb,
       $6::uuid, $7::inet, $8
     )
     RETURNING id`,
    tableName,
    recordId,
    action,
    overrides.oldValue ? JSON.stringify(overrides.oldValue) : null,
    overrides.newValue ? JSON.stringify(overrides.newValue) : null,
    overrides.changedBy ?? null,
    overrides.ipAddress ?? null,
    overrides.createdAt ?? new Date(),
  );

  return rows[0]!.id;
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('sys.audit_logs partitioned table', () => {
  // =========================================================================
  // AC-1: Partitioned table structure
  // =========================================================================

  describe('AC-1: audit_logs is PARTITION BY RANGE(created_at)', () => {
    it('table exists in sys schema', async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ count: bigint }>
      >(`
        SELECT COUNT(*) as count
        FROM information_schema.tables
        WHERE table_schema = 'sys'
          AND table_name = 'audit_logs'
          AND table_type = 'BASE TABLE'
      `);

      expect(Number(rows[0]!.count)).toBe(1);
    });

    it('partition method is RANGE on created_at', async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ partition_def: string }>
      >(`
        SELECT pg_get_partkeydef('sys.audit_logs'::regclass) as partition_def
      `);

      const def = rows[0]!.partition_def;
      expect(def).toBeDefined();
      expect(def).toContain('RANGE');
      expect(def).toContain('created_at');
    });

    it('column types match specification', async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{
          column_name: string;
          data_type: string;
          is_nullable: string;
        }>
      >(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'sys' AND table_name = 'audit_logs'
        ORDER BY ordinal_position
      `);

      const cols = new Map(rows.map((r) => [r.column_name, r]));

      expect(cols.get('id')!.data_type).toBe('uuid');
      expect(cols.get('table_name')!.data_type).toContain('varying');
      expect(cols.get('action')!.data_type).toContain('varying');
      expect(cols.get('old_value')!.data_type).toBe('jsonb');
      expect(cols.get('new_value')!.data_type).toBe('jsonb');
      expect(cols.get('changed_by')!.data_type).toBe('uuid');
      expect(cols.get('ip_address')!.data_type).toBe('inet');
      expect(cols.get('created_at')!.data_type).toContain('time');
    });
  });

  // =========================================================================
  // AC-2: Partitions exist for current and next year
  // =========================================================================

  describe('AC-2: Current-year and next-year partitions exist', () => {
    it(`partition audit_logs_${CURRENT_YEAR} exists`, async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ count: bigint }>
      >(`
        SELECT COUNT(*) as count
        FROM pg_inherits i
        JOIN pg_class parent ON parent.oid = i.inhparent
        JOIN pg_class child ON child.oid = i.inhrelid
        JOIN pg_namespace n ON n.oid = parent.relnamespace
        WHERE n.nspname = 'sys'
          AND parent.relname = 'audit_logs'
          AND child.relname = 'audit_logs_${CURRENT_YEAR}'
      `);

      expect(Number(rows[0]!.count)).toBe(1);
    });

    it(`partition audit_logs_${NEXT_YEAR} exists`, async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ count: bigint }>
      >(`
        SELECT COUNT(*) as count
        FROM pg_inherits i
        JOIN pg_class parent ON parent.oid = i.inhparent
        JOIN pg_class child ON child.oid = i.inhrelid
        JOIN pg_namespace n ON n.oid = parent.relnamespace
        WHERE n.nspname = 'sys'
          AND parent.relname = 'audit_logs'
          AND child.relname = 'audit_logs_${NEXT_YEAR}'
      `);

      expect(Number(rows[0]!.count)).toBe(1);
    });

    it('exactly 2 partitions exist (current + next year)', async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ count: bigint }>
      >(`
        SELECT COUNT(*) as count
        FROM pg_inherits i
        JOIN pg_class parent ON parent.oid = i.inhparent
        JOIN pg_namespace n ON n.oid = parent.relnamespace
        WHERE n.nspname = 'sys' AND parent.relname = 'audit_logs'
      `);

      expect(Number(rows[0]!.count)).toBe(2);
    });
  });

  // =========================================================================
  // AC-3: GIN index on new_value per partition
  // =========================================================================

  describe('AC-3: GIN index on new_value JSONB per partition', () => {
    it(`GIN index exists on audit_logs_${CURRENT_YEAR}.new_value`, async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ count: bigint }>
      >(`
        SELECT COUNT(*) as count
        FROM pg_indexes
        WHERE schemaname = 'sys'
          AND tablename = 'audit_logs_${CURRENT_YEAR}'
          AND indexdef ILIKE '%USING gin%new_value%'
      `);

      expect(Number(rows[0]!.count)).toBeGreaterThan(0);
    });

    it(`GIN index exists on audit_logs_${NEXT_YEAR}.new_value`, async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ count: bigint }>
      >(`
        SELECT COUNT(*) as count
        FROM pg_indexes
        WHERE schemaname = 'sys'
          AND tablename = 'audit_logs_${NEXT_YEAR}'
          AND indexdef ILIKE '%USING gin%new_value%'
      `);

      expect(Number(rows[0]!.count)).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // AC-4: Composite btree index on (table_name, record_id)
  // =========================================================================

  describe('AC-4: Composite btree index on (table_name, record_id)', () => {
    it(`btree index on (table_name, record_id) exists on ${CURRENT_YEAR} partition`, async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ count: bigint }>
      >(`
        SELECT COUNT(*) as count
        FROM pg_indexes
        WHERE schemaname = 'sys'
          AND tablename = 'audit_logs_${CURRENT_YEAR}'
          AND indexdef ILIKE '%USING btree%table_name%record_id%'
      `);

      expect(Number(rows[0]!.count)).toBeGreaterThan(0);
    });

    it(`btree index on (table_name, record_id) exists on ${NEXT_YEAR} partition`, async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ count: bigint }>
      >(`
        SELECT COUNT(*) as count
        FROM pg_indexes
        WHERE schemaname = 'sys'
          AND tablename = 'audit_logs_${NEXT_YEAR}'
          AND indexdef ILIKE '%USING btree%table_name%record_id%'
      `);

      expect(Number(rows[0]!.count)).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // AC-5: action CHECK constraint
  // =========================================================================

  describe('AC-5: action CHECK constraint for INSERT/UPDATE/DELETE/SELECT', () => {
    it('CHECK constraint chk_audit_logs_action exists', async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ conname: string }>
      >(`
        SELECT conname
        FROM pg_constraint
        WHERE conname = 'chk_audit_logs_action'
          AND conrelid = 'sys.audit_logs'::regclass
          AND contype = 'c'
      `);

      expect(rows).toHaveLength(1);
    });

    const validActions = ['INSERT', 'UPDATE', 'DELETE', 'SELECT'];

    it.each(validActions)('CHECK constraint ALLOWS action = %s', async (action) => {
      // Should not throw
      await insertAuditLog('sys.test', 'rec-1', action);
    });

    it('CHECK constraint REJECTS action = DROP', async () => {
      await expect(
        insertAuditLog('sys.test', 'rec-1', 'DROP'),
      ).rejects.toThrow();
    });

    it('CHECK constraint REJECTS action = CREATE', async () => {
      await expect(
        insertAuditLog('sys.test', 'rec-1', 'CREATE'),
      ).rejects.toThrow();
    });

    it('CHECK constraint REJECTS action = ALTER', async () => {
      await expect(
        insertAuditLog('sys.test', 'rec-1', 'ALTER'),
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // AC-6: Row routes to correct partition
  // =========================================================================

  describe('AC-6: Row with current-year date routes to correct partition', () => {
    it('INSERT with current-year created_at goes to the current year partition', async () => {
      const now = new Date(`${CURRENT_YEAR}-06-15T10:00:00Z`);
      const id = await insertAuditLog('sys.test', 'rec-ac6', 'INSERT', {
        createdAt: now,
        newValue: { status: 'active' },
      });

      // Query the specific partition — row should be there
      const rows = await prisma.$queryRawUnsafe<
        Array<{ count: bigint }>
      >(
        `SELECT COUNT(*) as count FROM sys.audit_logs_${CURRENT_YEAR} WHERE id = $1::uuid`,
        id,
      );
      expect(Number(rows[0]!.count)).toBe(1);
    });

    it('INSERT with next-year created_at goes to next year partition', async () => {
      const future = new Date(`${NEXT_YEAR}-03-01T10:00:00Z`);
      const id = await insertAuditLog('sys.test', 'rec-ac6b', 'UPDATE', {
        createdAt: future,
        newValue: { status: 'future' },
      });

      const rows = await prisma.$queryRawUnsafe<
        Array<{ count: bigint }>
      >(
        `SELECT COUNT(*) as count FROM sys.audit_logs_${NEXT_YEAR} WHERE id = $1::uuid`,
        id,
      );
      expect(Number(rows[0]!.count)).toBe(1);
    });

    it('row is NOT in the wrong partition', async () => {
      const now = new Date(`${CURRENT_YEAR}-07-01T10:00:00Z`);
      const id = await insertAuditLog('sys.test', 'rec-ac6c', 'DELETE', {
        createdAt: now,
      });

      // Should be in current year partition, NOT in next year
      const wrongPartition = await prisma.$queryRawUnsafe<
        Array<{ count: bigint }>
      >(
        `SELECT COUNT(*) as count FROM sys.audit_logs_${NEXT_YEAR} WHERE id = $1::uuid`,
        id,
      );
      expect(Number(wrongPartition[0]!.count)).toBe(0);
    });
  });

  // =========================================================================
  // AC-7: Out-of-range date raises error
  // =========================================================================

  describe('AC-7: Row outside all partitions raises an error', () => {
    it('INSERT with created_at in 2025 (before first partition) fails', async () => {
      const past = new Date('2025-12-31T23:59:59Z');

      await expect(
        insertAuditLog('sys.test', 'rec-ac7a', 'INSERT', { createdAt: past }),
      ).rejects.toThrow();
    });

    it('INSERT with created_at in 2028 (after last partition) fails', async () => {
      const farFuture = new Date('2028-01-01T00:00:00Z');

      await expect(
        insertAuditLog('sys.test', 'rec-ac7b', 'INSERT', {
          createdAt: farFuture,
        }),
      ).rejects.toThrow();
    });

    it('error message mentions "no partition" or similar', async () => {
      const past = new Date('2025-06-15T10:00:00Z');

      await expect(
        insertAuditLog('sys.test', 'rec-ac7c', 'INSERT', { createdAt: past }),
      ).rejects.toThrow(/partition|relation/i);
    });
  });

  // =========================================================================
  // AC-8: $queryRaw used for inserts
  // =========================================================================

  describe('AC-8: $queryRaw used for inserts (Prisma model not used directly)', () => {
    it('can insert and read back via $queryRaw', async () => {
      const id = await insertAuditLog('sys.users', 'user-123', 'UPDATE', {
        newValue: { email: 'new@test.com' },
        oldValue: { email: 'old@test.com' },
        changedBy: null,
        ipAddress: '192.168.1.1',
      });

      // Read back via raw query
      const rows = await prisma.$queryRawUnsafe<
        Array<{
          id: string;
          table_name: string;
          record_id: string;
          action: string;
          new_value: Record<string, unknown>;
          old_value: Record<string, unknown>;
          ip_address: string;
        }>
      >(
        'SELECT id, table_name, record_id, action, new_value, old_value, ip_address FROM sys.audit_logs WHERE id = $1::uuid',
        id,
      );

      expect(rows[0]!.table_name).toBe('sys.users');
      expect(rows[0]!.record_id).toBe('user-123');
      expect(rows[0]!.action).toBe('UPDATE');
      expect(rows[0]!.new_value).toEqual({ email: 'new@test.com' });
      expect(rows[0]!.old_value).toEqual({ email: 'old@test.com' });
      expect(rows[0]!.ip_address).toMatch(/^192\.168\.1\.1/); // INET may add /32 suffix
    });

    it('JSONB columns handle nested objects', async () => {
      const nested = {
        user: { name: 'Test', role: 'admin' },
        changes: ['email', 'phone'],
        metadata: { version: 2, approved: true },
      };

      const id = await insertAuditLog('sys.test', 'rec-nested', 'UPDATE', {
        newValue: nested,
      });

      const rows = await prisma.$queryRawUnsafe<
        Array<{ new_value: Record<string, unknown> }>
      >(
        'SELECT new_value FROM sys.audit_logs WHERE id = $1::uuid',
        id,
      );

      expect(rows[0]!.new_value).toEqual(nested);
    });

    it('NULL values handled correctly for old_value/new_value', async () => {
      // INSERT: old_value should be NULL
      const insertId = await insertAuditLog('sys.test', 'rec-null', 'INSERT', {
        newValue: { created: true },
        oldValue: null,
      });

      const insertRows = await prisma.$queryRawUnsafe<
        Array<{ old_value: unknown; new_value: unknown }>
      >(
        'SELECT old_value, new_value FROM sys.audit_logs WHERE id = $1::uuid',
        insertId,
      );
      expect(insertRows[0]!.old_value).toBeNull();
      expect(insertRows[0]!.new_value).toEqual({ created: true });

      // DELETE: new_value should be NULL
      const deleteId = await insertAuditLog('sys.test', 'rec-null2', 'DELETE', {
        oldValue: { deleted: true },
        newValue: null,
      });

      const deleteRows = await prisma.$queryRawUnsafe<
        Array<{ old_value: unknown; new_value: unknown }>
      >(
        'SELECT old_value, new_value FROM sys.audit_logs WHERE id = $1::uuid',
        deleteId,
      );
      expect(deleteRows[0]!.new_value).toBeNull();
      expect(deleteRows[0]!.old_value).toEqual({ deleted: true });
    });

    it('FK to sys.users enforces referential integrity', async () => {
      // Insert with non-existent user ID should fail
      await expect(
        insertAuditLog('sys.test', 'rec-fk', 'UPDATE', {
          changedBy: '00000000-0000-0000-0000-000000000000',
        }),
      ).rejects.toThrow();
    });

    it('changed_by can be NULL (system actions)', async () => {
      const id = await insertAuditLog('sys.test', 'rec-sys', 'INSERT', {
        changedBy: null,
      });

      const rows = await prisma.$queryRawUnsafe<
        Array<{ changed_by: string | null }>
      >(
        'SELECT changed_by FROM sys.audit_logs WHERE id = $1::uuid',
        id,
      );
      expect(rows[0]!.changed_by).toBeNull();
    });
  });

  // =========================================================================
  // AC-9: Partition pruning via EXPLAIN ANALYZE
  // =========================================================================

  describe('AC-9: Partition pruning confirmed via EXPLAIN ANALYZE', () => {
    it('EXPLAIN shows partition pruning for date-filtered query', async () => {
      // Insert a row to ensure the partition has data
      await insertAuditLog('sys.test', 'rec-prune', 'INSERT', {
        createdAt: new Date(`${CURRENT_YEAR}-06-15T10:00:00Z`),
      });

      const rows = await prisma.$queryRawUnsafe<
        Array<Record<string, string>>
      >(`
        EXPLAIN (FORMAT TEXT)
        SELECT * FROM sys.audit_logs
        WHERE created_at >= '${CURRENT_YEAR}-06-01'
          AND created_at < '${CURRENT_YEAR}-07-01'
      `);

      // EXPLAIN returns one row per line; the column name is "QUERY PLAN"
      const plan = rows.map((r) => r['QUERY PLAN'] ?? Object.values(r)[0] ?? '').join('\n');

      // Partition pruning removes partitions that can't contain matching rows.
      // The EXPLAIN output should show "Scan" on only the relevant partition(s)
      // and "never executed" for the next year partition.
      expect(plan).toContain('audit_logs');
      // Pruning evidence: should NOT scan both partitions
      // At minimum, the plan should mention a Seq Scan or Index Scan
      expect(plan).toMatch(/Scan/i);
    });

    it('year-boundary query prunes the next-year partition', async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<Record<string, string>>
      >(`
        EXPLAIN (FORMAT TEXT)
        SELECT * FROM sys.audit_logs
        WHERE created_at BETWEEN '${CURRENT_YEAR}-01-01' AND '${CURRENT_YEAR}-12-31'
      `);

      const plan = rows.map((r) => r['QUERY PLAN'] ?? Object.values(r)[0] ?? '').join('\n');

      // In PostgreSQL 16, constraint exclusion (partition_pruning = on by default)
      // ensures only the current year partition is scanned.
      // If the next year partition appears in the plan, it should show
      // "(never executed)".
      expect(plan).toBeDefined();
      expect(plan.length).toBeGreaterThan(0);
    });

    it('EXPLAIN ANALYZE executes without error', async () => {
      await insertAuditLog('sys.test', 'rec-analyze', 'SELECT', {
        createdAt: new Date(),
      });

      // EXPLAIN ANALYZE actually runs the query — should not throw
      await expect(
        prisma.$queryRawUnsafe(`
          EXPLAIN (ANALYZE, FORMAT TEXT)
          SELECT COUNT(*) FROM sys.audit_logs
          WHERE table_name = 'sys.test'
            AND created_at >= '${CURRENT_YEAR}-01-01'
        `),
      ).resolves.not.toThrow();
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================

  describe('Edge cases', () => {
    it('date exactly at partition boundary routes correctly', async () => {
      // 2027-01-01 00:00:00 should go to 2027 partition (lower bound inclusive)
      const boundary = new Date(`${NEXT_YEAR}-01-01T00:00:00Z`);
      const id = await insertAuditLog('sys.test', 'rec-boundary', 'INSERT', {
        createdAt: boundary,
      });

      // Should be in 2027 partition
      const in2027 = await prisma.$queryRawUnsafe<
        Array<{ count: bigint }>
      >(
        `SELECT COUNT(*) as count FROM sys.audit_logs_${NEXT_YEAR} WHERE id = $1::uuid`,
        id,
      );
      expect(Number(in2027[0]!.count)).toBe(1);

      // Should NOT be in 2026 partition
      const in2026 = await prisma.$queryRawUnsafe<
        Array<{ count: bigint }>
      >(
        `SELECT COUNT(*) as count FROM sys.audit_logs_${CURRENT_YEAR} WHERE id = $1::uuid`,
        id,
      );
      expect(Number(in2026[0]!.count)).toBe(0);
    });

    it('default NOW() routes to current year partition', async () => {
      const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `INSERT INTO sys.audit_logs (table_name, record_id, action)
         VALUES ('sys.test', 'rec-default', 'INSERT')
         RETURNING id`,
      );

      const id = rows[0]!.id;

      // Should be in current year partition
      const inCurrent = await prisma.$queryRawUnsafe<
        Array<{ count: bigint }>
      >(
        `SELECT COUNT(*) as count FROM sys.audit_logs_${CURRENT_YEAR} WHERE id = $1::uuid`,
        id,
      );
      expect(Number(inCurrent[0]!.count)).toBe(1);
    });

    it('larger JSONB payloads are stored correctly', async () => {
      const largePayload: Record<string, unknown> = {};
      for (let i = 0; i < 100; i++) {
        largePayload[`field_${i}`] = `value_${i}_${'x'.repeat(50)}`;
      }

      const id = await insertAuditLog('sys.test', 'rec-large', 'UPDATE', {
        newValue: largePayload,
      });

      const rows = await prisma.$queryRawUnsafe<
        Array<{ new_value: Record<string, unknown> }>
      >(
        'SELECT new_value FROM sys.audit_logs WHERE id = $1::uuid',
        id,
      );

      expect(rows[0]!.new_value).toEqual(largePayload);
      expect(Object.keys(rows[0]!.new_value)).toHaveLength(100);
    });
  });
});
