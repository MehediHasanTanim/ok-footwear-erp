-- Sprint 10–11: production orders, daily productions (partitioned), QC, machines, scrap.
-- Also factory_lines, operations, article_routings (FK dependencies from design).

-- ---------------------------------------------------------------------------
-- 1. Factory lines
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS mfg.factory_lines (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT    NOT NULL UNIQUE,
  name         TEXT    NOT NULL,
  floor        TEXT,
  capacity_prs INTEGER NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE
);

-- ---------------------------------------------------------------------------
-- 2. Operations master
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS mfg.operations (
  id       UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  code     TEXT    NOT NULL UNIQUE,
  name     TEXT    NOT NULL,
  section  TEXT    NOT NULL CHECK (section IN
             ('cutting','stitching','lasting','sole_attaching','finishing','qc','packing')),
  sam      NUMERIC(6,2),
  sequence SMALLINT NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- 3. Article routing
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS mfg.article_routings (
  id           UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id   UUID     NOT NULL REFERENCES ord.articles(id),
  operation_id UUID     NOT NULL REFERENCES mfg.operations(id),
  sequence     SMALLINT NOT NULL,
  sam_override NUMERIC(6,2),
  UNIQUE (article_id, sequence)
);

-- ---------------------------------------------------------------------------
-- 4. Production orders (+ size_plan JSONB)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS mfg.production_orders (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID    NOT NULL REFERENCES ord.orders(id),
  factory_line_id  UUID    REFERENCES mfg.factory_lines(id),
  bom_id           UUID    NOT NULL REFERENCES mfg.bom_headers(id),
  planned_qty      INTEGER NOT NULL CHECK (planned_qty > 0),
  produced_qty     INTEGER NOT NULL DEFAULT 0,
  size_plan        JSONB   NOT NULL DEFAULT '[]',
  start_date       DATE,
  end_date         DATE,
  status           TEXT    NOT NULL DEFAULT 'planned'
                     CHECK (status IN ('planned','in_progress','completed','on_hold')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by       UUID    NOT NULL REFERENCES sys.users(id)
);

CREATE TRIGGER trg_prod_ord_upd BEFORE UPDATE ON mfg.production_orders
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_prod_orders_order ON mfg.production_orders(order_id);

-- ---------------------------------------------------------------------------
-- 5. Daily productions (yearly partition)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS mfg.daily_productions (
  id                  UUID    NOT NULL DEFAULT gen_random_uuid(),
  production_order_id UUID    NOT NULL REFERENCES mfg.production_orders(id),
  prod_date           DATE    NOT NULL,
  factory_line_id     UUID    NOT NULL REFERENCES mfg.factory_lines(id),
  operation_id        UUID    NOT NULL REFERENCES mfg.operations(id),
  shift               TEXT    NOT NULL DEFAULT 'day' CHECK (shift IN ('day','night')),
  target_qty          INTEGER NOT NULL DEFAULT 0,
  produced_qty        INTEGER NOT NULL DEFAULT 0,
  rejected_qty        INTEGER NOT NULL DEFAULT 0,
  efficiency_pct      NUMERIC(5,2) GENERATED ALWAYS AS
                        (CASE WHEN target_qty > 0
                          THEN ROUND((produced_qty::NUMERIC / target_qty) * 100, 2)
                         END) STORED,
  supervisor_id       UUID    REFERENCES sys.users(id),
  locked              BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, prod_date),
  UNIQUE (production_order_id, prod_date, operation_id, shift)
) PARTITION BY RANGE (prod_date);

CREATE TABLE IF NOT EXISTS mfg.daily_productions_2025 PARTITION OF mfg.daily_productions
  FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

CREATE TABLE IF NOT EXISTS mfg.daily_productions_2026 PARTITION OF mfg.daily_productions
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

CREATE TABLE IF NOT EXISTS mfg.daily_productions_2027 PARTITION OF mfg.daily_productions
  FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');

CREATE INDEX IF NOT EXISTS idx_daily_prod_order ON mfg.daily_productions(production_order_id, prod_date DESC);

-- ---------------------------------------------------------------------------
-- 6. QC results
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS mfg.qc_results (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id UUID    NOT NULL REFERENCES mfg.production_orders(id),
  qc_date             DATE    NOT NULL DEFAULT CURRENT_DATE,
  qc_type             TEXT    NOT NULL CHECK (qc_type IN ('inline','final')),
  operation_id        UUID    REFERENCES mfg.operations(id),
  inspected_qty       INTEGER NOT NULL,
  passed_qty          INTEGER NOT NULL,
  failed_qty          INTEGER NOT NULL,
  rework_qty          INTEGER NOT NULL DEFAULT 0,
  verdict             TEXT    NOT NULL CHECK (verdict IN ('pass','fail','rework','conditional_pass')),
  defect_details      JSONB,
  inspector_id        UUID    REFERENCES sys.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_qc_qty CHECK (passed_qty + failed_qty + rework_qty = inspected_qty)
);

CREATE INDEX IF NOT EXISTS idx_qc_prod_order ON mfg.qc_results(production_order_id);

-- ---------------------------------------------------------------------------
-- 7. Machines + maintenance
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS mfg.machines (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_code    TEXT    NOT NULL UNIQUE,
  name            TEXT    NOT NULL,
  type            TEXT    NOT NULL,
  model           TEXT,
  manufacturer    TEXT,
  factory_line_id UUID    REFERENCES mfg.factory_lines(id),
  purchase_date   DATE,
  status          TEXT    NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','under_maintenance','breakdown','retired')),
  asset_id        UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_machine_upd BEFORE UPDATE ON mfg.machines
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();

CREATE TABLE IF NOT EXISTS mfg.machine_maintenance (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id   UUID    NOT NULL REFERENCES mfg.machines(id),
  maint_type   TEXT    NOT NULL CHECK (maint_type IN ('preventive','breakdown','repair')),
  start_time   TIMESTAMPTZ NOT NULL,
  end_time     TIMESTAMPTZ,
  downtime_hrs NUMERIC(6,2) GENERATED ALWAYS AS
                 (CASE WHEN end_time IS NOT NULL
                   THEN ROUND(EXTRACT(EPOCH FROM (end_time - start_time))/3600.0, 2)
                  END) STORED,
  description  TEXT,
  cost         NUMERIC(10,2),
  performed_by TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_maint_machine ON mfg.machine_maintenance(machine_id, start_time DESC);

-- ---------------------------------------------------------------------------
-- 8. Scrap records
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS mfg.scrap_records (
  id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id    UUID          NOT NULL REFERENCES mfg.production_orders(id),
  scrap_date             DATE          NOT NULL DEFAULT CURRENT_DATE,
  scrap_type             TEXT          NOT NULL CHECK (scrap_type IN
                           ('upper_offcut','rejected_sole','damaged_insole',
                            'adhesive_waste','packing_waste','other')),
  section                TEXT          NOT NULL,
  quantity               NUMERIC(10,3) NOT NULL CHECK (quantity > 0),
  uom                    TEXT          NOT NULL,
  unit_value             NUMERIC(10,4),
  disposal_method        TEXT          CHECK (disposal_method IN ('sale','recycle','landfill')),
  disposal_authorised_by UUID          REFERENCES sys.users(id),
  sale_amount            NUMERIC(10,2),
  notes                  TEXT,
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_by             UUID          NOT NULL REFERENCES sys.users(id)
);

CREATE INDEX IF NOT EXISTS idx_scrap_prod_order ON mfg.scrap_records(production_order_id);

-- ---------------------------------------------------------------------------
-- 9. Seed master data (idempotent)
-- ---------------------------------------------------------------------------

INSERT INTO mfg.factory_lines (code, name, floor, capacity_prs)
VALUES
  ('LINE-A', 'Assembly Line A', 'Floor 1', 500),
  ('LINE-B', 'Assembly Line B', 'Floor 1', 400),
  ('LINE-C', 'Finishing Line C', 'Floor 2', 300)
ON CONFLICT (code) DO NOTHING;

INSERT INTO mfg.operations (code, name, section, sam, sequence)
VALUES
  ('CUT',  'Cutting',         'cutting',         2.50, 10),
  ('STI',  'Stitching',       'stitching',       8.00, 20),
  ('LAS',  'Lasting',         'lasting',         4.00, 30),
  ('SOL',  'Sole Attaching',  'sole_attaching',  3.50, 40),
  ('FIN',  'Finishing',       'finishing',       2.00, 50),
  ('QC',   'Quality Check',   'qc',              1.50, 60),
  ('PCK',  'Packing',         'packing',         1.00, 70)
ON CONFLICT (code) DO NOTHING;
