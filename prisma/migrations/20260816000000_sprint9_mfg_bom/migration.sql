-- Sprint 9: replace stub mfg.bom_headers; BOM lines, size overrides, cost sheets.
-- Also UNIQUE (order_id, size_label) on ord.order_lines (TC-DB-CON-004).

-- ---------------------------------------------------------------------------
-- 1. Recreate BOM headers from design (drop unused stub)
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS mfg.bom_headers CASCADE;

CREATE TABLE mfg.bom_headers (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id  UUID    NOT NULL REFERENCES ord.articles(id),
  version     TEXT    NOT NULL DEFAULT '1.0',
  status      TEXT    NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','approved','superseded')),
  approved_by UUID    REFERENCES sys.users(id),
  approved_at TIMESTAMPTZ,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID    NOT NULL REFERENCES sys.users(id),
  UNIQUE (article_id, version)
);

CREATE TRIGGER trg_bom_upd BEFORE UPDATE ON mfg.bom_headers
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();

CREATE INDEX idx_bom_article ON mfg.bom_headers(article_id);

CREATE UNIQUE INDEX idx_bom_one_approved
  ON mfg.bom_headers(article_id)
  WHERE status = 'approved';

-- ---------------------------------------------------------------------------
-- 2. BOM lines
-- ---------------------------------------------------------------------------

CREATE TABLE mfg.bom_lines (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_id            UUID          NOT NULL REFERENCES mfg.bom_headers(id) ON DELETE CASCADE,
  item_id           UUID          NOT NULL REFERENCES inv.stock_items(id),
  component_type    TEXT          NOT NULL CHECK (component_type IN
                      ('upper_material','lining','sole','insole','thread',
                       'adhesive','tag','label','sticker','box','polybag','accessory')),
  quantity_per_pair NUMERIC(10,4) NOT NULL CHECK (quantity_per_pair > 0),
  uom               TEXT          NOT NULL,
  size_specific     BOOLEAN       NOT NULL DEFAULT FALSE,
  size_label        TEXT,
  wastage_pct       NUMERIC(5,2)  NOT NULL DEFAULT 0 CHECK (wastage_pct >= 0),
  notes             TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bom_lines_bom  ON mfg.bom_lines(bom_id);
CREATE INDEX idx_bom_lines_item ON mfg.bom_lines(item_id);

-- ---------------------------------------------------------------------------
-- 3. Size quantity overrides
-- ---------------------------------------------------------------------------

CREATE TABLE mfg.bom_size_overrides (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_id       UUID          NOT NULL REFERENCES mfg.bom_headers(id) ON DELETE CASCADE,
  item_id      UUID          NOT NULL REFERENCES inv.stock_items(id),
  size_label   TEXT          NOT NULL,
  qty_per_unit NUMERIC(10,4) NOT NULL CHECK (qty_per_unit > 0),
  UNIQUE (bom_id, item_id, size_label)
);

CREATE INDEX idx_bom_size_overrides_bom ON mfg.bom_size_overrides(bom_id);

-- ---------------------------------------------------------------------------
-- 4. Cost sheets
-- ---------------------------------------------------------------------------

CREATE TABLE mfg.cost_sheets (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID          REFERENCES ord.orders(id),
  bom_id           UUID          NOT NULL REFERENCES mfg.bom_headers(id),
  status           TEXT          NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','approved','finalised')),
  material_cost    NUMERIC(12,4) NOT NULL DEFAULT 0,
  trims_cost       NUMERIC(12,4) NOT NULL DEFAULT 0,
  labour_cost      NUMERIC(12,4) NOT NULL DEFAULT 0,
  overhead_cost    NUMERIC(12,4) NOT NULL DEFAULT 0,
  total_cost       NUMERIC(12,4) NOT NULL DEFAULT 0,
  margin_pct       NUMERIC(5,2)  NOT NULL DEFAULT 0,
  selling_price    NUMERIC(12,4) NOT NULL DEFAULT 0,
  actual_cost      NUMERIC(12,4),
  variance         NUMERIC(12,4) GENERATED ALWAYS AS
                     (CASE WHEN actual_cost IS NOT NULL THEN actual_cost - total_cost END) STORED,
  approved_by      UUID          REFERENCES sys.users(id),
  approved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_by       UUID          NOT NULL REFERENCES sys.users(id)
);

CREATE TRIGGER trg_cost_upd BEFORE UPDATE ON mfg.cost_sheets
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();

CREATE INDEX idx_cost_sheets_bom ON mfg.cost_sheets(bom_id);

CREATE UNIQUE INDEX idx_cost_sheet_template_bom
  ON mfg.cost_sheets(bom_id)
  WHERE order_id IS NULL;

-- ---------------------------------------------------------------------------
-- 5. Order line unique size (TC-DB-CON-004)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uk_order_lines_order_size'
      AND conrelid = 'ord.order_lines'::regclass
  ) THEN
    ALTER TABLE ord.order_lines
      ADD CONSTRAINT uk_order_lines_order_size UNIQUE (order_id, size_label);
  END IF;
END $$;
