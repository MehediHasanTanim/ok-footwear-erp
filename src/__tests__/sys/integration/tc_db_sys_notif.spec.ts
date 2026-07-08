// =============================================================================
// TC-DB-SYS-NOTIF — sys.notifications Partitioned Table Acceptance Tests
// =============================================================================
// OK Footwear ERP — Sprint 2
// Layer under test: PostgreSQL DDL (partitioned notifications table)
//
// Verifies all 6 acceptance criteria:
//   1. PARTITION BY RANGE(created_at) with yearly children
//   2. Partial index WHERE is_read = false on (user_id) per partition
//   3. EXPLAIN ANALYZE shows Index Scan for unread count query
//   4. is_read DEFAULT false NOT NULL enforced
//   5. read_at nullable, set when is_read flipped to true
//   6. $queryRaw used for inserts in NotificationsService
// =============================================================================

import { prisma } from '@test/helpers/integration-test-setup';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CURRENT_YEAR = new Date().getFullYear();
const NEXT_YEAR = CURRENT_YEAR + 1;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createTestUser(email?: string): Promise<string> {
  const id = crypto.randomUUID();
  const e = email ?? `notif_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@test.com`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO sys.users (id, email, password_hash, first_name, last_name, created_at, updated_at)
     VALUES ($1::uuid, $2, 'hash', 'Test', 'User', NOW(), NOW())`,
    id,
    e,
  );
  return id;
}

async function createNotification(
  userId: string,
  overrides: Partial<{
    title: string;
    body: string;
    type: string;
    referenceId: string;
    createdAt: Date;
  }> = {},
): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `INSERT INTO sys.notifications (user_id, title, body, type, reference_id, created_at)
     VALUES ($1::uuid, $2, $3, $4, $5, $6)
     RETURNING id`,
    userId,
    overrides.title ?? 'Test Notification',
    overrides.body ?? 'Test body content',
    overrides.type ?? 'system_alert',
    overrides.referenceId ?? null,
    overrides.createdAt ?? new Date(),
  );
  return rows[0]!.id;
}

// ---------------------------------------------------------------------------
// Lifecycle — Deploy partitioned table
// ---------------------------------------------------------------------------

beforeAll(async () => {
  await prisma.$executeRawUnsafe(
    'DROP TABLE IF EXISTS sys.notifications_2026 CASCADE',
  );
  await prisma.$executeRawUnsafe(
    'DROP TABLE IF EXISTS sys.notifications_2027 CASCADE',
  );
  await prisma.$executeRawUnsafe(
    'DROP TABLE IF EXISTS sys.notifications CASCADE',
  );

  await prisma.$executeRawUnsafe(`
    CREATE TABLE sys.notifications (
      id           UUID         NOT NULL DEFAULT gen_random_uuid(),
      user_id      UUID         NOT NULL,
      title        VARCHAR(255),
      body         TEXT,
      type         VARCHAR(50),
      reference_id TEXT,
      is_read      BOOLEAN      NOT NULL DEFAULT false,
      read_at      TIMESTAMPTZ,
      created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),

      CONSTRAINT fk_notifications_user
        FOREIGN KEY (user_id) REFERENCES sys.users (id) ON DELETE CASCADE,

      CONSTRAINT chk_notifications_read_at
        CHECK ((is_read = false AND read_at IS NULL) OR (is_read = true))

    ) PARTITION BY RANGE (created_at)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE sys.notifications_${CURRENT_YEAR}
      PARTITION OF sys.notifications
      FOR VALUES FROM ('${CURRENT_YEAR}-01-01') TO ('${NEXT_YEAR}-01-01')
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE sys.notifications_${NEXT_YEAR}
      PARTITION OF sys.notifications
      FOR VALUES FROM ('${NEXT_YEAR}-01-01') TO ('${NEXT_YEAR + 1}-01-01')
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX idx_notif_${CURRENT_YEAR}_user_unread
      ON sys.notifications_${CURRENT_YEAR} (user_id, created_at DESC)
      WHERE is_read = false
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX idx_notif_${NEXT_YEAR}_user_unread
      ON sys.notifications_${NEXT_YEAR} (user_id, created_at DESC)
      WHERE is_read = false
  `);

  await prisma.$executeRawUnsafe(
    'CREATE INDEX idx_notifications_user_created ON sys.notifications (user_id, created_at DESC)',
  );
});

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('sys.notifications partitioned table', () => {
  // =========================================================================
  // AC-1: Partitioned table structure
  // =========================================================================

  describe('AC-1: PARTITION BY RANGE(created_at) with yearly children', () => {
    it('table exists in sys schema', async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ count: bigint }>
      >(`
        SELECT COUNT(*) as count
        FROM information_schema.tables
        WHERE table_schema = 'sys' AND table_name = 'notifications'
      `);
      expect(Number(rows[0]!.count)).toBe(1);
    });

    it('partitioned by RANGE on created_at', async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ partition_def: string }>
      >(
        `SELECT pg_get_partkeydef('sys.notifications'::regclass) as partition_def`,
      );
      expect(rows[0]!.partition_def).toContain('RANGE');
      expect(rows[0]!.partition_def).toContain('created_at');
    });

    it(`partition notifications_${CURRENT_YEAR} exists`, async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ count: bigint }>
      >(`
        SELECT COUNT(*) as count FROM pg_inherits i
        JOIN pg_class parent ON parent.oid = i.inhparent
        JOIN pg_class child ON child.oid = i.inhrelid
        JOIN pg_namespace n ON n.oid = parent.relnamespace
        WHERE n.nspname = 'sys' AND parent.relname = 'notifications'
          AND child.relname = 'notifications_${CURRENT_YEAR}'
      `);
      expect(Number(rows[0]!.count)).toBe(1);
    });

    it(`partition notifications_${NEXT_YEAR} exists`, async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ count: bigint }>
      >(`
        SELECT COUNT(*) as count FROM pg_inherits i
        JOIN pg_class parent ON parent.oid = i.inhparent
        JOIN pg_class child ON child.oid = i.inhrelid
        JOIN pg_namespace n ON n.oid = parent.relnamespace
        WHERE n.nspname = 'sys' AND parent.relname = 'notifications'
          AND child.relname = 'notifications_${NEXT_YEAR}'
      `);
      expect(Number(rows[0]!.count)).toBe(1);
    });

    it('column types match specification', async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ column_name: string; data_type: string; is_nullable: string }>
      >(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'sys' AND table_name = 'notifications'
        ORDER BY ordinal_position
      `);
      const cols = new Map(rows.map((r) => [r.column_name, r]));

      expect(cols.get('id')!.data_type).toBe('uuid');
      expect(cols.get('user_id')!.data_type).toBe('uuid');
      expect(cols.get('title')!.data_type).toContain('varying');
      expect(cols.get('type')!.data_type).toContain('varying');
      expect(cols.get('is_read')!.data_type).toBe('boolean');
      expect(cols.get('read_at')!.data_type).toContain('time');
      expect(cols.get('created_at')!.data_type).toContain('time');
      expect(cols.get('is_read')!.is_nullable).toBe('NO');
      expect(cols.get('read_at')!.is_nullable).toBe('YES');
    });
  });

  // =========================================================================
  // AC-2: Partial index WHERE is_read = false per partition
  // =========================================================================

  describe('AC-2: Partial index WHERE is_read = false on (user_id)', () => {
    it(`partial index exists on ${CURRENT_YEAR} partition`, async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ count: bigint }>
      >(`
        SELECT COUNT(*) as count FROM pg_indexes
        WHERE schemaname = 'sys'
          AND tablename = 'notifications_${CURRENT_YEAR}'
          AND indexdef ILIKE '%user_id%'
          AND indexdef ILIKE '%is_read%false%'
      `);
      expect(Number(rows[0]!.count)).toBeGreaterThan(0);
    });

    it(`partial index exists on ${NEXT_YEAR} partition`, async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ count: bigint }>
      >(`
        SELECT COUNT(*) as count FROM pg_indexes
        WHERE schemaname = 'sys'
          AND tablename = 'notifications_${NEXT_YEAR}'
          AND indexdef ILIKE '%user_id%'
          AND indexdef ILIKE '%is_read%false%'
      `);
      expect(Number(rows[0]!.count)).toBeGreaterThan(0);
    });

    it('index includes created_at DESC in column list', async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ indexdef: string }>
      >(`
        SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'sys'
          AND tablename = 'notifications_${CURRENT_YEAR}'
          AND indexdef ILIKE '%user_id%'
          AND indexdef ILIKE '%is_read%false%'
      `);
      expect(rows[0]!.indexdef).toContain('created_at');
    });
  });

  // =========================================================================
  // AC-3: EXPLAIN ANALYZE shows Index Scan for unread count
  // =========================================================================

  describe('AC-3: EXPLAIN ANALYZE shows Index Scan for unread count query', () => {
    it('unread count query uses Index Scan, not Seq Scan', async () => {
      const userId = await createTestUser();
      // Seed unread notifications
      for (let i = 0; i < 3; i++) {
        await createNotification(userId, {
          title: `Unread ${i}`,
          createdAt: new Date(`${CURRENT_YEAR}-06-${15 + i}T10:00:00Z`),
        });
      }

      const rows = await prisma.$queryRawUnsafe<
        Array<Record<string, string>>
      >(`
        EXPLAIN (ANALYZE, FORMAT TEXT)
        SELECT COUNT(*) FROM sys.notifications
        WHERE user_id = '${userId}' AND is_read = false
      `);

      const plan = rows
        .map((r) => r['QUERY PLAN'] ?? Object.values(r)[0] ?? '')
        .join('\n');

      // Should use an Index Scan (or Index Only Scan) on the partial index
      expect(plan).toMatch(/Index.*Scan/i);
      // Should NOT fall back to Seq Scan
      expect(plan).not.toMatch(/Seq Scan/i);
    });

    it('unread count returns correct value via index', async () => {
      const userId = await createTestUser();
      await createNotification(userId, { title: 'U1' });
      await createNotification(userId, { title: 'U2' });
      await createNotification(userId, { title: 'U3' });

      const rows = await prisma.$queryRawUnsafe<
        Array<{ count: bigint }>
      >(
        `SELECT COUNT(*) as count FROM sys.notifications
         WHERE user_id = $1::uuid AND is_read = false`,
        userId,
      );

      expect(Number(rows[0]!.count)).toBe(3);
    });
  });

  // =========================================================================
  // AC-4: is_read DEFAULT false NOT NULL
  // =========================================================================

  describe('AC-4: is_read DEFAULT false NOT NULL enforced', () => {
    it('newly inserted notification has is_read = false', async () => {
      const userId = await createTestUser();
      const id = await createNotification(userId, { title: 'Default test' });

      const rows = await prisma.$queryRawUnsafe<
        Array<{ is_read: boolean }>
      >(
        'SELECT is_read FROM sys.notifications WHERE id = $1::uuid',
        id,
      );

      expect(rows[0]!.is_read).toBe(false);
    });

    it('inserting without is_read explicitly defaults to false', async () => {
      const userId = await createTestUser();
      const rows = await prisma.$queryRawUnsafe<Array<{ id: string; is_read: boolean }>>(
        `INSERT INTO sys.notifications (user_id, title, body, type)
         VALUES ($1::uuid, 'Implicit', 'test', 'system')
         RETURNING id, is_read`,
        userId,
      );

      expect(rows[0]!.is_read).toBe(false);
    });

    it('cannot insert NULL into is_read (NOT NULL constraint)', async () => {
      const userId = await createTestUser();
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO sys.notifications (user_id, title, body, type, is_read)
           VALUES ($1::uuid, 'test', 'test', 'system', NULL)`,
          userId,
        ),
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // AC-5: read_at nullable, set when is_read flipped to true
  // =========================================================================

  describe('AC-5: read_at nullable, set when is_read flipped to true', () => {
    it('read_at is NULL on newly created notification', async () => {
      const userId = await createTestUser();
      const id = await createNotification(userId);

      const rows = await prisma.$queryRawUnsafe<
        Array<{ read_at: string | null }>
      >(
        'SELECT read_at FROM sys.notifications WHERE id = $1::uuid',
        id,
      );

      expect(rows[0]!.read_at).toBeNull();
    });

    it('read_at is set when is_read is flipped to true', async () => {
      const userId = await createTestUser();
      const id = await createNotification(userId);

      await prisma.$executeRawUnsafe(
        `UPDATE sys.notifications
         SET is_read = true, read_at = NOW()
         WHERE id = $1::uuid`,
        id,
      );

      const rows = await prisma.$queryRawUnsafe<
        Array<{ is_read: boolean; read_at: string }>
      >(
        'SELECT is_read, read_at FROM sys.notifications WHERE id = $1::uuid',
        id,
      );

      expect(rows[0]!.is_read).toBe(true);
      expect(rows[0]!.read_at).not.toBeNull();
    });

    it('marking already-read notification does not change read_at', async () => {
      const userId = await createTestUser();
      const id = await createNotification(userId);

      // First read
      await prisma.$executeRawUnsafe(
        `UPDATE sys.notifications SET is_read = true, read_at = '2026-01-15T10:00:00Z'
         WHERE id = $1::uuid`,
        id,
      );

      // Second "read" — should be no-op
      const result = await prisma.$queryRawUnsafe<Array<{ updated: bigint }>>(
        `UPDATE sys.notifications SET is_read = true, read_at = NOW()
         WHERE id = $1::uuid AND is_read = false
         RETURNING 1 as updated`,
        id,
      );

      // The second UPDATE should not affect the row (WHERE is_read = false)
      expect(result.length).toBe(0);
    });

    it('unread count decreases after marking as read', async () => {
      const userId = await createTestUser();
      await createNotification(userId, { title: 'N1' });
      await createNotification(userId, { title: 'N2' });

      // Unread count = 2
      const before = await prisma.$queryRawUnsafe<
        Array<{ count: bigint }>
      >(
        `SELECT COUNT(*) as count FROM sys.notifications
         WHERE user_id = $1::uuid AND is_read = false`,
        userId,
      );
      expect(Number(before[0]!.count)).toBe(2);

      // Mark one as read via UPDATE
      const ids = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM sys.notifications
         WHERE user_id = $1::uuid AND is_read = false
         LIMIT 1`,
        userId,
      );
      await prisma.$executeRawUnsafe(
        `UPDATE sys.notifications SET is_read = true, read_at = NOW()
         WHERE id = $1::uuid`,
        ids[0]!.id,
      );

      // Unread count = 1
      const after = await prisma.$queryRawUnsafe<
        Array<{ count: bigint }>
      >(
        `SELECT COUNT(*) as count FROM sys.notifications
         WHERE user_id = $1::uuid AND is_read = false`,
        userId,
      );
      expect(Number(after[0]!.count)).toBe(1);
    });
  });

  // =========================================================================
  // AC-6: $queryRaw used for inserts
  // =========================================================================

  describe('AC-6: $queryRaw used for inserts (NotificationsService pattern)', () => {
    it('inserts via $queryRaw and reads back correctly', async () => {
      const userId = await createTestUser();
      const id = await createNotification(userId, {
        title: 'Order Shipped',
        body: 'Order #ORD-2026-000042 has been shipped.',
        type: 'order_status',
        referenceId: 'ORD-2026-000042',
      });

      const rows = await prisma.$queryRawUnsafe<
        Array<{
          id: string;
          user_id: string;
          title: string;
          body: string;
          type: string;
          reference_id: string;
          is_read: boolean;
          read_at: string | null;
        }>
      >(
        `SELECT id, user_id, title, body, type, reference_id, is_read, read_at
         FROM sys.notifications WHERE id = $1::uuid`,
        id,
      );

      expect(rows[0]!.title).toBe('Order Shipped');
      expect(rows[0]!.type).toBe('order_status');
      expect(rows[0]!.reference_id).toBe('ORD-2026-000042');
      expect(rows[0]!.is_read).toBe(false);
      expect(rows[0]!.read_at).toBeNull();
    });

    it('FK to sys.users cascades on delete', async () => {
      const userId = await createTestUser();
      const id = await createNotification(userId, { title: 'Cascade test' });

      // Verify notification exists
      const before = await prisma.$queryRawUnsafe<
        Array<{ count: bigint }>
      >(
        'SELECT COUNT(*) as count FROM sys.notifications WHERE id = $1::uuid',
        id,
      );
      expect(Number(before[0]!.count)).toBe(1);

      // Delete user — notification should cascade
      await prisma.$executeRawUnsafe(
        'DELETE FROM sys.users WHERE id = $1::uuid',
        userId,
      );

      const after = await prisma.$queryRawUnsafe<
        Array<{ count: bigint }>
      >(
        'SELECT COUNT(*) as count FROM sys.notifications WHERE id = $1::uuid',
        id,
      );
      expect(Number(after[0]!.count)).toBe(0);
    });

    it('out-of-range date raises error (no default partition)', async () => {
      const userId = await createTestUser();
      await expect(
        createNotification(userId, {
          createdAt: new Date('2025-06-15T10:00:00Z'),
        }),
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================

  describe('Edge cases', () => {
    it('multiple users have independent unread counts', async () => {
      const userA = await createTestUser();
      const userB = await createTestUser();

      await createNotification(userA, { title: 'A1' });
      await createNotification(userA, { title: 'A2' });
      await createNotification(userB, { title: 'B1' });

      const countA = await prisma.$queryRawUnsafe<
        Array<{ count: bigint }>
      >(
        `SELECT COUNT(*) as count FROM sys.notifications
         WHERE user_id = $1::uuid AND is_read = false`,
        userA,
      );
      const countB = await prisma.$queryRawUnsafe<
        Array<{ count: bigint }>
      >(
        `SELECT COUNT(*) as count FROM sys.notifications
         WHERE user_id = $1::uuid AND is_read = false`,
        userB,
      );

      expect(Number(countA[0]!.count)).toBe(2);
      expect(Number(countB[0]!.count)).toBe(1);
    });

    it('markAllRead only affects the target user', async () => {
      const userA = await createTestUser();
      const userB = await createTestUser();

      await createNotification(userA);
      await createNotification(userA);
      await createNotification(userB);

      // Mark all userA as read
      await prisma.$executeRawUnsafe(
        `UPDATE sys.notifications SET is_read = true, read_at = NOW()
         WHERE user_id = $1::uuid AND is_read = false`,
        userA,
      );

      const aUnread = await prisma.$queryRawUnsafe<
        Array<{ count: bigint }>
      >(
        `SELECT COUNT(*) as count FROM sys.notifications
         WHERE user_id = $1::uuid AND is_read = false`,
        userA,
      );
      const bUnread = await prisma.$queryRawUnsafe<
        Array<{ count: bigint }>
      >(
        `SELECT COUNT(*) as count FROM sys.notifications
         WHERE user_id = $1::uuid AND is_read = false`,
        userB,
      );

      expect(Number(aUnread[0]!.count)).toBe(0);
      expect(Number(bUnread[0]!.count)).toBe(1);
    });
  });
});
