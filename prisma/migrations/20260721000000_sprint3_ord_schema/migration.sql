-- =============================================================================
-- Sprint 3: ord Schema — Orders, Buyers, Articles, Order Lines, Milestones
-- =============================================================================
-- OK Footwear ERP — PostgreSQL 16
--
-- Replaces the Sprint 1 stub ord schema with the full Sprint 3 design:
--   - ord.buyers (soft-delete, payment terms enum, ISO 4217 currency)
--   - ord.articles (soft-delete, trigram search on code + description)
--   - ord.orders (full state machine: draft → confirmed → ... → delivered)
--   - ord.order_lines (per-size quantities, cascade on order delete)
--   - ord.order_milestones (6 rows generated on order confirmation)
--
-- Also adds:
--   - next_doc_number() function in sys schema (row-locked, concurrency-safe)
--   - Trigram GIN indexes for fuzzy search on buyers.name, articles.code,
--     articles.description
--   - CHECK constraints for data integrity (Prisma cannot express enums as
--     CHECK, so we add them here)
--
-- This migration is NOT idempotent — it assumes the old stub tables are
-- dropped first. Run as a single transaction (Prisma wraps migrations in
-- BEGIN/COMMIT).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Drop old stub tables and types from Sprint 1 (if they exist)
-- ---------------------------------------------------------------------------

-- Drop tables with CASCADE to remove any dependent objects (FKs, etc.)
DROP TABLE IF EXISTS ord.orders CASCADE;
DROP TABLE IF EXISTS ord.buyers CASCADE;

-- Drop old enum types. PostgreSQL stores type names exactly as declared
-- in pg_type.typname (case-sensitive). DROP TYPE IF EXISTS is simpler
-- and more robust than a DO block with a typname check.
DROP TYPE IF EXISTS ord."OrderStatus" CASCADE;
DROP TYPE IF EXISTS ord."PaymentTerm" CASCADE;
DROP TYPE IF EXISTS ord."MilestoneType" CASCADE;
DROP TYPE IF EXISTS ord."MilestoneStatus" CASCADE;

-- ---------------------------------------------------------------------------
-- 2. Enums (Prisma will create these, but we define them explicitly for
--    CHECK constraints and documentation)
-- ---------------------------------------------------------------------------

-- PaymentTerm enum for ord.buyers
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentTerm' AND typnamespace = 'ord'::regnamespace) THEN
    CREATE TYPE ord."PaymentTerm" AS ENUM ('LC_SIGHT', 'LC_USANCE', 'TT_ADVANCE', 'TT_30_DAYS');
  END IF;
END $$;

-- OrderStatus enum for ord.orders
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrderStatus' AND typnamespace = 'ord'::regnamespace) THEN
    CREATE TYPE ord."OrderStatus" AS ENUM ('draft', 'confirmed', 'in_production', 'qc', 'packed', 'delivered', 'cancelled');
  END IF;
END $$;

-- MilestoneType enum for ord.order_milestones
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MilestoneType' AND typnamespace = 'ord'::regnamespace) THEN
    CREATE TYPE ord."MilestoneType" AS ENUM ('material_booking', 'pp_sample', 'bulk_start', 'qc', 'packing', 'shipment');
  END IF;
END $$;

-- MilestoneStatus enum for ord.order_milestones
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MilestoneStatus' AND typnamespace = 'ord'::regnamespace) THEN
    CREATE TYPE ord."MilestoneStatus" AS ENUM ('pending', 'done', 'overdue');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Tables
-- ---------------------------------------------------------------------------

-- 3a. ord.buyers
CREATE TABLE IF NOT EXISTS ord.buyers (
  id            UUID         NOT NULL DEFAULT gen_random_uuid(),
  name          VARCHAR(200) NOT NULL,
  currency      VARCHAR(3)   NOT NULL,
  payment_terms ord."PaymentTerm" NOT NULL,
  credit_limit  DECIMAL(15,2),
  country       VARCHAR(100),
  is_active     BOOLEAN      NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,

  CONSTRAINT pk_buyers PRIMARY KEY (id)
);

-- 3b. ord.articles
CREATE TABLE IF NOT EXISTS ord.articles (
  id          UUID         NOT NULL DEFAULT gen_random_uuid(),
  code        VARCHAR(50)  NOT NULL,
  description TEXT         NOT NULL,
  size_system VARCHAR(20),
  category    VARCHAR(100),
  season      VARCHAR(50),
  is_active   BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ,

  CONSTRAINT pk_articles PRIMARY KEY (id),
  CONSTRAINT uq_articles_code UNIQUE (code)
);

-- 3c. ord.orders
CREATE TABLE IF NOT EXISTS ord.orders (
  id                  UUID              NOT NULL DEFAULT gen_random_uuid(),
  order_number        VARCHAR(20)       NOT NULL,
  buyer_id            UUID              NOT NULL,
  article_id          UUID              NOT NULL,
  status              ord."OrderStatus" NOT NULL DEFAULT 'draft',
  sample_approved     BOOLEAN           NOT NULL DEFAULT false,
  total_quantity      INTEGER           NOT NULL,
  delivery_date       DATE              NOT NULL,
  currency            VARCHAR(3)        NOT NULL,
  confirmed_at        TIMESTAMPTZ,
  confirmed_by        UUID,
  cancelled_at        TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_at          TIMESTAMPTZ       NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ       NOT NULL DEFAULT now(),

  CONSTRAINT pk_orders PRIMARY KEY (id),
  CONSTRAINT uq_orders_order_number UNIQUE (order_number),
  CONSTRAINT fk_orders_buyer FOREIGN KEY (buyer_id) REFERENCES ord.buyers(id),
  CONSTRAINT fk_orders_article FOREIGN KEY (article_id) REFERENCES ord.articles(id)
);

-- 3d. ord.order_lines
CREATE TABLE IF NOT EXISTS ord.order_lines (
  id         UUID          NOT NULL DEFAULT gen_random_uuid(),
  order_id   UUID          NOT NULL,
  size_label VARCHAR(20)   NOT NULL,
  quantity   INTEGER       NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,

  CONSTRAINT pk_order_lines PRIMARY KEY (id),
  CONSTRAINT fk_order_lines_order FOREIGN KEY (order_id) REFERENCES ord.orders(id) ON DELETE CASCADE
);

-- 3e. ord.order_milestones
CREATE TABLE IF NOT EXISTS ord.order_milestones (
  id             UUID                    NOT NULL DEFAULT gen_random_uuid(),
  order_id       UUID                    NOT NULL,
  milestone_type ord."MilestoneType"     NOT NULL,
  planned_date   DATE                    NOT NULL,
  actual_date    DATE,
  status         ord."MilestoneStatus"   NOT NULL DEFAULT 'pending',
  created_at     TIMESTAMPTZ             NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ             NOT NULL DEFAULT now(),

  CONSTRAINT pk_order_milestones PRIMARY KEY (id),
  CONSTRAINT uq_order_milestones_order_type UNIQUE (order_id, milestone_type),
  CONSTRAINT fk_order_milestones_order FOREIGN KEY (order_id) REFERENCES ord.orders(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- 4. Indexes
-- ---------------------------------------------------------------------------

-- Standard lookup indexes
CREATE INDEX IF NOT EXISTS idx_orders_buyer_id ON ord.orders (buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_article_id ON ord.orders (article_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON ord.orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON ord.orders (delivery_date);
CREATE INDEX IF NOT EXISTS idx_order_lines_order_id ON ord.order_lines (order_id);
CREATE INDEX IF NOT EXISTS idx_order_milestones_order_id ON ord.order_milestones (order_id);
CREATE INDEX IF NOT EXISTS idx_order_milestones_planned_status ON ord.order_milestones (planned_date, status);

-- Trigram GIN indexes for fuzzy search (pg_trgm extension already enabled in baseline)
CREATE INDEX IF NOT EXISTS idx_buyers_name_trgm ON ord.buyers USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_articles_code_trgm ON ord.articles USING gin (code gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_articles_description_trgm ON ord.articles USING gin (description gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 5. CHECK constraints (Prisma cannot express these via schema.prisma)
-- ---------------------------------------------------------------------------

-- order_lines.quantity must be > 0
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_order_lines_quantity_positive'
      AND conrelid = 'ord.order_lines'::regclass
  ) THEN
    ALTER TABLE ord.order_lines
      ADD CONSTRAINT chk_order_lines_quantity_positive
      CHECK (quantity > 0);
  END IF;
END $$;

-- order_lines.unit_price must be > 0
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_order_lines_unit_price_positive'
      AND conrelid = 'ord.order_lines'::regclass
  ) THEN
    ALTER TABLE ord.order_lines
      ADD CONSTRAINT chk_order_lines_unit_price_positive
      CHECK (unit_price > 0);
  END IF;
END $$;

-- orders.total_quantity must be > 0
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_orders_total_quantity_positive'
      AND conrelid = 'ord.orders'::regclass
  ) THEN
    ALTER TABLE ord.orders
      ADD CONSTRAINT chk_orders_total_quantity_positive
      CHECK (total_quantity > 0);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. next_doc_number() — Concurrency-safe order number generation
-- =============================================================================
-- DESIGN DECISION: PostgreSQL function with SELECT ... FOR UPDATE row-level
-- locking on sys.document_sequences.
--
-- Why this approach (vs. a locked-sequence-table in application code)?
--   1. sys.document_sequences already exists from Sprint 1 — no new table.
--   2. FOR UPDATE is a well-known Postgres pattern for serialising access
--      to a shared counter — it's the DB equivalent of a mutex.
--   3. The lock is held for the duration of the calling transaction, so the
--      order_number is only "consumed" if the order creation commits.
--   4. No gaps from aborted transactions — the number is assigned inside
--      the same transaction as the INSERT, so rollback = no number consumed.
--   5. Simpler than application-level distributed locking (no Redis/ZooKeeper).
--
-- Trade-off: under extreme concurrency (>1000 TPS on a single prefix),
-- FOR UPDATE contention could become a bottleneck. For OK Footwear's scale
-- (dozens of orders/day), this is not a concern.
--
-- Called from OrdersService.create() inside a Prisma $transaction.
-- =============================================================================
CREATE OR REPLACE FUNCTION sys.next_doc_number(
  p_prefix VARCHAR(10),
  p_pad_length INT DEFAULT 6,
  p_separator CHAR(1) DEFAULT '-'
)
RETURNS VARCHAR(20)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_next_number INT;
  v_new_last_number INT;
BEGIN
  -- Lock the row for this prefix exclusively.
  -- If no row exists yet, insert one with last_number = 0, then lock it.
  -- SKIP LOCKED is not used here because we WANT to wait — two concurrent
  -- callers for the same prefix must serialise.
  LOOP
    SELECT last_number INTO v_next_number
    FROM sys.document_sequences
    WHERE prefix = p_prefix
    FOR UPDATE;

    IF FOUND THEN
      -- Existing row: increment and update
      v_new_last_number := v_next_number + 1;

      UPDATE sys.document_sequences
      SET last_number = v_new_last_number
      WHERE prefix = p_prefix;

      EXIT;
    ELSE
      -- No row yet: insert with last_number = 0, then retry the loop
      -- (the INSERT is not locked yet, so we must re-acquire the lock)
      BEGIN
        INSERT INTO sys.document_sequences (prefix, last_number, pad_length, separator)
        VALUES (p_prefix, 0, p_pad_length, p_separator);
      EXCEPTION WHEN unique_violation THEN
        -- Another transaction inserted the row between our SELECT and INSERT.
        -- Retry the loop to acquire the lock on the now-existing row.
        CONTINUE;
      END;

      -- Now lock the newly inserted row
      SELECT last_number INTO v_next_number
      FROM sys.document_sequences
      WHERE prefix = p_prefix
      FOR UPDATE;

      v_new_last_number := v_next_number + 1;

      UPDATE sys.document_sequences
      SET last_number = v_new_last_number
      WHERE prefix = p_prefix;

      EXIT;
    END IF;
  END LOOP;

  -- Format: PREFIX-000001
  RETURN p_prefix || p_separator || LPAD(v_new_last_number::TEXT, p_pad_length, '0');
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Comments
-- ---------------------------------------------------------------------------

COMMENT ON TABLE ord.buyers IS
  'Customer/buyer master data. Soft-delete via deleted_at. Payment terms enum: LC_SIGHT, LC_USANCE, TT_ADVANCE, TT_30_DAYS.';

COMMENT ON TABLE ord.articles IS
  'Article/style master data. Soft-delete via deleted_at. Trigram indexes on code and description for fuzzy search.';

COMMENT ON TABLE ord.orders IS
  'Sales order header. State machine: draft → confirmed → in_production → qc → packed → delivered. cancelled reachable from draft or confirmed only. Sample approval gate blocks confirmed → in_production unless sample_approved = true.';

COMMENT ON TABLE ord.order_lines IS
  'Per-size quantity and unit price for each order. Service-layer validation enforces sum(quantity) = orders.total_quantity.';

COMMENT ON TABLE ord.order_milestones IS
  'Six milestone rows auto-generated on order confirmation. planned_date back-calculated from delivery_date using lead-time constants in OrdersService. status set explicitly (pending → done → overdue).';

COMMENT ON FUNCTION sys.next_doc_number(VARCHAR(10), INT, CHAR(1)) IS
  'Concurrency-safe document number generator. Uses SELECT ... FOR UPDATE row-level locking on sys.document_sequences. Called inside the order creation transaction — number is only consumed on commit. Format: PREFIX-000001.';
