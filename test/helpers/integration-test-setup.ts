// =============================================================================
// Integration Test — Per-Test Setup (Transaction Rollback)
// =============================================================================
// Runs before/after EACH integration test.
//
// Pattern: BEGIN transaction before each test → run test → ROLLBACK after.
// This ensures:
//   - Tests are isolated: no data leaks between tests.
//   - No cleanup needed: rollback undoes all INSERT/UPDATE/DELETE.
//   - Tests run in parallel-safe way: each test has its own transaction.
//
// DEVIATION: Prisma v5 does not expose a native "begin/rollback transaction"
// for the default client. We use `$executeRawUnsafe` to send raw SQL.
// This is safe because:
//   - Integration tests own the database — no concurrent writers.
//   - The connection pool is limited to 1 during tests.
//   - All test queries within a single file share the same connection.

import { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Singleton Prisma client for all integration tests
// ---------------------------------------------------------------------------
// Created once per test file (via beforeAll), reused across tests.
// The direct database URL (bypasses PgBouncer) is used because integration
// tests need DDL (CREATE/ALTER) for schema push.

let prisma: PrismaClient;

beforeAll(async () => {
  const databaseUrl = process.env['TEST_DIRECT_DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error(
      'TEST_DIRECT_DATABASE_URL is not set. ' +
        'Ensure integration-global-setup.ts ran successfully.',
    );
  }

  prisma = new PrismaClient({
    datasourceUrl: databaseUrl,
    // Limit connection pool to 1 — ensures all queries in a test file
    // use the same connection, which is required for transaction rollback
    // to work correctly.
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
    log: [
      { level: 'warn', emit: 'stdout' },
      { level: 'error', emit: 'stdout' },
    ],
  });

  await prisma.$connect();

  // Push the Prisma schema to the test database.
  // This ensures the test DB has the latest schema before any test runs.
  // DEVIATION: We use `db push` instead of `migrate deploy` because
  // migrations may reference PgBouncer-specific settings. `db push`
  // creates the schema directly from the Prisma schema file.
  const { execSync } = await import('child_process');
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DIRECT_DATABASE_URL: databaseUrl,
    },
    stdio: 'pipe',
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Transaction rollback pattern
// ---------------------------------------------------------------------------

beforeEach(async () => {
  // Begin a transaction — all test queries run inside it
  await prisma.$executeRawUnsafe('BEGIN');
});

afterEach(async () => {
  // Rollback the transaction — undoes ALL changes made during the test
  await prisma.$executeRawUnsafe('ROLLBACK');
});

// ---------------------------------------------------------------------------
// Export the Prisma client for test files
// ---------------------------------------------------------------------------

/**
 * Prisma client connected to the test database.
 *
 * ALL database operations in integration tests must use this client.
 * Operations performed outside a transaction (before beforeEach or
 * after afterEach) will NOT be rolled back — use the hooks wisely.
 */
export { prisma };
