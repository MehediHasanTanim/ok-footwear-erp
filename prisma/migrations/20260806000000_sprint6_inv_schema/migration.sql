-- =============================================================================
-- Sprint 6 — Inventory schema: ALTER baseline inv tables + ledger + counts + MV
-- =============================================================================
-- Design: docs/design/OK_Footwear_ERP_Schema.sql (inv section)
-- Partition UNIQUE: (txn_number, txn_date) — PG requires partition key in unique keys
-- Balances: NEVER app-written; maintained by inv.update_stock_balance trigger
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. ALTER inv.warehouses — add type
-- ---------------------------------------------------------------------------

ALTER TABLE inv.warehouses
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'general';

DO $$ BEGIN
  ALTER TABLE inv.warehouses
    ADD CONSTRAINT chk_warehouses_type
    CHECK (type IN ('raw_material','accessories','finished_goods','packing','general'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2. ALTER inv.stock_items — rename UoM, add design fields
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'inv' AND table_name = 'stock_items' AND column_name = 'unit_of_measure'
  ) THEN
    ALTER TABLE inv.stock_items RENAME COLUMN unit_of_measure TO uom;
  END IF;
END $$;

ALTER TABLE inv.stock_items
  ADD COLUMN IF NOT EXISTS sub_category TEXT,
  ADD COLUMN IF NOT EXISTS min_stock NUMERIC(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_stock NUMERIC(12,3),
  ADD COLUMN IF NOT EXISTS lead_time_days SMALLINT NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS hsn_code TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES sys.users(id);

-- Backfill / remap legacy categories before tightening the CHECK
UPDATE inv.stock_items SET category = 'packing' WHERE category IN ('packaging', 'consumable');
UPDATE inv.stock_items SET category = 'finished_goods' WHERE category IN ('finished_good', 'finished goods');
UPDATE inv.stock_items
SET category = 'raw_material'
WHERE category IS NULL
   OR category = ''
   OR category NOT IN ('raw_material','sole','accessory','packing','finished_goods');

UPDATE inv.stock_items SET reorder_level = 0 WHERE reorder_level IS NULL;

ALTER TABLE inv.stock_items
  ALTER COLUMN category SET NOT NULL,
  ALTER COLUMN reorder_level SET DATA TYPE NUMERIC(12,3),
  ALTER COLUMN reorder_level SET DEFAULT 0,
  ALTER COLUMN reorder_level SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE inv.stock_items
    ADD CONSTRAINT chk_stock_items_category
    CHECK (category IN ('raw_material','sole','accessory','packing','finished_goods'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_items_name_trgm
  ON inv.stock_items USING GIN (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 3. inv.stock_balances (before trigger; FK targets)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS inv.stock_balances (
  item_id      UUID          NOT NULL REFERENCES inv.stock_items(id),
  warehouse_id UUID          NOT NULL REFERENCES inv.warehouses(id),
  quantity     NUMERIC(12,3) NOT NULL DEFAULT 0,
  avg_cost     NUMERIC(12,4) NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (item_id, warehouse_id),
  CONSTRAINT chk_balance_non_negative CHECK (quantity >= 0)
);

COMMENT ON TABLE inv.stock_balances IS
  'Running balance maintained ONLY by trigger inv.update_stock_balance. Never insert/update from app code.';

-- ---------------------------------------------------------------------------
-- 4. inv.stock_transactions — partitioned append-only ledger
-- ---------------------------------------------------------------------------
-- Inbound (direction = 1): weighted avg cost
--   avg_cost = ROUND((old_qty * old_avg + NEW.quantity * NEW.unit_cost)
--                    / NULLIF(old_qty + NEW.quantity, 0), 4)
-- Outbound (direction = -1): avg_cost unchanged
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS inv.stock_transactions (
  id             UUID          NOT NULL DEFAULT gen_random_uuid(),
  txn_date       DATE          NOT NULL,
  txn_number     TEXT          NOT NULL,
  txn_type       TEXT          NOT NULL CHECK (txn_type IN
                   ('grn','production_issue','production_return','delivery',
                    'return_from_buyer','transfer_in','transfer_out',
                    'adjustment_in','adjustment_out','opening_stock','write_off',
                    'outsource_issue','outsource_return')),
  item_id        UUID          NOT NULL REFERENCES inv.stock_items(id),
  warehouse_id   UUID          NOT NULL REFERENCES inv.warehouses(id),
  quantity       NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  direction      SMALLINT      NOT NULL CHECK (direction IN (1, -1)),
  unit_cost      NUMERIC(12,4),
  batch_lot      TEXT,
  source_module  TEXT,
  source_id      UUID,
  remarks        TEXT,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_by     UUID          NOT NULL REFERENCES sys.users(id),
  PRIMARY KEY (id, txn_date),
  UNIQUE (txn_number, txn_date)
) PARTITION BY RANGE (txn_date);

CREATE TABLE IF NOT EXISTS inv.stock_transactions_2025
  PARTITION OF inv.stock_transactions
  FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

CREATE TABLE IF NOT EXISTS inv.stock_transactions_2026
  PARTITION OF inv.stock_transactions
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

CREATE TABLE IF NOT EXISTS inv.stock_transactions_2027
  PARTITION OF inv.stock_transactions
  FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');

CREATE INDEX IF NOT EXISTS idx_stxn_item
  ON inv.stock_transactions (item_id, txn_date DESC);
CREATE INDEX IF NOT EXISTS idx_stxn_wh
  ON inv.stock_transactions (warehouse_id, item_id);
CREATE INDEX IF NOT EXISTS idx_stxn_src
  ON inv.stock_transactions (source_module, source_id);

COMMENT ON TABLE inv.stock_transactions IS
  'Append-only stock ledger. Partitioned yearly by txn_date. Prisma cannot model partitions — use $queryRaw.';

-- ---------------------------------------------------------------------------
-- 5. Trigger: inv.update_stock_balance
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION inv.update_stock_balance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO inv.stock_balances (item_id, warehouse_id, quantity, avg_cost)
  VALUES (
    NEW.item_id,
    NEW.warehouse_id,
    NEW.quantity * NEW.direction,
    COALESCE(NEW.unit_cost, 0)
  )
  ON CONFLICT (item_id, warehouse_id) DO UPDATE SET
    quantity = inv.stock_balances.quantity + (NEW.quantity * NEW.direction),
    avg_cost = CASE
      WHEN NEW.direction = 1 AND NEW.unit_cost IS NOT NULL THEN
        ROUND(
          (inv.stock_balances.quantity * inv.stock_balances.avg_cost
           + NEW.quantity * NEW.unit_cost)
          / NULLIF(inv.stock_balances.quantity + NEW.quantity, 0),
          4
        )
      ELSE inv.stock_balances.avg_cost
    END,
    last_updated = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_balance ON inv.stock_transactions;
CREATE TRIGGER trg_stock_balance
  AFTER INSERT ON inv.stock_transactions
  FOR EACH ROW EXECUTE FUNCTION inv.update_stock_balance();

-- ---------------------------------------------------------------------------
-- 6. Stock counts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS inv.stock_counts (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  count_number  TEXT        NOT NULL UNIQUE,
  count_date    DATE        NOT NULL DEFAULT CURRENT_DATE,
  warehouse_id  UUID        NOT NULL REFERENCES inv.warehouses(id),
  status        TEXT        NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','counting','variance_review','approved','cancelled')),
  approved_by   UUID        REFERENCES sys.users(id),
  approved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    UUID        NOT NULL REFERENCES sys.users(id)
);

CREATE TABLE IF NOT EXISTS inv.stock_count_lines (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id        UUID          NOT NULL REFERENCES inv.stock_counts(id) ON DELETE CASCADE,
  item_id         UUID          NOT NULL REFERENCES inv.stock_items(id),
  system_qty      NUMERIC(12,3) NOT NULL,
  physical_qty    NUMERIC(12,3),
  variance        NUMERIC(12,3) GENERATED ALWAYS AS (
                    CASE WHEN physical_qty IS NOT NULL THEN physical_qty - system_qty END
                  ) STORED,
  variance_reason TEXT,
  UNIQUE (count_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_counts_wh ON inv.stock_counts (warehouse_id, status);
CREATE INDEX IF NOT EXISTS idx_stock_count_lines_count ON inv.stock_count_lines (count_id);

-- ---------------------------------------------------------------------------
-- 7. Materialized view: inv.stock_summary
-- ---------------------------------------------------------------------------

DROP MATERIALIZED VIEW IF EXISTS inv.stock_summary;

CREATE MATERIALIZED VIEW inv.stock_summary AS
SELECT
  i.id            AS item_id,
  i.item_code,
  i.name,
  i.category,
  i.uom,
  i.reorder_level,
  COALESCE(SUM(b.quantity), 0)              AS total_qty,
  COALESCE(SUM(b.quantity * b.avg_cost), 0) AS total_value,
  COALESCE(SUM(b.avg_cost) / NULLIF(COUNT(b.*), 0), 0) AS avg_unit_cost,
  CASE WHEN COALESCE(SUM(b.quantity), 0) <= i.reorder_level
       THEN TRUE ELSE FALSE END             AS below_reorder
FROM inv.stock_items i
LEFT JOIN inv.stock_balances b ON b.item_id = i.id
WHERE i.is_active = TRUE
GROUP BY i.id, i.item_code, i.name, i.category, i.uom, i.reorder_level;

CREATE UNIQUE INDEX idx_mv_stock ON inv.stock_summary (item_id);

-- ---------------------------------------------------------------------------
-- 8. Cross-schema FK: prc.po_lines.item_id → inv.stock_items
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  ALTER TABLE prc.po_lines
    ADD CONSTRAINT fk_po_item
    FOREIGN KEY (item_id) REFERENCES inv.stock_items(id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 9. Document sequences
-- ---------------------------------------------------------------------------

INSERT INTO sys.document_sequences (prefix, last_number, pad_length, separator)
VALUES ('STXN', 0, 6, '-'), ('STC', 0, 6, '-')
ON CONFLICT (prefix) DO NOTHING;
