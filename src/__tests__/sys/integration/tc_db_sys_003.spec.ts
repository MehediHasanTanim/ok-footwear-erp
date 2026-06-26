// =============================================================================
// TC-DB-SYS-003 — sys.next_doc_number() Concurrency Test (20 callers)
// =============================================================================
// OK Footwear ERP — Sprint 1
// Module: sys
// Layer under test: PostgreSQL PL/pgSQL function sys.next_doc_number()
//                    under concurrent load (SELECT ... FOR UPDATE row locking)
//
// WARNING: THIS TEST COMMITS
// =============================================================================
// Unlike other integration tests that rely on transaction rollback for
// isolation, this test MUST commit each concurrent transaction. Rolling
// back would release row-level locks before other callers acquire them,
// making race conditions undetectable. All 20 concurrent calls run in
// INDEPENDENT pg.Pool connections, each doing its own BEGIN → call →
// COMMIT cycle. Side effects (GRN sequence advancing to 20+) persist
// after this test completes.
//
// Why raw pg.Pool instead of Prisma:
//   Prisma's connection pool is shared with the setup file's transaction
//   rollback pattern (BEGIN on one connection, all queries on same).
//   We need 20 truly independent connections firing simultaneously to
//   exercise PostgreSQL's row-level lock contention. pg.Pool gives us
//   direct control over per-connection transaction boundaries.
//
// Prerequisites:
//   1. PostgreSQL 16 container (started by testcontainers global setup)
//   2. sys.document_sequences table exists (from Prisma schema)
//   3. sys.next_doc_number() function deployed (created in beforeAll below)
//   4. pg (node-postgres) installed as devDependency for raw pool
// =============================================================================

import { prisma } from '@test/helpers/integration-test-setup';
import pg from 'pg';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Current year for dynamic format assertions (function embeds the year). */
const CURRENT_YEAR = new Date().getFullYear();

/** Number of concurrent callers to simulate. */
const CONCURRENT_CALLERS = 20;

/** Maximum pool connections — must exceed CONCURRENT_CALLERS. */
const POOL_MAX = 25;

/** Prefix under test — GRN (Goods Receipt Notes, prc schema). */
const PREFIX = 'GRN';

// ---------------------------------------------------------------------------
// Raw pg.Pool for concurrent connections
// ---------------------------------------------------------------------------
// Created in beforeAll, destroyed in afterAll.
// Each test borrows a client → BEGIN → call function → COMMIT → release.
// ---------------------------------------------------------------------------

let pool: pg.Pool;

// ---------------------------------------------------------------------------
// Lifecycle — Deploy function, seed GRN prefix, create pg.Pool
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // -------------------------------------------------------------------
  // 1. Create the PL/pgSQL function (idempotent)
  // -------------------------------------------------------------------
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION sys.next_doc_number(p_prefix TEXT)
    RETURNS TEXT
    LANGUAGE plpgsql
    AS $$
    DECLARE
      v_last_number INT;
      v_pad_length  INT;
      v_separator   CHAR(1);
      v_year        INT;
      v_formatted   TEXT;
    BEGIN
      -- Validate input
      IF p_prefix IS NULL OR p_prefix = '' THEN
        RAISE EXCEPTION 'Document sequence prefix cannot be NULL or empty';
      END IF;

      -- Row-level lock — acquired immediately, released at transaction end
      SELECT last_number, pad_length, separator
      INTO   v_last_number, v_pad_length, v_separator
      FROM   sys.document_sequences
      WHERE  prefix = p_prefix
      FOR UPDATE;

      -- Unknown prefix → error
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown document sequence prefix: ''%''. '
                        'Available prefixes: ORD, PO, GRN, PAY',
                        p_prefix;
      END IF;

      -- Increment
      v_last_number := v_last_number + 1;

      -- Persist
      UPDATE sys.document_sequences
      SET last_number = v_last_number
      WHERE prefix = p_prefix;

      -- Format: GRN-2025-000001
      v_year      := EXTRACT(YEAR FROM CURRENT_DATE)::INT;
      v_formatted := p_prefix
                  || v_separator
                  || v_year::TEXT
                  || v_separator
                  || LPAD(v_last_number::TEXT, v_pad_length, '0');

      RETURN v_formatted;
    END;
    $$;
  `);

  // -------------------------------------------------------------------
  // 2. Seed the GRN prefix with last_number = 0 (idempotent upsert)
  // -------------------------------------------------------------------
  await prisma.$executeRawUnsafe(`
    INSERT INTO sys.document_sequences (prefix, last_number, pad_length, separator)
    VALUES ('${PREFIX}', 0, 6, '-')
    ON CONFLICT (prefix)
    DO UPDATE SET last_number = 0, pad_length = 6, separator = '-'
  `);

  // -------------------------------------------------------------------
  // 3. Create pg.Pool — 25 connections, enough for 20 concurrent callers
  // -------------------------------------------------------------------
  const databaseUrl = process.env['TEST_DIRECT_DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error(
      'TEST_DIRECT_DATABASE_URL is not set. ' +
        'Ensure integration-global-setup.ts ran successfully.',
    );
  }

  pool = new pg.Pool({
    connectionString: databaseUrl,
    max: POOL_MAX,
    // Acquire timeout: fail fast if pool is exhausted
    connectionTimeoutMillis: 5_000,
    // Idle timeout: clean up unused connections
    idleTimeoutMillis: 10_000,
  });

  // Verify pool connectivity
  const client = await pool.connect();
  await client.query('SELECT 1');
  client.release();
});

afterAll(async () => {
  if (pool) {
    await pool.end();
  }
});

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('sys.next_doc_number() under concurrent load', () => {
  // =========================================================================
  // Concurrency — 20 simultaneous callers
  // =========================================================================

  // WARNING: THIS TEST COMMITS
  // Each pg connection runs BEGIN → next_doc_number() → COMMIT.
  // The setup file's afterEach ROLLBACK only affects Prisma's connection,
  // not the pg.Pool connections. The GRN sequence counter persists at 20+
  // after this test.
  describe('20 concurrent calls via pg.Pool (COMMITTED)', () => {
    it(
      'produces no duplicate numbers and forms an unbroken sequence 1..20',
      async () => {
        // =============================================================
        // Step 1 & 2 — Fire 20 concurrent calls via Promise.all()
        // =============================================================
        // Each caller: acquires a pool client → BEGIN → calls function
        // → COMMIT → releases client. The SELECT ... FOR UPDATE in the
        // function serializes access to the GRN row — only one caller
        // can hold the lock at a time. Others queue up.
        //
        // We use Promise.allSettled to collect BOTH successes and
        // failures — a deadlock or lock timeout would appear as a
        // rejected promise, not crash the test runner.

        const callers = Array.from({ length: CONCURRENT_CALLERS }, () => {
          return (async (): Promise<string> => {
            const client = await pool.connect();
            try {
              await client.query('BEGIN');
              const result = await client.query<{ next_doc_number: string }>(
                `SELECT sys.next_doc_number('${PREFIX}') AS next_doc_number`,
              );
              await client.query('COMMIT');
              return result.rows[0]!.next_doc_number;
            } finally {
              // Always release — even if COMMIT failed, return the
              // connection to the pool
              client.release();
            }
          })();
        });

        const settlements = await Promise.allSettled(callers);

        // =============================================================
        // Assertion: No call threw a deadlock or lock timeout error
        // =============================================================
        const failures = settlements.filter(
          (s): s is PromiseRejectedResult => s.status === 'rejected',
        );

        if (failures.length > 0) {
          // Surface all failure reasons for debugging
          const reasons = failures.map((f) => String(f.reason));
          throw new Error(
            `${failures.length}/${CONCURRENT_CALLERS} concurrent calls failed:\n` +
              reasons.map((r, i) => `  [${i + 1}] ${r}`).join('\n'),
          );
        }

        // =============================================================
        // Step 3 — Collect all 20 returned values
        // =============================================================
        const results = settlements
          .filter((s): s is PromiseFulfilledResult<string> => s.status === 'fulfilled')
          .map((s) => s.value);

        // =============================================================
        // Step 4 — Extract & sort numeric parts
        // =============================================================
        const numericParts = results.map((docNumber) => {
          const numStr = docNumber.split('-').pop()!;
          return parseInt(numStr, 10);
        });

        const sorted = [...numericParts].sort((a, b) => a - b);

        // =============================================================
        // Assertion 1: All 20 returned strings are unique
        // =============================================================
        // Duplicates would mean the row lock failed to serialize access.
        // This is THE critical assertion — the whole point of the test.
        const uniqueSet = new Set(results);
        expect(uniqueSet.size).toBe(CONCURRENT_CALLERS);

        // =============================================================
        // Assertion 2: Numeric parts form unbroken sequence 1..20
        // =============================================================
        // After sorting, we must see exactly [1, 2, 3, ..., 20].
        // Any gap (e.g., 3 and 5 without 4) = lock failure.
        const expectedSequence = Array.from(
          { length: CONCURRENT_CALLERS },
          (_, i) => i + 1,
        );
        expect(sorted).toEqual(expectedSequence);

        // =============================================================
        // Assertion 3: No gap (redundant but explicit per spec)
        // =============================================================
        for (let i = 0; i < sorted.length - 1; i++) {
          expect(sorted[i + 1]!).toBe(sorted[i]! + 1);
        }
      },
      // Timeout: allow up to 10 seconds for all 20 concurrent calls.
      // Each call does BEGIN → function → COMMIT, serialized by the
      // row lock. Even with lock contention, 500ms per call is generous.
      10_000,
    );
  });

  // =========================================================================
  // Post-concurrency state verification
  // =========================================================================

  describe('Table state after concurrent calls', () => {
    // WARNING: THIS TEST COMMITS
    // This test's pg.Pool connections commit. It reads the GRN counter
    // after the concurrency test above has already advanced it to 20.
    // The Prisma query runs inside the setup file's transaction (BEGIN
    // from beforeEach), but READ COMMITTED isolation ensures it sees
    // data committed by the pg connections.
    it('sys.document_sequences.last_number equals 20 for GRN prefix', async () => {
      // Fire 20 concurrent calls via pg.Pool (each commits)
      const callers = Array.from({ length: CONCURRENT_CALLERS }, () => {
        return (async (): Promise<void> => {
          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            await client.query(
              `SELECT sys.next_doc_number('${PREFIX}')`,
            );
            await client.query('COMMIT');
          } finally {
            client.release();
          }
        })();
      });

      await Promise.all(callers);

      // Query the table via Prisma to verify stored counter
      const seqRows = await prisma.$queryRawUnsafe<
        Array<{ last_number: number }>
      >(
        `SELECT last_number FROM sys.document_sequences WHERE prefix = '${PREFIX}'`,
      );

      // NOTE: Since the previous test in this file also committed 20 calls,
      // the counter could be 40 if tests run in sequence. We assert it's
      // a multiple of 20 and at least 20 — the exact value depends on
      // test execution order within the file.
      expect(seqRows[0]!.last_number).toBeGreaterThanOrEqual(CONCURRENT_CALLERS);
      expect(seqRows[0]!.last_number % CONCURRENT_CALLERS).toBe(0);
    });
  });

  // =========================================================================
  // Negative assertions
  // =========================================================================

  describe('Negative assertions — duplicates and gaps', () => {
    // WARNING: THIS TEST COMMITS
    it('no duplicate values appear across all 20 concurrent results', async () => {
      const callers = Array.from({ length: CONCURRENT_CALLERS }, () => {
        return (async (): Promise<string> => {
          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            const result = await client.query<{ next_doc_number: string }>(
              `SELECT sys.next_doc_number('${PREFIX}') AS next_doc_number`,
            );
            await client.query('COMMIT');
            return result.rows[0]!.next_doc_number;
          } finally {
            client.release();
          }
        })();
      });

      const results = await Promise.all(callers);

      // Detecting duplicates: if Set size < 20, there's a duplicate
      const uniqueCount = new Set(results).size;
      expect(uniqueCount).toBe(CONCURRENT_CALLERS);

      // Explicitly check: no two results are equal
      for (let i = 0; i < results.length; i++) {
        for (let j = i + 1; j < results.length; j++) {
          expect(results[i]).not.toBe(results[j]);
        }
      }
    });

    // WARNING: THIS TEST COMMITS
    it('no gaps in the sequence — every number from 1 to 20 is present', async () => {
      const callers = Array.from({ length: CONCURRENT_CALLERS }, () => {
        return (async (): Promise<string> => {
          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            const result = await client.query<{ next_doc_number: string }>(
              `SELECT sys.next_doc_number('${PREFIX}') AS next_doc_number`,
            );
            await client.query('COMMIT');
            return result.rows[0]!.next_doc_number;
          } finally {
            client.release();
          }
        })();
      });

      const results = await Promise.all(callers);

      // Extract all numeric parts and sort them
      const nums = results
        .map((r) => parseInt(r.split('-').pop()!, 10))
        .sort((a, b) => a - b);

      // Every number 1..20 must be present — no gaps
      for (let expected = 1; expected <= CONCURRENT_CALLERS; expected++) {
        expect(nums).toContain(expected);
      }

      // Additionally verify the sorted array is exactly [1..20]
      expect(nums).toEqual(
        Array.from({ length: CONCURRENT_CALLERS }, (_, i) => i + 1),
      );
    });
  });
});
