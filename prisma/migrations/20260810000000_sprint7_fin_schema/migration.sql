-- =============================================================================
-- Sprint 7 — Finance Core: CoA expand, GL, periods, banks, delivery, AR
-- =============================================================================
-- Design: docs/design/OK_Footwear_ERP_Schema.sql (fin section ~941–1254)
-- Partitioned: fin.gl_entry_lines — raw SQL only (no Prisma model)
-- Trigger: fin.check_period_open blocks closed AND locked periods
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Ensure sys.set_updated_at (design helper; may be missing in early baselines)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION sys.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. ALTER fin.chart_of_accounts
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'fin' AND table_name = 'chart_of_accounts' AND column_name = 'account_name'
  ) THEN
    ALTER TABLE fin.chart_of_accounts RENAME COLUMN account_name TO name;
  END IF;
END $$;

ALTER TABLE fin.chart_of_accounts
  ADD COLUMN IF NOT EXISTS account_class TEXT NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS is_control BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS currency CHAR(3) NOT NULL DEFAULT 'BDT';

DROP TRIGGER IF EXISTS trg_coa_upd ON fin.chart_of_accounts;
CREATE TRIGGER trg_coa_upd BEFORE UPDATE ON fin.chart_of_accounts
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. fin.gl_periods
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS fin.gl_periods (
  id            UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  period_year   SMALLINT NOT NULL,
  period_month  SMALLINT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  status        TEXT     NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','closed','locked')),
  closed_by     UUID     REFERENCES sys.users(id),
  closed_at     TIMESTAMPTZ,
  UNIQUE (period_year, period_month)
);

-- ---------------------------------------------------------------------------
-- 3. fin.gl_entries (headers)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS fin.gl_entries (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_number   TEXT        NOT NULL UNIQUE,
  period_id      UUID        NOT NULL REFERENCES fin.gl_periods(id),
  entry_date     DATE        NOT NULL,
  entry_type     TEXT        NOT NULL DEFAULT 'manual'
                   CHECK (entry_type IN ('manual','system','reversal')),
  source_module  TEXT,
  source_id      UUID,
  narration      TEXT        NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','posted','reversed')),
  reversal_of    UUID        REFERENCES fin.gl_entries(id),
  posted_at      TIMESTAMPTZ,
  posted_by      UUID        REFERENCES sys.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by     UUID        NOT NULL REFERENCES sys.users(id)
);

CREATE INDEX IF NOT EXISTS idx_gl_entries_period ON fin.gl_entries(period_id, status);
CREATE INDEX IF NOT EXISTS idx_gl_entries_source ON fin.gl_entries(source_module, source_id);

-- ---------------------------------------------------------------------------
-- 4. fin.gl_entry_lines — partitioned append-only ledger
-- ---------------------------------------------------------------------------
-- PK includes partition key (entry_date). No Prisma model — use $queryRaw.
-- department_id: UUID only (no FK to hr.departments until HR schema lands).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS fin.gl_entry_lines (
  id            UUID          NOT NULL DEFAULT gen_random_uuid(),
  gl_entry_id   UUID          NOT NULL REFERENCES fin.gl_entries(id),
  account_id    UUID          NOT NULL REFERENCES fin.chart_of_accounts(id),
  debit         NUMERIC(15,4) NOT NULL DEFAULT 0,
  credit        NUMERIC(15,4) NOT NULL DEFAULT 0,
  currency      CHAR(3)       NOT NULL DEFAULT 'BDT',
  fx_rate       NUMERIC(12,6) NOT NULL DEFAULT 1,
  base_debit    NUMERIC(15,4) GENERATED ALWAYS AS (ROUND(debit  * fx_rate, 4)) STORED,
  base_credit   NUMERIC(15,4) GENERATED ALWAYS AS (ROUND(credit * fx_rate, 4)) STORED,
  department_id UUID,
  cost_center   TEXT,
  entry_date    DATE          NOT NULL,
  narration     TEXT,
  PRIMARY KEY (id, entry_date),
  CONSTRAINT chk_gl_debit_credit CHECK (
    (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
  ),
  CONSTRAINT chk_gl_nonzero CHECK (debit + credit > 0)
) PARTITION BY RANGE (entry_date);

CREATE TABLE IF NOT EXISTS fin.gl_entry_lines_2025 PARTITION OF fin.gl_entry_lines
  FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
CREATE TABLE IF NOT EXISTS fin.gl_entry_lines_2026 PARTITION OF fin.gl_entry_lines
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
CREATE TABLE IF NOT EXISTS fin.gl_entry_lines_2027 PARTITION OF fin.gl_entry_lines
  FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');

CREATE INDEX IF NOT EXISTS idx_gl_lines_account ON fin.gl_entry_lines(account_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_gl_lines_entry   ON fin.gl_entry_lines(gl_entry_id);
CREATE INDEX IF NOT EXISTS idx_gl_lines_dept    ON fin.gl_entry_lines(department_id, entry_date DESC);

-- ---------------------------------------------------------------------------
-- 5. Trigger: fin.check_period_open (blocks closed AND locked)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fin.check_period_open()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_status TEXT;
BEGIN
  SELECT p.status INTO v_status
  FROM fin.gl_entries e
  JOIN fin.gl_periods p ON p.id = e.period_id
  WHERE e.id = NEW.gl_entry_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'GL entry % not found for period check', NEW.gl_entry_id;
  END IF;

  IF v_status IN ('closed', 'locked') THEN
    RAISE EXCEPTION 'Cannot post to a % GL period', v_status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gl_period_check ON fin.gl_entry_lines;
CREATE TRIGGER trg_gl_period_check BEFORE INSERT ON fin.gl_entry_lines
  FOR EACH ROW EXECUTE FUNCTION fin.check_period_open();

COMMENT ON FUNCTION fin.check_period_open() IS
  'BEFORE INSERT on gl_entry_lines: reject when parent period status is closed or locked.';

-- ---------------------------------------------------------------------------
-- 6. Bank accounts + transactions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS fin.bank_accounts (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name   TEXT    NOT NULL,
  bank_name      TEXT    NOT NULL,
  branch         TEXT,
  account_number TEXT    NOT NULL,
  account_type   TEXT    NOT NULL CHECK (account_type IN ('current','savings','od','lc')),
  currency       CHAR(3) NOT NULL DEFAULT 'BDT',
  gl_account_id  UUID    NOT NULL REFERENCES fin.chart_of_accounts(id),
  is_payroll     BOOLEAN NOT NULL DEFAULT FALSE,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fin.bank_transactions (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id UUID          NOT NULL REFERENCES fin.bank_accounts(id),
  txn_date        DATE          NOT NULL,
  value_date      DATE,
  txn_type        TEXT          NOT NULL CHECK (txn_type IN ('debit','credit')),
  amount          NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  description     TEXT,
  reference_no    TEXT,
  is_reconciled   BOOLEAN       NOT NULL DEFAULT FALSE,
  gl_entry_id     UUID          REFERENCES fin.gl_entries(id),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_txn_acct ON fin.bank_transactions(bank_account_id, txn_date DESC);

-- ---------------------------------------------------------------------------
-- 7. Delivery challans + lines
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS fin.delivery_challans (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  dc_number       TEXT    NOT NULL UNIQUE,
  order_id        UUID    NOT NULL REFERENCES ord.orders(id),
  export_lc_id    UUID,
  dc_date         DATE    NOT NULL DEFAULT CURRENT_DATE,
  vehicle_no      TEXT,
  carrier         TEXT,
  dispatch_by     UUID    REFERENCES sys.users(id),
  status          TEXT    NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','dispatched','delivered','returned')),
  pod_date        DATE,
  pod_receiver    TEXT,
  pod_notes       TEXT,
  pod_photo_key   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID    NOT NULL REFERENCES sys.users(id)
);

DROP TRIGGER IF EXISTS trg_dc_upd ON fin.delivery_challans;
CREATE TRIGGER trg_dc_upd BEFORE UPDATE ON fin.delivery_challans
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_dc_order ON fin.delivery_challans(order_id);

CREATE TABLE IF NOT EXISTS fin.dc_lines (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  dc_id         UUID          NOT NULL REFERENCES fin.delivery_challans(id) ON DELETE CASCADE,
  order_line_id UUID          NOT NULL REFERENCES ord.order_lines(id),
  quantity      INTEGER       NOT NULL CHECK (quantity > 0),
  unit_price    NUMERIC(12,4) NOT NULL,
  amount        NUMERIC(14,4) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dc_lines_dc ON fin.dc_lines(dc_id);

-- ---------------------------------------------------------------------------
-- 8. Buyer invoices (AR)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS fin.buyer_invoices (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no       TEXT          NOT NULL UNIQUE,
  buyer_id         UUID          NOT NULL REFERENCES ord.buyers(id),
  dc_id            UUID          NOT NULL REFERENCES fin.delivery_challans(id),
  invoice_date     DATE          NOT NULL DEFAULT CURRENT_DATE,
  due_date         DATE          NOT NULL,
  currency         CHAR(3)       NOT NULL DEFAULT 'USD',
  gross_amount     NUMERIC(15,2) NOT NULL,
  collected_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  status           TEXT          NOT NULL DEFAULT 'unpaid'
                     CHECK (status IN ('unpaid','partial','paid','disputed')),
  gl_entry_id      UUID          REFERENCES fin.gl_entries(id),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_by       UUID          NOT NULL REFERENCES sys.users(id)
);

DROP TRIGGER IF EXISTS trg_binv_upd ON fin.buyer_invoices;
CREATE TRIGGER trg_binv_upd BEFORE UPDATE ON fin.buyer_invoices
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_binv_buyer  ON fin.buyer_invoices(buyer_id);
CREATE INDEX IF NOT EXISTS idx_binv_status ON fin.buyer_invoices(status) WHERE status != 'paid';
CREATE INDEX IF NOT EXISTS idx_binv_due    ON fin.buyer_invoices(due_date) WHERE status != 'paid';

-- ---------------------------------------------------------------------------
-- 9. Document sequences
-- ---------------------------------------------------------------------------

INSERT INTO sys.document_sequences (prefix, last_number, pad_length, separator)
VALUES ('JV', 0, 6, '-'), ('DC', 0, 6, '-'), ('BINV', 0, 6, '-')
ON CONFLICT (prefix) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 10. Seed system CoA accounts (stable UUIDs for payroll / AR posting)
-- ---------------------------------------------------------------------------
-- 1200 Trade Receivables (ASSET)
-- 2100 Net Salary Payable (LIABILITY)
-- 4100 Sales Revenue (REVENUE)
-- 5100 Salary Expense (EXPENSE)

INSERT INTO fin.chart_of_accounts (
  id, account_code, name, account_type, account_class, is_control, currency, is_active,
  created_at, updated_at
) VALUES
  ('a1200000-0000-4000-8000-000000001200', '1200', 'Trade Receivables',
   'ASSET', 'current_asset', TRUE, 'BDT', TRUE, NOW(), NOW()),
  ('a2100000-0000-4000-8000-000000002100', '2100', 'Net Salary Payable',
   'LIABILITY', 'current_liability', FALSE, 'BDT', TRUE, NOW(), NOW()),
  ('a4100000-0000-4000-8000-000000004100', '4100', 'Sales Revenue',
   'REVENUE', 'operating_revenue', FALSE, 'BDT', TRUE, NOW(), NOW()),
  ('a5100000-0000-4000-8000-000000005100', '5100', 'Salary Expense',
   'EXPENSE', 'operating_expense', FALSE, 'BDT', TRUE, NOW(), NOW())
ON CONFLICT (account_code) DO NOTHING;
