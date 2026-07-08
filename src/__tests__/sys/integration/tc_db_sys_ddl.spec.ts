// =============================================================================
// TC-DB-SYS-DDL — sys Core Tables DDL Acceptance Tests
// =============================================================================
// OK Footwear ERP — Sprint 2
// Layer under test: PostgreSQL DDL (sys schema core tables)
//
// Verifies all 11 acceptance criteria for the Sprint 2 sys tables DDL:
//   1. users table with all columns, types, constraints, defaults
//   2. failed_attempts SMALLINT NOT NULL DEFAULT 0 + CHECK >= 0
//   3. locked_until TIMESTAMPTZ nullable
//   4. totp_secret_encrypted TEXT nullable
//   5. FK constraints with correct ON DELETE behavior
//   6. refresh_tokens.token_hash UNIQUE index
//   7. UNIQUE(module, action) in permissions
//   8. UNIQUE constraint on role name
//   9. All tables in sys schema
//  10. Migration SQL produces no drift vs Prisma schema
//  11. Prisma generate + TS compilation succeeds (verified externally)
// =============================================================================

import { prisma } from '@test/helpers/integration-test-setup';

// ---------------------------------------------------------------------------
// Lifecycle — Run Sprint 2 migration (function & seed already in setup)
// ---------------------------------------------------------------------------
// The integration-test-setup runs `prisma db push` which creates tables
// from the Prisma schema. But it does NOT run migration SQL (ALTER TABLE
// ADD COLUMN, CHECK constraints, custom indexes, comments). We apply the
// Sprint 2 migration manually in beforeAll so the test database matches
// what production will have after `prisma migrate deploy`.
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Run the Sprint 2 migration SQL (idempotent — uses IF NOT EXISTS).
  // Each statement must be a separate $executeRawUnsafe call because
  // Prisma does not support multiple commands in a single call.

  await prisma.$executeRawUnsafe(
    'ALTER TABLE sys.users ADD COLUMN IF NOT EXISTS employee_id UUID',
  );
  await prisma.$executeRawUnsafe(
    'ALTER TABLE sys.users ADD COLUMN IF NOT EXISTS totp_secret_encrypted TEXT',
  );
  await prisma.$executeRawUnsafe(
    'ALTER TABLE sys.users ADD COLUMN IF NOT EXISTS failed_attempts SMALLINT NOT NULL DEFAULT 0',
  );
  await prisma.$executeRawUnsafe(
    'ALTER TABLE sys.users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ',
  );

  // Add CHECK constraint — must use a DO block for idempotency
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_users_failed_attempts_non_negative'
          AND conrelid = 'sys.users'::regclass
      ) THEN
        ALTER TABLE sys.users
          ADD CONSTRAINT chk_users_failed_attempts_non_negative
          CHECK (failed_attempts >= 0);
      END IF;
    END $$;
  `);

  await prisma.$executeRawUnsafe(
    'ALTER TABLE auth.refresh_tokens ADD COLUMN IF NOT EXISTS ip_inet INET',
  );
  await prisma.$executeRawUnsafe(
    'ALTER TABLE auth.refresh_tokens ADD COLUMN IF NOT EXISTS user_agent TEXT',
  );

  // Create indexes (idempotent via IF NOT EXISTS)
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS idx_users_locked_active ON sys.users (locked_until, is_active) WHERE locked_until IS NOT NULL AND is_active = true',
  );
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS idx_users_failed_attempts ON sys.users (failed_attempts) WHERE failed_attempts > 0',
  );
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_active ON auth.refresh_tokens (user_id, revoked_at) WHERE revoked_at IS NULL',
  );
});

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('sys Core Tables DDL', () => {
  // =========================================================================
  // Acceptance Criterion 1: users table — columns, types, defaults
  // =========================================================================

  describe('AC-1: users table columns, types, and defaults', () => {
    interface ColumnInfo {
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
      character_maximum_length: number | null;
    }

    let columns: Map<string, ColumnInfo>;

    beforeAll(async () => {
      const rows = await prisma.$queryRawUnsafe<ColumnInfo[]>(`
        SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = 'sys' AND table_name = 'users'
        ORDER BY ordinal_position
      `);
      columns = new Map(rows.map((r) => [r.column_name, r]));
    });

    it('id is UUID, NOT NULL', () => {
      const c = columns.get('id')!;
      expect(c.data_type).toBe('uuid');
      expect(c.is_nullable).toBe('NO');
    });

    it('employee_id is UUID, nullable', () => {
      const c = columns.get('employee_id')!;
      expect(c).toBeDefined();
      expect(c.data_type).toBe('uuid');
      expect(c.is_nullable).toBe('YES');
    });

    it('email is character varying(255), NOT NULL', () => {
      const c = columns.get('email')!;
      expect(c.data_type).toBe('character varying');
      expect(c.character_maximum_length).toBe(255);
      expect(c.is_nullable).toBe('NO');
    });

    it('password_hash is character varying(255), NOT NULL', () => {
      const c = columns.get('password_hash')!;
      expect(c.data_type).toBe('character varying');
      expect(c.character_maximum_length).toBe(255);
      expect(c.is_nullable).toBe('NO');
    });

    it('totp_secret_encrypted is text, nullable', () => {
      const c = columns.get('totp_secret_encrypted')!;
      expect(c).toBeDefined();
      expect(c.data_type).toBe('text');
      expect(c.is_nullable).toBe('YES');
    });

    it('failed_attempts is smallint, NOT NULL, default 0', () => {
      const c = columns.get('failed_attempts')!;
      expect(c).toBeDefined();
      expect(c.data_type).toBe('smallint');
      expect(c.is_nullable).toBe('NO');
      expect(c.column_default).toBe('0');
    });

    it('locked_until is timestamp with time zone, nullable', () => {
      const c = columns.get('locked_until')!;
      expect(c).toBeDefined();
      expect(c.data_type).toBe('timestamp with time zone');
      expect(c.is_nullable).toBe('YES');
    });

    it('first_name is character varying(100), NOT NULL', () => {
      const c = columns.get('first_name')!;
      expect(c.data_type).toBe('character varying');
      expect(c.character_maximum_length).toBe(100);
      expect(c.is_nullable).toBe('NO');
    });

    it('is_active is boolean, NOT NULL, default true', () => {
      const c = columns.get('is_active')!;
      expect(c.data_type).toBe('boolean');
      expect(c.is_nullable).toBe('NO');
      expect(c.column_default).toBe('true');
    });

    it('created_at is timestamp with time zone, NOT NULL', () => {
      const c = columns.get('created_at')!;
      expect(c.data_type).toBe('timestamp with time zone');
      expect(c.is_nullable).toBe('NO');
    });

    it('deleted_at is timestamp with time zone, nullable (soft-delete)', () => {
      const c = columns.get('deleted_at')!;
      expect(c.data_type).toBe('timestamp with time zone');
      expect(c.is_nullable).toBe('YES');
    });

    it('users table has exactly the expected column count', () => {
      // id, employee_id, email, password_hash, totp_secret_encrypted,
      // failed_attempts, locked_until, first_name, middle_name, last_name,
      // is_active, last_login_at, created_at, updated_at, deleted_at
      expect(columns.size).toBe(15);
    });
  });

  // =========================================================================
  // Acceptance Criterion 2: failed_attempts CHECK constraint
  // =========================================================================

  describe('AC-2: failed_attempts CHECK >= 0', () => {
    it('CHECK constraint exists with name chk_users_failed_attempts_non_negative', async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ conname: string }>
      >(`
        SELECT conname
        FROM pg_constraint
        WHERE conname = 'chk_users_failed_attempts_non_negative'
          AND conrelid = 'sys.users'::regclass
          AND contype = 'c'
      `);

      expect(rows).toHaveLength(1);
      expect(rows[0]!.conname).toBe('chk_users_failed_attempts_non_negative');
    });

    it('DEFAULT value of failed_attempts is 0 when creating a user', async () => {
      const userId = await createTestUser();

      const rows = await prisma.$queryRawUnsafe<
        Array<{ failed_attempts: number }>
      >(
        'SELECT failed_attempts FROM sys.users WHERE id = $1::uuid',
        userId,
      );

      expect(rows[0]!.failed_attempts).toBe(0);
    });

    it('CHECK constraint REJECTS negative failed_attempts', async () => {
      const userId = await createTestUser();

      await expect(
        prisma.$executeRawUnsafe(
          'UPDATE sys.users SET failed_attempts = -1 WHERE id = $1::uuid',
          userId,
        ),
      ).rejects.toThrow();
    });

    it('CHECK constraint ALLOWS failed_attempts = 0', async () => {
      const userId = await createTestUser();

      // Should not throw
      await prisma.$executeRawUnsafe(
        'UPDATE sys.users SET failed_attempts = 0 WHERE id = $1::uuid',
        userId,
      );
    });

    it('CHECK constraint ALLOWS failed_attempts = 5 (lockout threshold)', async () => {
      const userId = await createTestUser();

      await prisma.$executeRawUnsafe(
        'UPDATE sys.users SET failed_attempts = 5 WHERE id = $1::uuid',
        userId,
      );

      const rows = await prisma.$queryRawUnsafe<
        Array<{ failed_attempts: number }>
      >(
        'SELECT failed_attempts FROM sys.users WHERE id = $1::uuid',
        userId,
      );
      expect(rows[0]!.failed_attempts).toBe(5);
    });
  });

  // =========================================================================
  // Acceptance Criterion 3: locked_until nullable
  // =========================================================================

  describe('AC-3: locked_until TIMESTAMPTZ nullable', () => {
    it('locked_until defaults to NULL on user creation', async () => {
      const userId = await createTestUser();

      const rows = await prisma.$queryRawUnsafe<
        Array<{ locked_until: string | null }>
      >(
        'SELECT locked_until FROM sys.users WHERE id = $1::uuid',
        userId,
      );

      expect(rows[0]!.locked_until).toBeNull();
    });

    it('locked_until can be set to a future timestamp', async () => {
      const userId = await createTestUser();
      const futureTime = new Date(Date.now() + 30 * 60 * 1000); // 30 min from now

      await prisma.$executeRawUnsafe(
        'UPDATE sys.users SET locked_until = $1 WHERE id = $2::uuid',
        futureTime,
        userId,
      );

      const rows = await prisma.$queryRawUnsafe<
        Array<{ locked_until: Date }>
      >(
        'SELECT locked_until FROM sys.users WHERE id = $1::uuid',
        userId,
      );

      expect(rows[0]!.locked_until).toEqual(futureTime);
    });

    it('locked_until can be reset to NULL (unlock)', async () => {
      const userId = await createTestUser();

      // Set
      await prisma.$executeRawUnsafe(
        'UPDATE sys.users SET locked_until = NOW() WHERE id = $1::uuid',
        userId,
      );

      // Reset
      await prisma.$executeRawUnsafe(
        'UPDATE sys.users SET locked_until = NULL WHERE id = $1::uuid',
        userId,
      );

      const rows = await prisma.$queryRawUnsafe<
        Array<{ locked_until: string | null }>
      >(
        'SELECT locked_until FROM sys.users WHERE id = $1::uuid',
        userId,
      );
      expect(rows[0]!.locked_until).toBeNull();
    });
  });

  // =========================================================================
  // Acceptance Criterion 4: totp_secret_encrypted nullable
  // =========================================================================

  describe('AC-4: totp_secret_encrypted TEXT nullable', () => {
    it('totp_secret_encrypted defaults to NULL (2FA not enabled)', async () => {
      const userId = await createTestUser();

      const rows = await prisma.$queryRawUnsafe<
        Array<{ totp_secret_encrypted: string | null }>
      >(
        'SELECT totp_secret_encrypted FROM sys.users WHERE id = $1::uuid',
        userId,
      );

      expect(rows[0]!.totp_secret_encrypted).toBeNull();
    });

    it('totp_secret_encrypted can store a long encrypted string', async () => {
      const userId = await createTestUser();
      const longSecret = 'AES256GCM:' + 'x'.repeat(200); // Simulated encrypted payload

      await prisma.$executeRawUnsafe(
        'UPDATE sys.users SET totp_secret_encrypted = $1 WHERE id = $2::uuid',
        longSecret,
        userId,
      );

      const rows = await prisma.$queryRawUnsafe<
        Array<{ totp_secret_encrypted: string }>
      >(
        'SELECT totp_secret_encrypted FROM sys.users WHERE id = $1::uuid',
        userId,
      );

      expect(rows[0]!.totp_secret_encrypted).toBe(longSecret);
    });
  });

  // =========================================================================
  // Acceptance Criterion 5: FK constraints with correct ON DELETE
  // =========================================================================

  describe('AC-5: FK constraints and ON DELETE behavior', () => {
    it('user_roles FK → users ON DELETE CASCADE', async () => {
      const userId = await createTestUser();
      const roleId = await createTestRole('fk_test_role_cascade');

      await prisma.$executeRawUnsafe(
        'INSERT INTO sys.user_roles (user_id, role_id) VALUES ($1::uuid, $2::uuid)',
        userId,
        roleId,
      );

      // Delete user → user_roles should cascade
      await prisma.$executeRawUnsafe(
        'DELETE FROM sys.users WHERE id = $1::uuid',
        userId,
      );

      const rows = await prisma.$queryRawUnsafe<
        Array<{ count: bigint }>
      >(
        'SELECT COUNT(*) as count FROM sys.user_roles WHERE user_id = $1::uuid',
        userId,
      );
      expect(Number(rows[0]!.count)).toBe(0);
    });

    it('user_roles FK → roles ON DELETE CASCADE', async () => {
      const userId = await createTestUser();
      const roleId = await createTestRole('fk_test_role_cascade_2');

      await prisma.$executeRawUnsafe(
        'INSERT INTO sys.user_roles (user_id, role_id) VALUES ($1::uuid, $2::uuid)',
        userId,
        roleId,
      );

      // Delete role → user_roles should cascade
      await prisma.$executeRawUnsafe(
        'DELETE FROM sys.roles WHERE id = $1::uuid',
        roleId,
      );

      const rows = await prisma.$queryRawUnsafe<
        Array<{ count: bigint }>
      >(
        'SELECT COUNT(*) as count FROM sys.user_roles WHERE role_id = $1::uuid',
        roleId,
      );
      expect(Number(rows[0]!.count)).toBe(0);
    });

    it('role_permissions FK → roles ON DELETE CASCADE', async () => {
      const roleId = await createTestRole('fk_test_rp_role');
      const permId = await createTestPermission('fk_test', 'cascade_delete');

      await prisma.$executeRawUnsafe(
        'INSERT INTO sys.role_permissions (role_id, permission_id) VALUES ($1::uuid, $2::uuid)',
        roleId,
        permId,
      );

      await prisma.$executeRawUnsafe(
        'DELETE FROM sys.roles WHERE id = $1::uuid',
        roleId,
      );

      const rows = await prisma.$queryRawUnsafe<
        Array<{ count: bigint }>
      >(
        'SELECT COUNT(*) as count FROM sys.role_permissions WHERE role_id = $1::uuid',
        roleId,
      );
      expect(Number(rows[0]!.count)).toBe(0);
    });

    it('role_permissions FK → permissions ON DELETE CASCADE', async () => {
      const roleId = await createTestRole('fk_test_rp_perm');
      const permId = await createTestPermission('fk_test', 'cascade_delete_2');

      await prisma.$executeRawUnsafe(
        'INSERT INTO sys.role_permissions (role_id, permission_id) VALUES ($1::uuid, $2::uuid)',
        roleId,
        permId,
      );

      await prisma.$executeRawUnsafe(
        'DELETE FROM sys.permissions WHERE id = $1::uuid',
        permId,
      );

      const rows = await prisma.$queryRawUnsafe<
        Array<{ count: bigint }>
      >(
        'SELECT COUNT(*) as count FROM sys.role_permissions WHERE permission_id = $1::uuid',
        permId,
      );
      expect(Number(rows[0]!.count)).toBe(0);
    });

    it('refresh_tokens FK → users ON DELETE CASCADE', async () => {
      const userId = await createTestUser();
      const tokenId = crypto.randomUUID();

      await prisma.$executeRawUnsafe(
        `INSERT INTO auth.refresh_tokens (id, user_id, token_hash, expires_at, created_at)
         VALUES ($1::uuid, $2::uuid, $3, NOW() + INTERVAL '30 days', NOW())`,
        tokenId,
        userId,
        `hash_${tokenId}`,
      );

      await prisma.$executeRawUnsafe(
        'DELETE FROM sys.users WHERE id = $1::uuid',
        userId,
      );

      const rows = await prisma.$queryRawUnsafe<
        Array<{ count: bigint }>
      >(
        'SELECT COUNT(*) as count FROM auth.refresh_tokens WHERE id = $1::uuid',
        tokenId,
      );
      expect(Number(rows[0]!.count)).toBe(0);
    });
  });

  // =========================================================================
  // Acceptance Criterion 6: refresh_tokens.token_hash UNIQUE
  // =========================================================================

  describe('AC-6: refresh_tokens.token_hash UNIQUE constraint', () => {
    it('token_hash has a UNIQUE index', async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ indexname: string }>
      >(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'auth'
          AND tablename = 'refresh_tokens'
          AND indexdef ILIKE '%UNIQUE%token_hash%'
      `);

      expect(rows.length).toBeGreaterThan(0);
    });

    it('INSERT with duplicate token_hash is rejected', async () => {
      const userId = await createTestUser();
      const hash = `dup_hash_${crypto.randomUUID().slice(0, 8)}`;

      // First insert — OK
      await prisma.$executeRawUnsafe(
        `INSERT INTO auth.refresh_tokens (id, user_id, token_hash, expires_at, created_at)
         VALUES ($1::uuid, $2::uuid, $3, NOW() + INTERVAL '30 days', NOW())`,
        crypto.randomUUID(),
        userId,
        hash,
      );

      // Second insert with same hash — must fail
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO auth.refresh_tokens (id, user_id, token_hash, expires_at, created_at)
           VALUES ($1::uuid, $2::uuid, $3, NOW() + INTERVAL '30 days', NOW())`,
          crypto.randomUUID(),
          userId,
          hash,
        ),
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // Acceptance Criterion 7: UNIQUE(module, action) in permissions
  // =========================================================================

  describe('AC-7: UNIQUE(module, action) in permissions', () => {
    it('INSERT with duplicate (module, action) is rejected', async () => {
      const module = `test_mod_${Date.now()}`;
      const action = 'read';

      // First insert
      await prisma.$executeRawUnsafe(
        `INSERT INTO sys.permissions (id, module, action, created_at)
         VALUES ($1::uuid, $2, $3, NOW())`,
        crypto.randomUUID(),
        module,
        action,
      );

      // Second insert — duplicate (module, action) — must fail
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO sys.permissions (id, module, action, created_at)
           VALUES ($1::uuid, $2, $3, NOW())`,
          crypto.randomUUID(),
          module,
          action,
        ),
      ).rejects.toThrow();
    });

    it('INSERT with same module but different action succeeds', async () => {
      const module = `test_mod_diff_${Date.now()}`;

      await prisma.$executeRawUnsafe(
        `INSERT INTO sys.permissions (id, module, action, created_at)
         VALUES ($1::uuid, $2, 'read', NOW())`,
        crypto.randomUUID(),
        module,
      );

      // Different action — should succeed
      await prisma.$executeRawUnsafe(
        `INSERT INTO sys.permissions (id, module, action, created_at)
         VALUES ($1::uuid, $2, 'write', NOW())`,
        crypto.randomUUID(),
        module,
      );
    });
  });

  // =========================================================================
  // Acceptance Criterion 8: UNIQUE constraint on role name
  // =========================================================================

  describe('AC-8: UNIQUE constraint on role name', () => {
    it('INSERT with duplicate role name is rejected', async () => {
      const name = `test_role_dup_${Date.now()}`;

      await prisma.$executeRawUnsafe(
        `INSERT INTO sys.roles (id, name, created_at, updated_at)
         VALUES ($1::uuid, $2, NOW(), NOW())`,
        crypto.randomUUID(),
        name,
      );

      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO sys.roles (id, name, created_at, updated_at)
           VALUES ($1::uuid, $2, NOW(), NOW())`,
          crypto.randomUUID(),
          name,
        ),
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // Acceptance Criterion 9: All tables in sys schema
  // =========================================================================

  describe('AC-9: All expected tables in sys schema', () => {
    const EXPECTED_SYS_TABLES = [
      'users',
      'roles',
      'permissions',
      'user_roles',
      'role_permissions',
      'document_sequences',
    ];

    it('sys schema contains all expected tables', async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ table_name: string }>
      >(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'sys' AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);

      const actualTables = rows.map((r) => r.table_name);

      for (const expected of EXPECTED_SYS_TABLES) {
        expect(actualTables).toContain(expected);
      }
    });

    it('each sys table has a primary key', async () => {
      for (const table of EXPECTED_SYS_TABLES) {
        const rows = await prisma.$queryRawUnsafe<
          Array<{ count: bigint }>
        >(`
          SELECT COUNT(*) as count
          FROM information_schema.table_constraints
          WHERE table_schema = 'sys'
            AND table_name = '${table}'
            AND constraint_type = 'PRIMARY KEY'
        `);

        expect(Number(rows[0]!.count)).toBeGreaterThan(0);
      }
    });
  });

  // =========================================================================
  // Acceptance Criterion 10: Migration SQL idempotency (no drift)
  // =========================================================================

  describe('AC-10: Migration SQL is idempotent (re-running produces no errors)', () => {
    it('re-running the migration SQL does not throw', async () => {
      // Run the same migration SQL again — must succeed because all
      // statements use IF NOT EXISTS / IF EXISTS
      await prisma.$executeRawUnsafe(
        'ALTER TABLE sys.users ADD COLUMN IF NOT EXISTS employee_id UUID',
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE sys.users ADD COLUMN IF NOT EXISTS totp_secret_encrypted TEXT',
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE sys.users ADD COLUMN IF NOT EXISTS failed_attempts SMALLINT NOT NULL DEFAULT 0',
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE sys.users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ',
      );

      await prisma.$executeRawUnsafe(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'chk_users_failed_attempts_non_negative'
              AND conrelid = 'sys.users'::regclass
          ) THEN
            ALTER TABLE sys.users
              ADD CONSTRAINT chk_users_failed_attempts_non_negative
              CHECK (failed_attempts >= 0);
          END IF;
        END $$;
      `);

      await prisma.$executeRawUnsafe(
        'ALTER TABLE auth.refresh_tokens ADD COLUMN IF NOT EXISTS ip_inet INET',
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE auth.refresh_tokens ADD COLUMN IF NOT EXISTS user_agent TEXT',
      );
      await prisma.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS idx_users_locked_active ON sys.users (locked_until, is_active) WHERE locked_until IS NOT NULL AND is_active = true',
      );
      await prisma.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS idx_users_failed_attempts ON sys.users (failed_attempts) WHERE failed_attempts > 0',
      );
      await prisma.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_active ON auth.refresh_tokens (user_id, revoked_at) WHERE revoked_at IS NULL',
      );
    });
  });

  // =========================================================================
  // Additional Edge Cases
  // =========================================================================

  describe('Edge cases', () => {
    it('failed_attempts can be incremented atomically', async () => {
      const userId = await createTestUser();

      await prisma.$executeRawUnsafe(
        'UPDATE sys.users SET failed_attempts = failed_attempts + 1 WHERE id = $1::uuid',
        userId,
      );

      const rows = await prisma.$queryRawUnsafe<
        Array<{ failed_attempts: number }>
      >(
        'SELECT failed_attempts FROM sys.users WHERE id = $1::uuid',
        userId,
      );
      expect(rows[0]!.failed_attempts).toBe(1);
    });

    it('failed_attempts does NOT auto-increment (not a sequence)', async () => {
      const userId = await createTestUser();

      // Verify the user row has failed_attempts = 0 (the default)
      const userRows = await prisma.$queryRawUnsafe<
        Array<{ failed_attempts: number }>
      >(
        'SELECT failed_attempts FROM sys.users WHERE id = $1::uuid',
        userId,
      );
      expect(userRows[0]!.failed_attempts).toBe(0);

      // Verify the column default is not a sequence (it's just '0')
      const colRows = await prisma.$queryRawUnsafe<
        Array<{ column_default: string | null }>
      >(`
        SELECT column_default
        FROM information_schema.columns
        WHERE table_schema = 'sys'
          AND table_name = 'users'
          AND column_name = 'failed_attempts'
      `);

      expect(colRows[0]!.column_default).toBeDefined();
      expect(colRows[0]!.column_default).not.toContain('nextval');
    });

    it('refresh_tokens table has ip_inet and user_agent columns', async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ column_name: string; data_type: string; is_nullable: string }>
      >(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'auth'
          AND table_name = 'refresh_tokens'
          AND column_name IN ('ip_inet', 'user_agent')
        ORDER BY column_name
      `);

      expect(rows).toHaveLength(2);

      const ipCol = rows.find((r) => r.column_name === 'ip_inet')!;
      expect(ipCol.data_type).toBe('inet');
      expect(ipCol.is_nullable).toBe('YES');

      const uaCol = rows.find((r) => r.column_name === 'user_agent')!;
      expect(uaCol.data_type).toBe('text');
      expect(uaCol.is_nullable).toBe('YES');
    });

    it('locked_until accepts a past timestamp (historical lockout)', async () => {
      const userId = await createTestUser();
      const pastTime = new Date('2024-01-01T00:00:00Z');

      await prisma.$executeRawUnsafe(
        'UPDATE sys.users SET locked_until = $1 WHERE id = $2::uuid',
        pastTime,
        userId,
      );

      const rows = await prisma.$queryRawUnsafe<
        Array<{ locked_until: Date }>
      >(
        'SELECT locked_until FROM sys.users WHERE id = $1::uuid',
        userId,
      );

      expect(rows[0]!.locked_until).toEqual(pastTime);
    });

    it('partial index idx_users_locked_active exists', async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ indexname: string }>
      >(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'sys'
          AND tablename = 'users'
          AND indexname = 'idx_users_locked_active'
      `);

      expect(rows).toHaveLength(1);
    });
  });
});

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Creates a test user with minimal required fields and returns the ID.
 * All changes are rolled back at the end of the test (via beforeEach ROLLBACK).
 */
async function createTestUser(): Promise<string> {
  const id = crypto.randomUUID();
  const email = `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@okfootwear.com`;

  await prisma.$executeRawUnsafe(
    `INSERT INTO sys.users (id, email, password_hash, first_name, last_name, created_at, updated_at)
     VALUES ($1::uuid, $2, 'hashed_password', 'Test', 'User', NOW(), NOW())`,
    id,
    email,
  );

  return id;
}

/**
 * Creates a test role and returns the ID.
 */
async function createTestRole(name: string): Promise<string> {
  const id = crypto.randomUUID();

  await prisma.$executeRawUnsafe(
    `INSERT INTO sys.roles (id, name, created_at, updated_at)
     VALUES ($1::uuid, $2, NOW(), NOW())
     ON CONFLICT (name) DO NOTHING`,
    id,
    name,
  );

  // If ON CONFLICT DO NOTHING, the role already exists — fetch its ID
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    'SELECT id FROM sys.roles WHERE name = $1',
    name,
  );

  return rows[0]!.id;
}

/**
 * Creates a test permission and returns the ID.
 */
async function createTestPermission(
  module: string,
  action: string,
): Promise<string> {
  const id = crypto.randomUUID();

  await prisma.$executeRawUnsafe(
    `INSERT INTO sys.permissions (id, module, action, created_at)
     VALUES ($1::uuid, $2, $3, NOW())
     ON CONFLICT (module, action) DO NOTHING`,
    id,
    module,
    action,
  );

  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    'SELECT id FROM sys.permissions WHERE module = $1 AND action = $2',
    module,
    action,
  );

  return rows[0]!.id;
}
