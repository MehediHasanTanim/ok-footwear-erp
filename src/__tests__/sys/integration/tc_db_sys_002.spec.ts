// =============================================================================
// TC-DB-SYS-002 — sys.next_doc_number() Counter Increment Test
// =============================================================================
// OK Footwear ERP — Sprint 1
// Module: sys
// Layer under test: PostgreSQL PL/pgSQL function sys.next_doc_number()
//
// Purpose: Verifies that each call to sys.next_doc_number() increments the
// counter in sys.document_sequences by exactly 1 and returns the new value.
// Gaps or non-monotonic increments would corrupt document numbering.
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

// ---------------------------------------------------------------------------
// Lifecycle — Deploy function & seed PO prefix (outside transaction)
// ---------------------------------------------------------------------------
// The next_doc_number() function is defined in the baseline migration SQL.
// `prisma db push` only creates tables/columns from the Prisma schema —
// it does NOT execute migration SQL. We create the function and seed
// the PO prefix manually before any test runs.
//
// These operations run OUTSIDE the transaction (beforeAll runs before the
// first beforeEach→BEGIN). The seed INSERT ... ON CONFLICT DO UPDATE
// ensures last_number starts at 0 for every test file execution.
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

      -- Format: PO-2025-000001
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
  // 2. Seed the PO prefix with last_number = 0 (idempotent upsert)
  // -------------------------------------------------------------------
  await prisma.$executeRawUnsafe(`
    INSERT INTO sys.document_sequences (prefix, last_number, pad_length, separator)
    VALUES ('PO', 0, 6, '-')
    ON CONFLICT (prefix)
    DO UPDATE SET last_number = 0, pad_length = 6, separator = '-'
  `);
});

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('sys.next_doc_number() counter increment', () => {
  // =========================================================================
  // Happy Path — Sequential Increment
  // =========================================================================
  describe('Happy path — sequential calls increment by exactly 1', () => {
    /**
     * TC-DB-SYS-002 Steps 1–4:
     * Call next_doc_number('PO') three times, capture each result,
     * then query the table directly to verify the stored counter.
     */
    it('returns PO-{year}-000001, 000002, 000003 across three consecutive calls', async () => {
      // Step 1 — Call 1
      const rows1 = await prisma.$queryRawUnsafe<
        Array<{ next_doc_number: string }>
      >("SELECT sys.next_doc_number('PO') AS next_doc_number");
      const result1 = rows1[0]!.next_doc_number;

      // Step 2 — Call 2
      const rows2 = await prisma.$queryRawUnsafe<
        Array<{ next_doc_number: string }>
      >("SELECT sys.next_doc_number('PO') AS next_doc_number");
      const result2 = rows2[0]!.next_doc_number;

      // Step 3 — Call 3
      const rows3 = await prisma.$queryRawUnsafe<
        Array<{ next_doc_number: string }>
      >("SELECT sys.next_doc_number('PO') AS next_doc_number");
      const result3 = rows3[0]!.next_doc_number;

      // Assert each return value
      expect(result1).toBe(`PO-${CURRENT_YEAR}-000001`);
      expect(result2).toBe(`PO-${CURRENT_YEAR}-000002`);
      expect(result3).toBe(`PO-${CURRENT_YEAR}-000003`);
    });

    it('last_number in the table equals 3 after three calls', async () => {
      // Call the function three times
      await prisma.$queryRawUnsafe("SELECT sys.next_doc_number('PO')");
      await prisma.$queryRawUnsafe("SELECT sys.next_doc_number('PO')");
      await prisma.$queryRawUnsafe("SELECT sys.next_doc_number('PO')");

      // Step 4 — Query the table directly to verify stored counter
      const seqRows = await prisma.$queryRawUnsafe<
        Array<{ last_number: number }>
      >("SELECT last_number FROM sys.document_sequences WHERE prefix = 'PO'");

      expect(seqRows[0]!.last_number).toBe(3);
    });

    it('each call increments last_number by exactly 1 — never 0, never 2', async () => {
      // Call 1 → counter should become 1
      await prisma.$queryRawUnsafe("SELECT sys.next_doc_number('PO')");
      const after1 = await prisma.$queryRawUnsafe<
        Array<{ last_number: number }>
      >("SELECT last_number FROM sys.document_sequences WHERE prefix = 'PO'");
      expect(after1[0]!.last_number).toBe(1);

      // Call 2 → counter should become 2 (not 0, not 3+)
      await prisma.$queryRawUnsafe("SELECT sys.next_doc_number('PO')");
      const after2 = await prisma.$queryRawUnsafe<
        Array<{ last_number: number }>
      >("SELECT last_number FROM sys.document_sequences WHERE prefix = 'PO'");
      expect(after2[0]!.last_number).toBe(2);

      // Call 3 → counter should become 3
      await prisma.$queryRawUnsafe("SELECT sys.next_doc_number('PO')");
      const after3 = await prisma.$queryRawUnsafe<
        Array<{ last_number: number }>
      >("SELECT last_number FROM sys.document_sequences WHERE prefix = 'PO'");
      expect(after3[0]!.last_number).toBe(3);
    });
  });

  // =========================================================================
  // Negative Assertions
  // =========================================================================
  describe('Negative assertions', () => {
    it('last_number must NOT remain 0 after a call — function must UPDATE the row', async () => {
      // Verify initial state is 0
      const before = await prisma.$queryRawUnsafe<
        Array<{ last_number: number }>
      >("SELECT last_number FROM sys.document_sequences WHERE prefix = 'PO'");
      expect(before[0]!.last_number).toBe(0);

      // Call the function
      await prisma.$queryRawUnsafe("SELECT sys.next_doc_number('PO')");

      // After the call, last_number must NOT still be 0
      const after = await prisma.$queryRawUnsafe<
        Array<{ last_number: number }>
      >("SELECT last_number FROM sys.document_sequences WHERE prefix = 'PO'");
      expect(after[0]!.last_number).not.toBe(0);
      expect(after[0]!.last_number).toBe(1);
    });

    it('no gaps: result_2 numeric part equals result_1 numeric part + 1', async () => {
      const rows1 = await prisma.$queryRawUnsafe<
        Array<{ next_doc_number: string }>
      >("SELECT sys.next_doc_number('PO') AS next_doc_number");

      const rows2 = await prisma.$queryRawUnsafe<
        Array<{ next_doc_number: string }>
      >("SELECT sys.next_doc_number('PO') AS next_doc_number");

      // Extract numeric parts (last segment after final dash)
      const num1 = parseInt(rows1[0]!.next_doc_number.split('-').pop()!, 10);
      const num2 = parseInt(rows2[0]!.next_doc_number.split('-').pop()!, 10);

      // num2 must be exactly num1 + 1 (no gaps)
      expect(num2).toBe(num1 + 1);
      expect(num2 - num1).toBe(1);
    });

    it('no gaps across three calls: each result increments numeric part by exactly 1', async () => {
      const rows1 = await prisma.$queryRawUnsafe<
        Array<{ next_doc_number: string }>
      >("SELECT sys.next_doc_number('PO') AS next_doc_number");

      const rows2 = await prisma.$queryRawUnsafe<
        Array<{ next_doc_number: string }>
      >("SELECT sys.next_doc_number('PO') AS next_doc_number");

      const rows3 = await prisma.$queryRawUnsafe<
        Array<{ next_doc_number: string }>
      >("SELECT sys.next_doc_number('PO') AS next_doc_number");

      const n1 = parseInt(rows1[0]!.next_doc_number.split('-').pop()!, 10);
      const n2 = parseInt(rows2[0]!.next_doc_number.split('-').pop()!, 10);
      const n3 = parseInt(rows3[0]!.next_doc_number.split('-').pop()!, 10);

      // Monotonic increment by exactly 1 each time
      expect(n2).toBe(n1 + 1);
      expect(n3).toBe(n2 + 1);

      // No skipped numbers
      expect([n1, n2, n3]).toEqual([1, 2, 3]);
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================
  describe('Edge cases', () => {
    it('counter is independent for different prefixes (PO counter unaffected by ORD calls)', async () => {
      // Seed ORD prefix for this test
      await prisma.$executeRawUnsafe(`
        INSERT INTO sys.document_sequences (prefix, last_number, pad_length, separator)
        VALUES ('ORD', 0, 6, '-')
        ON CONFLICT (prefix)
        DO UPDATE SET last_number = 0, pad_length = 6, separator = '-'
      `);

      // Call ORD three times — PO counter must stay at 0
      await prisma.$queryRawUnsafe("SELECT sys.next_doc_number('ORD')");
      await prisma.$queryRawUnsafe("SELECT sys.next_doc_number('ORD')");
      await prisma.$queryRawUnsafe("SELECT sys.next_doc_number('ORD')");

      // PO counter must still be 0 (unaffected by ORD)
      const poBefore = await prisma.$queryRawUnsafe<
        Array<{ last_number: number }>
      >("SELECT last_number FROM sys.document_sequences WHERE prefix = 'PO'");
      expect(poBefore[0]!.last_number).toBe(0);

      // Now call PO — must start from 1, not from 4
      const rows = await prisma.$queryRawUnsafe<
        Array<{ next_doc_number: string }>
      >("SELECT sys.next_doc_number('PO') AS next_doc_number");
      expect(rows[0]!.next_doc_number).toBe(`PO-${CURRENT_YEAR}-000001`);
    });

    it('counter increments correctly when called rapidly in succession', async () => {
      // Simulate rapid-fire calls — 5 calls in quick succession
      const results: string[] = [];
      for (let i = 0; i < 5; i++) {
        const rows = await prisma.$queryRawUnsafe<
          Array<{ next_doc_number: string }>
        >("SELECT sys.next_doc_number('PO') AS next_doc_number");
        results.push(rows[0]!.next_doc_number);
      }

      // Verify each result is exactly one more than the previous
      for (let i = 0; i < results.length; i++) {
        const expectedNumber = String(i + 1).padStart(6, '0');
        expect(results[i]).toBe(`PO-${CURRENT_YEAR}-${expectedNumber}`);
      }

      // Table counter must match the number of calls
      const final = await prisma.$queryRawUnsafe<
        Array<{ last_number: number }>
      >("SELECT last_number FROM sys.document_sequences WHERE prefix = 'PO'");
      expect(final[0]!.last_number).toBe(5);
    });

    it('counter does NOT skip numbers when called from a non-zero starting point', async () => {
      // Manually set the counter to 50
      await prisma.$executeRawUnsafe(
        "UPDATE sys.document_sequences SET last_number = 50 WHERE prefix = 'PO'",
      );

      // Next call must return 51 (not 1, not 52)
      const rows1 = await prisma.$queryRawUnsafe<
        Array<{ next_doc_number: string }>
      >("SELECT sys.next_doc_number('PO') AS next_doc_number");
      expect(rows1[0]!.next_doc_number).toBe(`PO-${CURRENT_YEAR}-000051`);

      // Next call must return 52
      const rows2 = await prisma.$queryRawUnsafe<
        Array<{ next_doc_number: string }>
      >("SELECT sys.next_doc_number('PO') AS next_doc_number");
      expect(rows2[0]!.next_doc_number).toBe(`PO-${CURRENT_YEAR}-000052`);

      // Table counter must be 52
      const seq = await prisma.$queryRawUnsafe<
        Array<{ last_number: number }>
      >("SELECT last_number FROM sys.document_sequences WHERE prefix = 'PO'");
      expect(seq[0]!.last_number).toBe(52);
    });
  });
});
