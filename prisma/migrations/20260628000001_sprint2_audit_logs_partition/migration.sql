-- =============================================================================
-- Sprint 2: sys.audit_logs — Partitioned Audit Trail Table
-- =============================================================================
-- OK Footwear ERP — PostgreSQL 16
--
-- Partitioned by RANGE on created_at with yearly child partitions.
-- Partitioning ensures:
--   - Fast date-range queries (partition pruning via constraint exclusion)
--   - Efficient bulk deletes (DROP old partition instead of DELETE + VACUUM)
--   - Isolation: heavy audit writes on current partition don't block reads on
--     historical partitions
--
-- Prisma limitation: Prisma v5 cannot model partitioned tables.
-- All inserts/reads use Prisma $queryRaw / $queryRawUnsafe.
--
-- Design decisions:
--   - id: UUID v4 (gen_random_uuid()) — not a sequence, works across partitions
--   - record_id: TEXT (not UUID) — some records use composite or non-UUID keys
--   - old_value / new_value: JSONB — flexible schema for any entity shape
--   - No default partition — out-of-range dates raise an error (fail-loudly)
--   - action CHECK constraint at the database level — app-level enums are bypassable
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Parent table (partitioned)
-- ---------------------------------------------------------------------------

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

  -- FK to sys.users (nullable — system actions may have no user)
  CONSTRAINT fk_audit_logs_changed_by
    FOREIGN KEY (changed_by)
    REFERENCES sys.users (id)
    ON DELETE SET NULL,

  -- Action whitelist — enforced at database level
  CONSTRAINT chk_audit_logs_action
    CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'SELECT'))

) PARTITION BY RANGE (created_at);

-- ---------------------------------------------------------------------------
-- 2. Yearly partitions — current year + next year
-- ---------------------------------------------------------------------------
-- RANGE bounds: inclusive lower, exclusive upper.
-- 2026: [2026-01-01, 2027-01-01)
-- 2027: [2027-01-01, 2028-01-01)
--
-- Add new partitions annually (or automate via pg_partman in production).
-- ---------------------------------------------------------------------------

CREATE TABLE sys.audit_logs_2026
  PARTITION OF sys.audit_logs
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

CREATE TABLE sys.audit_logs_2027
  PARTITION OF sys.audit_logs
  FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');

-- ---------------------------------------------------------------------------
-- 3. Indexes — per partition (most reliable across PG versions)
-- ---------------------------------------------------------------------------
-- GIN index on new_value: enables fast JSONB queries:
--   WHERE new_value @> '{"status": "confirmed"}'
--   WHERE new_value ? 'approved_by'
-- Composite btree on (table_name, record_id): enables fast lookup of
-- all changes to a specific record (the most common audit query pattern).

-- 2026 partition indexes
CREATE INDEX idx_audit_2026_new_value_gin
  ON sys.audit_logs_2026 USING GIN (new_value);

CREATE INDEX idx_audit_2026_table_record
  ON sys.audit_logs_2026 (table_name, record_id);

-- 2027 partition indexes
CREATE INDEX idx_audit_2027_new_value_gin
  ON sys.audit_logs_2027 USING GIN (new_value);

CREATE INDEX idx_audit_2027_table_record
  ON sys.audit_logs_2027 (table_name, record_id);

-- ---------------------------------------------------------------------------
-- 4. Index on parent — for cross-partition queries
-- ---------------------------------------------------------------------------
-- created_at index supports partition pruning and date-range scans.
-- (table_name, created_at) supports the most common audit query:
-- "show all changes to orders table in the last 7 days".

CREATE INDEX idx_audit_logs_created_at
  ON sys.audit_logs (created_at DESC);

CREATE INDEX idx_audit_logs_table_created
  ON sys.audit_logs (table_name, created_at DESC);

-- ---------------------------------------------------------------------------
-- 5. Comments
-- ---------------------------------------------------------------------------

COMMENT ON TABLE sys.audit_logs IS
  'Append-only audit trail. Partitioned yearly by created_at. Inserts via $queryRaw — Prisma cannot model partitioned tables.';

COMMENT ON COLUMN sys.audit_logs.record_id IS
  'TEXT (not UUID) to support composite keys and legacy non-UUID identifiers.';

COMMENT ON COLUMN sys.audit_logs.old_value IS
  'JSONB snapshot of the record BEFORE the mutation. NULL for INSERT actions.';

COMMENT ON COLUMN sys.audit_logs.new_value IS
  'JSONB snapshot of the record AFTER the mutation. NULL for DELETE actions.';

COMMENT ON COLUMN sys.audit_logs.correlation_id IS
  'UUID v7 correlation ID linking this audit entry to the originating HTTP request.';
