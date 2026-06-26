-- =============================================================================
-- Migration: sys.document_sequences — Sequential Document Number Generator
-- =============================================================================
-- OK Footwear ERP — Sprint 1: Infrastructure
--
-- Creates the document_sequences table and a PL/pgSQL function that generates
-- gapless, concurrency-safe document numbers for orders, purchase orders,
-- goods receipts, and payroll.
--
-- Format: <PREFIX>-<YEAR>-<PADDED_NUMBER>
-- Example: ORD-2025-000001
--
-- Concurrency: SELECT ... FOR UPDATE locks only the row for the requested
-- prefix — other prefixes can generate numbers simultaneously.

-- ---------------------------------------------------------------------------
-- 1. Table: sys.document_sequences
-- ---------------------------------------------------------------------------
-- Each row represents one document type (order, PO, GRN, payroll).
-- The prefix is the primary key — no UUID needed because prefixes are
-- a small, fixed set managed through seed data or admin UI.
--
-- Columns:
--   prefix      — Short code identifying the document type (e.g., 'ORD', 'PO')
--   last_number — Most recently issued sequence number (incremented atomically)
--   pad_length  — Zero-pad width for the numeric portion (default 6 → 000001)
--   separator   — Character between prefix/year/number (default '-')

CREATE TABLE sys.document_sequences (
  prefix      VARCHAR(10) PRIMARY KEY,
  last_number INT         NOT NULL DEFAULT 0,
  pad_length  INT         NOT NULL DEFAULT 6,
  separator   CHAR(1)     NOT NULL DEFAULT '-'
);

-- ---------------------------------------------------------------------------
-- 2. Seed Data — Four core document prefixes
-- ---------------------------------------------------------------------------
-- ORD  — Sales Orders (ord schema)
-- PO   — Purchase Orders (prc schema)
-- GRN  — Goods Receipt Notes (prc schema)
-- PAY  — Payroll runs (hr schema)
--
-- All start at 0; the first call to next_doc_number() for each returns
-- number 000001.

INSERT INTO sys.document_sequences (prefix, last_number, pad_length, separator)
VALUES
  ('ORD', 0, 6, '-'),
  ('PO',  0, 6, '-'),
  ('GRN', 0, 6, '-'),
  ('PAY', 0, 6, '-');

-- ---------------------------------------------------------------------------
-- 3. Function: sys.next_doc_number(p_prefix TEXT) → TEXT
-- ---------------------------------------------------------------------------
-- Generates the next sequential document number for a given prefix.
--
-- Algorithm:
--   1. SELECT ... FOR UPDATE on the row matching p_prefix.
--      This acquires a row-level exclusive lock — other transactions
--      calling next_doc_number() for the SAME prefix will wait.
--      Transactions calling for DIFFERENT prefixes proceed immediately.
--
--   2. If no row found → RAISE EXCEPTION (unknown prefix).
--
--   3. Increment last_number by 1.
--
--   4. UPDATE the row with the new last_number.
--
--   5. Format and return: <PREFIX><SEP><YEAR><SEP><ZEROS><NUMBER>
--      Example: ORD-2025-000001
--
-- Concurrency safety:
--   - Row-level lock (FOR UPDATE) → no duplicates for the same prefix.
--   - Different prefixes → no lock contention (parallel throughput).
--   - Transactional → if the caller's transaction rolls back, so does
--     the sequence increment. This MAY cause gaps in the sequence,
--     which is acceptable per GAAP — document numbers don't need to
--     be gapless, only unique.
--
-- DEVIATION: The function does NOT reset the counter at year boundaries
-- by default. If year-reset is needed, add a `year` column and a
-- conditional reset in the function. This is deferred to Sprint 3+
-- when fiscal year requirements are finalized.

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

-- ---------------------------------------------------------------------------
-- 4. Permission — Grant execute to the application role
-- ---------------------------------------------------------------------------
-- DEVIATION: The GRANT statement uses a placeholder role name. In production,
-- replace 'ok_footwear' with the actual application database role configured
-- in the environment. This migration runs as the migration user (superuser
-- or CREATEDB role), which can GRANT to other roles.

-- GRANT EXECUTE ON FUNCTION sys.next_doc_number(TEXT) TO ok_footwear;
