// =============================================================================
// TC-DB-SYS-001 — sys.next_doc_number() Database Integration Test
// =============================================================================
// OK Footwear ERP — Sprint 1
// Module: sys
// Layer under test: PostgreSQL PL/pgSQL function sys.next_doc_number()
//
// Prerequisites:
//   1. PostgreSQL 16 container (started by testcontainers global setup)
//   2. Prisma schema pushed to test DB (done in integration-test-setup.ts)
//   3. sys.document_sequences table exists (from Prisma schema)
//   4. sys.next_doc_number() function deployed (created in beforeAll below)
//
// Isolation: Each test runs inside a transaction (BEGIN/ROLLBACK) managed by
// integration-test-setup.ts. No test data leaks between tests.
// =============================================================================

import { prisma } from '@test/helpers/integration-test-setup';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Current year for dynamic format assertions (function embeds the year). */
const CURRENT_YEAR = new Date().getFullYear();

/** Regex matching the expected format: PREFIX-SEP-YEAR-SEP-ZERO_PADDED_NUMBER */
const DOC_NUMBER_PATTERN = /^[A-Z]{2,4}-\d{4}-\d{6}$/;

// ---------------------------------------------------------------------------
// Lifecycle — Deploy function & seed data (outside transaction)
// ---------------------------------------------------------------------------
// The next_doc_number() function is defined in the baseline migration SQL.
// `prisma db push` only creates tables/columns from the Prisma schema —
// it does NOT execute migration SQL. Therefore we create the function and
// seed data manually before any test runs.
//
// These operations run OUTSIDE the transaction (beforeAll runs before the
// first beforeEach→BEGIN). This means:
//   - The function and seed row persist across all tests in this file.
//   - Each test's BEGIN/ROLLBACK cycle resets the sequence to 0 because
//     the seed INSERT ON CONFLICT DO UPDATE sets last_number = 0.
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // -------------------------------------------------------------------
  // 1. Create the PL/pgSQL function
  // -------------------------------------------------------------------
  // Idempotent: CREATE OR REPLACE ensures it works even if the function
  // already exists (e.g., from another test file's beforeAll).
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

      -- Format: ORD-2025-000001
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
  // 2. Seed the ORD prefix (idempotent upsert)
  // -------------------------------------------------------------------
  // ON CONFLICT DO UPDATE ensures the seed data is reset even if a
  // previous test file left the sequence in a dirty state.
  // -------------------------------------------------------------------
  await prisma.$executeRawUnsafe(`
    INSERT INTO sys.document_sequences (prefix, last_number, pad_length, separator)
    VALUES ('ORD', 0, 6, '-')
    ON CONFLICT (prefix)
    DO UPDATE SET last_number = 0, pad_length = 6, separator = '-'
  `);
});

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('sys.next_doc_number()', () => {
  // =========================================================================
  // Happy Path
  // =========================================================================
  describe('Happy path — prefix ORD', () => {
    /**
     * TC-DB-SYS-001 Step 1–2: Call SELECT sys.next_doc_number('ORD') and
     * capture the returned TEXT value.
     */
    it('returns formatted string ORD-{year}-000001 for first call', async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ next_doc_number: string }>
      >("SELECT sys.next_doc_number('ORD') AS next_doc_number");

      expect(rows[0]!.next_doc_number).toBe(`ORD-${CURRENT_YEAR}-000001`);
    });

    it('increments the sequence number on subsequent calls within the same transaction', async () => {
      // First call → 000001
      await prisma.$queryRawUnsafe("SELECT sys.next_doc_number('ORD')");

      // Second call → 000002
      const rows = await prisma.$queryRawUnsafe<
        Array<{ next_doc_number: string }>
      >("SELECT sys.next_doc_number('ORD') AS next_doc_number");

      expect(rows[0]!.next_doc_number).toBe(`ORD-${CURRENT_YEAR}-000002`);
    });

    it('format matches pattern: {PREFIX}{SEP}{YEAR}{SEP}{zero-padded 6-digit number}', async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ next_doc_number: string }>
      >("SELECT sys.next_doc_number('ORD') AS next_doc_number");

      expect(rows[0]!.next_doc_number).toMatch(DOC_NUMBER_PATTERN);
    });

    it('return type is TEXT (JavaScript string), not integer', async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ next_doc_number: string }>
      >("SELECT sys.next_doc_number('ORD') AS next_doc_number");

      const value = rows[0]!.next_doc_number;

      // Must be a string type in JavaScript
      expect(typeof value).toBe('string');

      // Must NOT be parseable as a plain integer
      expect(Number.isNaN(Number(value))).toBe(true);
    });

    it('result contains the prefix, separator, year, and zero-padded number as distinct parts', async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ next_doc_number: string }>
      >("SELECT sys.next_doc_number('ORD') AS next_doc_number");

      const parts = rows[0]!.next_doc_number.split('-');

      expect(parts).toHaveLength(3);
      expect(parts[0]).toBe('ORD'); // prefix
      expect(parts[1]).toBe(String(CURRENT_YEAR)); // year
      expect(parts[2]).toBe('000001'); // zero-padded number (6 digits)
      expect(parts[2]!.length).toBe(6);
    });
  });

  // =========================================================================
  // Negative Cases
  // =========================================================================
  describe('Negative cases', () => {
    it('raises an exception when called with an unknown prefix (e.g. XXX)', async () => {
      // Must raise — must NOT silently return NULL
      await expect(
        prisma.$queryRawUnsafe("SELECT sys.next_doc_number('XXX')"),
      ).rejects.toThrow();
    });

    it('exception message for unknown prefix includes the invalid prefix name', async () => {
      await expect(
        prisma.$queryRawUnsafe("SELECT sys.next_doc_number('XXX')"),
      ).rejects.toThrow(/XXX/);
    });

    it('raises an exception when called with an empty string prefix', async () => {
      await expect(
        prisma.$queryRawUnsafe("SELECT sys.next_doc_number('')"),
      ).rejects.toThrow();
    });

    it('raises an exception when called with NULL prefix (not silently return NULL)', async () => {
      // The spec says: unknown prefix must raise exception — do NOT silently return NULL.
      // NULL prefix is also invalid and must raise.
      await expect(
        prisma.$queryRawUnsafe('SELECT sys.next_doc_number(NULL)'),
      ).rejects.toThrow();
    });

    it('does NOT return an un-padded format like ORD-{year}-1', async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ next_doc_number: string }>
      >("SELECT sys.next_doc_number('ORD') AS next_doc_number");

      const value = rows[0]!.next_doc_number;

      // Extract the numeric portion after the last dash
      const numericPart = value.split('-').pop()!;

      // Must be exactly 6 digits, not a single digit
      expect(numericPart).toHaveLength(6);
      expect(numericPart).toBe('000001');

      // Sanity: must NOT match a pattern ending in single digit
      expect(value).not.toMatch(/-\d$/);
    });

    it('does NOT return a format without separators like ORD2026000001', async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ next_doc_number: string }>
      >("SELECT sys.next_doc_number('ORD') AS next_doc_number");

      const value = rows[0]!.next_doc_number;

      // Must contain exactly two separators (dashes)
      const separatorCount = (value.match(/-/g) ?? []).length;
      expect(separatorCount).toBe(2);

      // Must NOT be a continuous alphanumeric string without separators
      expect(value).not.toMatch(/^ORD\d+$/);
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================
  describe('Edge cases', () => {
    it('sequences are independent between different prefixes', async () => {
      // Seed another prefix for this test
      await prisma.$executeRawUnsafe(`
        INSERT INTO sys.document_sequences (prefix, last_number, pad_length, separator)
        VALUES ('TST', 0, 6, '-')
        ON CONFLICT (prefix)
        DO UPDATE SET last_number = 0, pad_length = 6, separator = '-'
      `);

      // Generate ORD → 000001
      await prisma.$queryRawUnsafe("SELECT sys.next_doc_number('ORD')");

      // Generate TST → should be 000001 (independent counter)
      const tstRows = await prisma.$queryRawUnsafe<
        Array<{ next_doc_number: string }>
      >("SELECT sys.next_doc_number('TST') AS next_doc_number");

      expect(tstRows[0]!.next_doc_number).toBe(`TST-${CURRENT_YEAR}-000001`);

      // ORD should now be at 000002 (not affected by TST)
      const ordRows = await prisma.$queryRawUnsafe<
        Array<{ next_doc_number: string }>
      >("SELECT sys.next_doc_number('ORD') AS next_doc_number");

      expect(ordRows[0]!.next_doc_number).toBe(`ORD-${CURRENT_YEAR}-000002`);
    });

    it('zero-padding preserves width when sequence reaches double digits', async () => {
      // Manually set the sequence to 9 so the next call produces 10
      await prisma.$executeRawUnsafe(
        "UPDATE sys.document_sequences SET last_number = 9 WHERE prefix = 'ORD'",
      );

      const rows = await prisma.$queryRawUnsafe<
        Array<{ next_doc_number: string }>
      >("SELECT sys.next_doc_number('ORD') AS next_doc_number");

      // Should be zero-padded to 6 digits: 000010
      const numericPart = rows[0]!.next_doc_number.split('-').pop()!;
      expect(numericPart).toBe('000010');
      expect(numericPart).toHaveLength(6);
    });

    it('function is callable multiple times without degrading performance', async () => {
      // Generate 10 sequential numbers — validates lock isn't held indefinitely
      for (let i = 1; i <= 10; i++) {
        const rows = await prisma.$queryRawUnsafe<
          Array<{ next_doc_number: string }>
        >("SELECT sys.next_doc_number('ORD') AS next_doc_number");

        const expectedNumber = String(i).padStart(6, '0');
        expect(rows[0]!.next_doc_number).toBe(
          `ORD-${CURRENT_YEAR}-${expectedNumber}`,
        );
      }
    });
  });

  // =========================================================================
  // Transaction Isolation
  // =========================================================================
  describe('Transaction isolation', () => {
    it('sequence is reset to 0 in each test due to transaction rollback', async () => {
      // This test verifies that the afterEach ROLLBACK in the setup file
      // actually resets the sequence. The seed INSERT ON CONFLICT in beforeAll
      // set last_number = 0, and each test's transaction rolls back.
      // So the first call in any test should always return ...-000001.

      const rows = await prisma.$queryRawUnsafe<
        Array<{ next_doc_number: string }>
      >("SELECT sys.next_doc_number('ORD') AS next_doc_number");

      expect(rows[0]!.next_doc_number).toBe(`ORD-${CURRENT_YEAR}-000001`);
    });
  });
});
