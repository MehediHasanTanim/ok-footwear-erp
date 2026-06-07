-- ================================================================
--  OK FOOTWEAR ERP — COMPLETE POSTGRESQL SCHEMA
--  Version : 1.0  |  May 2025
--  Standard: PostgreSQL 16+
--  ORM     : Prisma 5+ (multi-schema preview enabled)
-- ================================================================
--  Module schemas
--    sys  — users, roles, audit, compliance, notifications
--    ord  — orders, buyers, articles, quotations, complaints
--    prc  — vendors, purchase orders, GRN, tender
--    mfg  — BOM, production, QC, machines, lasts & moulds, scrap
--    inv  — inventory, stock transactions, warehouses
--    fin  — GL, AP, AR, fixed assets, budgets, bank
--    hr   — employees, payroll, leave, PF, gratuity
--    brd  — directors, shareholders, board meetings, AGM
-- ================================================================

-- ──────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";     -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";      -- GIN trigram search
CREATE EXTENSION IF NOT EXISTS "btree_gin";    -- GIN on scalar types
CREATE EXTENSION IF NOT EXISTS "unaccent";     -- accent-insensitive search

-- ──────────────────────────────────────────────────────────────
-- SCHEMAS
-- ──────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS sys;
CREATE SCHEMA IF NOT EXISTS ord;
CREATE SCHEMA IF NOT EXISTS prc;
CREATE SCHEMA IF NOT EXISTS mfg;
CREATE SCHEMA IF NOT EXISTS inv;
CREATE SCHEMA IF NOT EXISTS fin;
CREATE SCHEMA IF NOT EXISTS hr;
CREATE SCHEMA IF NOT EXISTS brd;

-- ──────────────────────────────────────────────────────────────
-- UTILITY FUNCTION: auto-update updated_at
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION sys.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

-- ──────────────────────────────────────────────────────────────
-- UTILITY FUNCTION: document sequence (ORD-000001, PO-000001 …)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE sys.document_sequences (
  sequence_name TEXT     PRIMARY KEY,
  prefix        TEXT     NOT NULL,
  current_value BIGINT   NOT NULL DEFAULT 0,
  pad_length    SMALLINT NOT NULL DEFAULT 6
);

CREATE OR REPLACE FUNCTION sys.next_doc_number(p_seq TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v RECORD;
BEGIN
  UPDATE sys.document_sequences
  SET current_value = current_value + 1
  WHERE sequence_name = p_seq
  RETURNING * INTO v;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sequence % not found', p_seq; END IF;
  RETURN v.prefix || LPAD(v.current_value::TEXT, v.pad_length, '0');
END;
$$;

-- Seed sequences
INSERT INTO sys.document_sequences VALUES
  ('order',       'ORD-', 0, 6),
  ('quotation',   'QUO-', 0, 6),
  ('po',          'PO-',  0, 6),
  ('grn',         'GRN-', 0, 6),
  ('work_order',  'WO-',  0, 6),
  ('gl_entry',    'JV-',  0, 7),
  ('delivery',    'DC-',  0, 6),
  ('asset',       'AST-', 0, 5),
  ('resolution',  'RES-', 0, 5);

-- ================================================================
-- SCHEMA: sys
-- ================================================================

-- ── sys.roles ────────────────────────────────────────────────
CREATE TABLE sys.roles (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT    NOT NULL UNIQUE,
  description TEXT,
  is_system   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── sys.permissions ──────────────────────────────────────────
CREATE TABLE sys.permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module      TEXT NOT NULL,
  action      TEXT NOT NULL,   -- 'read','create','update','delete','approve'
  description TEXT,
  UNIQUE (module, action)
);

-- ── sys.role_permissions ─────────────────────────────────────
CREATE TABLE sys.role_permissions (
  role_id       UUID NOT NULL REFERENCES sys.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES sys.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- ── sys.users ────────────────────────────────────────────────
CREATE TABLE sys.users (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT        NOT NULL UNIQUE,
  full_name       TEXT        NOT NULL,
  password_hash   TEXT        NOT NULL,          -- argon2id hash
  status          TEXT        NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active','inactive','locked')),
  failed_attempts SMALLINT    NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  last_login_at   TIMESTAMPTZ,
  totp_secret     BYTEA,                         -- AES-256 encrypted TOTP secret
  totp_enabled    BOOLEAN     NOT NULL DEFAULT FALSE,
  -- linked to an employee (optional for non-employee admin accounts)
  employee_id     UUID,                          -- FK added after hr.employees created
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);
CREATE UNIQUE INDEX idx_users_email ON sys.users(LOWER(email)) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON sys.users
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();

-- ── sys.user_roles ────────────────────────────────────────────
CREATE TABLE sys.user_roles (
  user_id    UUID NOT NULL REFERENCES sys.users(id) ON DELETE CASCADE,
  role_id    UUID NOT NULL REFERENCES sys.roles(id) ON DELETE CASCADE,
  granted_by UUID NOT NULL REFERENCES sys.users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role_id)
);

-- ── sys.audit_logs (append-only, partitioned by month) ───────
CREATE TABLE sys.audit_logs (
  id          UUID        NOT NULL DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id     UUID        NOT NULL REFERENCES sys.users(id),
  action      TEXT        NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE','LOGIN','EXPORT')),
  schema_name TEXT        NOT NULL,
  table_name  TEXT        NOT NULL,
  record_id   UUID        NOT NULL,
  old_value   JSONB,
  new_value   JSONB,
  ip_address  INET,
  session_id  TEXT
) PARTITION BY RANGE (created_at);

CREATE TABLE sys.audit_logs_2025 PARTITION OF sys.audit_logs
  FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
CREATE TABLE sys.audit_logs_2026 PARTITION OF sys.audit_logs
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
CREATE TABLE sys.audit_logs_2027 PARTITION OF sys.audit_logs
  FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');

CREATE INDEX idx_audit_table ON sys.audit_logs(schema_name, table_name, record_id, created_at DESC);
CREATE INDEX idx_audit_user  ON sys.audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_new_gin ON sys.audit_logs USING GIN (new_value);

-- ── sys.compliance_items ─────────────────────────────────────
CREATE TABLE sys.compliance_items (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT    NOT NULL,
  category         TEXT    NOT NULL,   -- 'license','certificate','membership','audit'
  issuing_authority TEXT,
  reference_number TEXT,
  issue_date       DATE,
  expiry_date      DATE    NOT NULL,
  alert_days       SMALLINT NOT NULL DEFAULT 30,
  status           TEXT    NOT NULL DEFAULT 'valid'
                     CHECK (status IN ('valid','expiring_soon','expired','renewed')),
  document_url     TEXT,
  responsible_user UUID    REFERENCES sys.users(id),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_compliance_updated_at BEFORE UPDATE ON sys.compliance_items
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();

-- ── sys.notifications ────────────────────────────────────────
CREATE TABLE sys.notifications (
  id          UUID        NOT NULL DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id     UUID        NOT NULL REFERENCES sys.users(id),
  type        TEXT        NOT NULL,   -- 'approval_request','alert','info'
  title       TEXT        NOT NULL,
  body        TEXT,
  link        TEXT,
  is_read     BOOLEAN     NOT NULL DEFAULT FALSE,
  channel     TEXT        NOT NULL CHECK (channel IN ('in_app','email','sms','push')),
  sent_at     TIMESTAMPTZ,
  source_module TEXT,
  source_id   UUID
) PARTITION BY RANGE (created_at);

CREATE TABLE sys.notifications_2025 PARTITION OF sys.notifications
  FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
CREATE TABLE sys.notifications_2026 PARTITION OF sys.notifications
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

CREATE INDEX idx_notif_user ON sys.notifications(user_id, is_read, created_at DESC);

-- ================================================================
-- SCHEMA: ord  (orders, buyers, articles)
-- ================================================================

CREATE TABLE ord.buyers (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_code     TEXT        NOT NULL UNIQUE,
  name           TEXT        NOT NULL,
  contact_name   TEXT,
  email          TEXT,
  phone          TEXT,
  address        TEXT,
  country        TEXT        NOT NULL DEFAULT 'Bangladesh',
  payment_terms  SMALLINT    NOT NULL DEFAULT 30,
  credit_limit   NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency       CHAR(3)     NOT NULL DEFAULT 'USD',
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by     UUID        NOT NULL REFERENCES sys.users(id)
);
CREATE TRIGGER trg_buyers_upd BEFORE UPDATE ON ord.buyers
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();
CREATE INDEX idx_buyers_name_trgm ON ord.buyers USING GIN (name gin_trgm_ops);

CREATE TABLE ord.articles (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  article_code   TEXT    NOT NULL UNIQUE,
  description    TEXT    NOT NULL,
  category       TEXT    NOT NULL,   -- 'men','women','kids','safety','sports'
  sub_category   TEXT,
  gender         TEXT,
  season         TEXT,
  size_system    TEXT    NOT NULL DEFAULT 'EU',  -- 'EU','UK','US'
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by     UUID    NOT NULL REFERENCES sys.users(id)
);
CREATE TRIGGER trg_articles_upd BEFORE UPDATE ON ord.articles
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();

CREATE TABLE ord.orders (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number   TEXT        NOT NULL UNIQUE DEFAULT sys.next_doc_number('order'),
  buyer_id       UUID        NOT NULL REFERENCES ord.buyers(id),
  article_id     UUID        NOT NULL REFERENCES ord.articles(id),
  order_type     TEXT        NOT NULL CHECK (order_type IN ('bulk','sample','repeat','trial')),
  season         TEXT,
  status         TEXT        NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','confirmed','in_production','qc','packed','delivered','cancelled')),
  currency       CHAR(3)     NOT NULL DEFAULT 'USD',
  unit_price     NUMERIC(12,4) NOT NULL CHECK (unit_price >= 0),
  total_quantity INTEGER     NOT NULL CHECK (total_quantity > 0),
  delivery_date  DATE        NOT NULL,
  pi_number      TEXT        UNIQUE,   -- Proforma Invoice
  lc_number      TEXT,                 -- Letter of Credit reference
  sample_approved BOOLEAN    NOT NULL DEFAULT FALSE,
  remarks        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by     UUID        NOT NULL REFERENCES sys.users(id)
);
CREATE TRIGGER trg_orders_upd BEFORE UPDATE ON ord.orders
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();
CREATE INDEX idx_orders_buyer     ON ord.orders(buyer_id);
CREATE INDEX idx_orders_article   ON ord.orders(article_id);
CREATE INDEX idx_orders_status    ON ord.orders(status) WHERE status NOT IN ('delivered','cancelled');
CREATE INDEX idx_orders_delivery  ON ord.orders(delivery_date) WHERE status NOT IN ('delivered','cancelled');

-- Size breakdown per order
CREATE TABLE ord.order_lines (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID    NOT NULL REFERENCES ord.orders(id) ON DELETE CASCADE,
  size_label   TEXT    NOT NULL,
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  unit_price   NUMERIC(12,4),  -- NULL inherits from order
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, size_label)
);
CREATE INDEX idx_order_lines_order ON ord.order_lines(order_id);

-- Auto-generated milestone schedule
CREATE TABLE ord.order_milestones (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID    NOT NULL REFERENCES ord.orders(id) ON DELETE CASCADE,
  milestone_type TEXT    NOT NULL CHECK (milestone_type IN
                   ('material_booking','production_start','inline_qc',
                    'final_qc','packing','shipment')),
  planned_date   DATE    NOT NULL,
  actual_date    DATE,
  status         TEXT    NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','in_progress','completed','overdue')),
  UNIQUE (order_id, milestone_type)
);

-- Sample tracking
CREATE TABLE ord.samples (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID    NOT NULL REFERENCES ord.orders(id) ON DELETE CASCADE,
  round         SMALLINT NOT NULL DEFAULT 1,
  sample_type   TEXT    NOT NULL CHECK (sample_type IN ('pp_sample','counter_sample','size_set','top_of_production')),
  dispatch_date DATE,
  courier       TEXT,
  tracking_no   TEXT,
  status        TEXT    NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','dispatched','received','approved','rejected')),
  buyer_comment TEXT,
  approved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_samples_order ON ord.samples(order_id);

-- Quotations
CREATE TABLE ord.quotations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_number TEXT       NOT NULL UNIQUE DEFAULT sys.next_doc_number('quotation'),
  buyer_id        UUID        NOT NULL REFERENCES ord.buyers(id),
  article_id      UUID        NOT NULL REFERENCES ord.articles(id),
  version         SMALLINT    NOT NULL DEFAULT 1,
  currency        CHAR(3)     NOT NULL DEFAULT 'USD',
  total_cost      NUMERIC(12,4),
  margin_pct      NUMERIC(5,2),
  quoted_price    NUMERIC(12,4) NOT NULL,
  valid_until     DATE        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','sent','won','lost','expired')),
  outcome_reason  TEXT,
  order_id        UUID        REFERENCES ord.orders(id),   -- linked when won
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID        NOT NULL REFERENCES sys.users(id)
);
CREATE TRIGGER trg_quotations_upd BEFORE UPDATE ON ord.quotations
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();

-- Buyer complaints & CAPA
CREATE TABLE ord.complaints (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_no   TEXT    NOT NULL UNIQUE,
  order_id       UUID    NOT NULL REFERENCES ord.orders(id),
  complaint_date DATE    NOT NULL DEFAULT CURRENT_DATE,
  category       TEXT    NOT NULL CHECK (category IN
                   ('quality_defect','wrong_style','wrong_size','short_shipment','packaging')),
  description    TEXT    NOT NULL,
  quantity       INTEGER,
  status         TEXT    NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open','in_progress','resolved','closed')),
  root_cause     TEXT,
  resolved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by     UUID    NOT NULL REFERENCES sys.users(id)
);
CREATE TRIGGER trg_complaints_upd BEFORE UPDATE ON ord.complaints
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();

CREATE TABLE ord.capa_actions (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id  UUID    NOT NULL REFERENCES ord.complaints(id),
  action_type   TEXT    NOT NULL CHECK (action_type IN ('corrective','preventive')),
  description   TEXT    NOT NULL,
  owner_user_id UUID    NOT NULL REFERENCES sys.users(id),
  due_date      DATE    NOT NULL,
  closed_at     TIMESTAMPTZ,
  status        TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- SCHEMA: prc  (procurement)
-- ================================================================

CREATE TABLE prc.vendor_categories (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE
);

CREATE TABLE prc.vendors (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_code    TEXT    NOT NULL UNIQUE,
  name           TEXT    NOT NULL,
  type           TEXT    NOT NULL CHECK (type IN
                   ('raw_material','sole','accessory','packaging','machine','service')),
  contact_name   TEXT,
  email          TEXT,
  phone          TEXT,
  address        TEXT,
  trade_license  TEXT,
  tin_number     TEXT,
  bank_name      TEXT,
  bank_account   TEXT,
  payment_terms  SMALLINT NOT NULL DEFAULT 30,
  credit_limit   NUMERIC(12,2) NOT NULL DEFAULT 0,
  status         TEXT    NOT NULL DEFAULT 'approved'
                   CHECK (status IN ('approved','blacklisted','under_review')),
  rating         NUMERIC(3,1),    -- computed vendor performance score
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by     UUID    NOT NULL REFERENCES sys.users(id)
);
CREATE TRIGGER trg_vendors_upd BEFORE UPDATE ON prc.vendors
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();
CREATE INDEX idx_vendors_name_trgm ON prc.vendors USING GIN (name gin_trgm_ops);
CREATE INDEX idx_vendors_status ON prc.vendors(status);

-- Approved vendor list per item category
CREATE TABLE prc.approved_vendor_items (
  vendor_id   UUID NOT NULL REFERENCES prc.vendors(id),
  item_id     UUID NOT NULL,                          -- FK to inv.stock_items (added after)
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by UUID NOT NULL REFERENCES sys.users(id),
  PRIMARY KEY (vendor_id, item_id)
);

-- Purchase Requisitions
CREATE TABLE prc.purchase_requisitions (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID    REFERENCES ord.orders(id),       -- NULL for ad-hoc PRs
  status      TEXT    NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','po_created','cancelled')),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID    NOT NULL REFERENCES sys.users(id)
);
CREATE TRIGGER trg_pr_upd BEFORE UPDATE ON prc.purchase_requisitions
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();

CREATE TABLE prc.pr_lines (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id           UUID          NOT NULL REFERENCES prc.purchase_requisitions(id) ON DELETE CASCADE,
  item_id         UUID          NOT NULL,              -- FK to inv.stock_items
  required_qty    NUMERIC(12,3) NOT NULL CHECK (required_qty > 0),
  required_by     DATE          NOT NULL,
  preferred_vendor_id UUID      REFERENCES prc.vendors(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_pr_lines_pr ON prc.pr_lines(pr_id);

-- Purchase Orders
CREATE TABLE prc.purchase_orders (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number     TEXT          NOT NULL UNIQUE DEFAULT sys.next_doc_number('po'),
  vendor_id     UUID          NOT NULL REFERENCES prc.vendors(id),
  status        TEXT          NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','pending_approval','approved',
                                    'partially_received','received','cancelled')),
  currency      CHAR(3)       NOT NULL DEFAULT 'BDT',
  total_amount  NUMERIC(15,2) NOT NULL DEFAULT 0,
  delivery_date DATE          NOT NULL,
  approved_by   UUID          REFERENCES sys.users(id),
  approved_at   TIMESTAMPTZ,
  notes         TEXT,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_by    UUID          NOT NULL REFERENCES sys.users(id)
);
CREATE TRIGGER trg_po_upd BEFORE UPDATE ON prc.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();
CREATE INDEX idx_po_vendor ON prc.purchase_orders(vendor_id);
CREATE INDEX idx_po_status  ON prc.purchase_orders(status) WHERE status NOT IN ('received','cancelled');

CREATE TABLE prc.po_lines (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id          UUID          NOT NULL REFERENCES prc.purchase_orders(id) ON DELETE CASCADE,
  item_id        UUID          NOT NULL,               -- FK to inv.stock_items
  ordered_qty    NUMERIC(12,3) NOT NULL CHECK (ordered_qty > 0),
  received_qty   NUMERIC(12,3) NOT NULL DEFAULT 0,
  unit_price     NUMERIC(12,4) NOT NULL CHECK (unit_price >= 0),
  uom            TEXT          NOT NULL,
  delivery_date  DATE,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_po_lines_po ON prc.po_lines(po_id);

-- Goods Receipt Notes
CREATE TABLE prc.goods_receipts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_number   TEXT        NOT NULL UNIQUE DEFAULT sys.next_doc_number('grn'),
  po_id        UUID        NOT NULL REFERENCES prc.purchase_orders(id),
  receipt_date DATE        NOT NULL DEFAULT CURRENT_DATE,
  status       TEXT        NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','qc_pending','approved','rejected')),
  received_by  UUID        NOT NULL REFERENCES sys.users(id),
  approved_by  UUID        REFERENCES sys.users(id),
  approved_at  TIMESTAMPTZ,
  vehicle_no   TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_grn_upd BEFORE UPDATE ON prc.goods_receipts
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();
CREATE INDEX idx_grn_po ON prc.goods_receipts(po_id);

CREATE TABLE prc.gr_lines (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id          UUID          NOT NULL REFERENCES prc.goods_receipts(id) ON DELETE CASCADE,
  po_line_id      UUID          NOT NULL REFERENCES prc.po_lines(id),
  received_qty    NUMERIC(12,3) NOT NULL CHECK (received_qty > 0),
  accepted_qty    NUMERIC(12,3) NOT NULL DEFAULT 0,
  rejected_qty    NUMERIC(12,3) NOT NULL DEFAULT 0,
  qc_status       TEXT          NOT NULL DEFAULT 'pending'
                    CHECK (qc_status IN ('pending','accepted','rejected','hold')),
  rejection_reason TEXT,
  batch_lot       TEXT,
  unit_cost       NUMERIC(12,4),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_gr_qty CHECK (accepted_qty + rejected_qty <= received_qty)
);
CREATE INDEX idx_gr_lines_grn ON prc.gr_lines(grn_id);

-- Vendor invoices (AP)
CREATE TABLE prc.vendor_invoices (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id      UUID          NOT NULL REFERENCES prc.vendors(id),
  invoice_no     TEXT          NOT NULL,
  invoice_date   DATE          NOT NULL,
  due_date       DATE          NOT NULL,
  currency       CHAR(3)       NOT NULL DEFAULT 'BDT',
  gross_amount   NUMERIC(15,2) NOT NULL,
  tds_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_payable    NUMERIC(15,2) NOT NULL,
  paid_amount    NUMERIC(15,2) NOT NULL DEFAULT 0,
  status         TEXT          NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','partial','paid','disputed','cancelled')),
  grn_id         UUID          REFERENCES prc.goods_receipts(id),
  gl_entry_id    UUID,                               -- FK to fin.gl_entries
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_by     UUID          NOT NULL REFERENCES sys.users(id),
  UNIQUE (vendor_id, invoice_no)
);
CREATE TRIGGER trg_vinv_upd BEFORE UPDATE ON prc.vendor_invoices
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();
CREATE INDEX idx_vinv_vendor ON prc.vendor_invoices(vendor_id);
CREATE INDEX idx_vinv_status  ON prc.vendor_invoices(status) WHERE status != 'paid';
CREATE INDEX idx_vinv_due     ON prc.vendor_invoices(due_date) WHERE status != 'paid';

-- ================================================================
-- SCHEMA: mfg  (BOM, production, QC, machines)
-- ================================================================

-- BOM
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

CREATE TABLE mfg.bom_lines (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_id          UUID          NOT NULL REFERENCES mfg.bom_headers(id) ON DELETE CASCADE,
  item_id         UUID          NOT NULL,            -- FK to inv.stock_items
  component_type  TEXT          NOT NULL CHECK (component_type IN
                    ('upper_material','lining','sole','insole','thread',
                     'adhesive','tag','label','sticker','box','polybag','accessory')),
  quantity_per_pair NUMERIC(10,4) NOT NULL CHECK (quantity_per_pair > 0),
  uom             TEXT          NOT NULL,
  size_specific   BOOLEAN       NOT NULL DEFAULT FALSE,
  size_label      TEXT,                              -- NULL = all sizes
  wastage_pct     NUMERIC(5,2)  NOT NULL DEFAULT 0,
  notes           TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_bom_lines_bom  ON mfg.bom_lines(bom_id);
CREATE INDEX idx_bom_lines_item ON mfg.bom_lines(item_id);

-- Cost sheets (linked to BOM version)
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
  actual_cost      NUMERIC(12,4),                   -- filled after order completion
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

-- Production factory lines
CREATE TABLE mfg.factory_lines (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT    NOT NULL UNIQUE,
  name         TEXT    NOT NULL,
  floor        TEXT,
  capacity_prs INTEGER NOT NULL DEFAULT 0,   -- pairs per day
  is_active    BOOLEAN NOT NULL DEFAULT TRUE
);

-- Operations master
CREATE TABLE mfg.operations (
  id       UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  code     TEXT    NOT NULL UNIQUE,
  name     TEXT    NOT NULL,
  section  TEXT    NOT NULL CHECK (section IN
             ('cutting','stitching','lasting','sole_attaching','finishing','qc','packing')),
  sam      NUMERIC(6,2),    -- standard allowed minutes
  sequence SMALLINT NOT NULL DEFAULT 0
);

-- Article routing (sequence of operations per article)
CREATE TABLE mfg.article_routings (
  id          UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id  UUID     NOT NULL REFERENCES ord.articles(id),
  operation_id UUID    NOT NULL REFERENCES mfg.operations(id),
  sequence    SMALLINT NOT NULL,
  sam_override NUMERIC(6,2),
  UNIQUE (article_id, sequence)
);

-- Production orders
CREATE TABLE mfg.production_orders (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID    NOT NULL REFERENCES ord.orders(id),
  factory_line_id  UUID    REFERENCES mfg.factory_lines(id),
  bom_id           UUID    NOT NULL REFERENCES mfg.bom_headers(id),
  planned_qty      INTEGER NOT NULL CHECK (planned_qty > 0),
  produced_qty     INTEGER NOT NULL DEFAULT 0,
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
CREATE INDEX idx_prod_orders_order ON mfg.production_orders(order_id);

-- Daily production entries
CREATE TABLE mfg.daily_productions (
  id                 UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id UUID   NOT NULL REFERENCES mfg.production_orders(id),
  prod_date          DATE    NOT NULL,
  factory_line_id    UUID    NOT NULL REFERENCES mfg.factory_lines(id),
  operation_id       UUID    NOT NULL REFERENCES mfg.operations(id),
  shift              TEXT    NOT NULL DEFAULT 'day' CHECK (shift IN ('day','night')),
  target_qty         INTEGER NOT NULL DEFAULT 0,
  produced_qty       INTEGER NOT NULL DEFAULT 0,
  rejected_qty       INTEGER NOT NULL DEFAULT 0,
  efficiency_pct     NUMERIC(5,2) GENERATED ALWAYS AS
                       (CASE WHEN target_qty > 0
                         THEN ROUND((produced_qty::NUMERIC / target_qty) * 100, 2)
                        END) STORED,
  supervisor_id      UUID    REFERENCES sys.users(id),
  locked             BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (production_order_id, prod_date, operation_id, shift)
) PARTITION BY RANGE (prod_date);

CREATE TABLE mfg.daily_productions_2025 PARTITION OF mfg.daily_productions
  FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
CREATE TABLE mfg.daily_productions_2026 PARTITION OF mfg.daily_productions
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
CREATE INDEX idx_daily_prod_order ON mfg.daily_productions(production_order_id, prod_date DESC);

-- QC results
CREATE TABLE mfg.qc_results (
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
  defect_details      JSONB,  -- [{"type":"sole_gap","qty":5,"section":"lasting"}, ...]
  inspector_id        UUID    REFERENCES sys.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_qc_qty CHECK (passed_qty + failed_qty + rework_qty = inspected_qty)
);
CREATE INDEX idx_qc_prod_order ON mfg.qc_results(production_order_id);

-- Machines
CREATE TABLE mfg.machines (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_code   TEXT    NOT NULL UNIQUE,
  name           TEXT    NOT NULL,
  type           TEXT    NOT NULL,
  model          TEXT,
  manufacturer   TEXT,
  factory_line_id UUID   REFERENCES mfg.factory_lines(id),
  purchase_date  DATE,
  status         TEXT    NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','under_maintenance','breakdown','retired')),
  asset_id       UUID,                        -- FK to fin.fixed_assets
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_machine_upd BEFORE UPDATE ON mfg.machines
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();

CREATE TABLE mfg.machine_maintenance (
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
CREATE INDEX idx_maint_machine ON mfg.machine_maintenance(machine_id, start_time DESC);

-- Lasts & moulds
CREATE TABLE mfg.lasts_moulds (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT    NOT NULL UNIQUE,
  type            TEXT    NOT NULL CHECK (type IN ('last','mould','half_mould')),
  article_id      UUID    REFERENCES ord.articles(id),
  size_label      TEXT    NOT NULL,
  material        TEXT,
  supplier        TEXT,
  purchase_date   DATE,
  purchase_cost   NUMERIC(10,2),
  usage_count     INTEGER NOT NULL DEFAULT 0,
  max_usage       INTEGER,
  storage_location TEXT,
  condition       TEXT    NOT NULL DEFAULT 'good'
                    CHECK (condition IN ('good','worn','under_repair','retired')),
  current_order_id UUID   REFERENCES mfg.production_orders(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_lasts_upd BEFORE UPDATE ON mfg.lasts_moulds
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();

-- Scrap records
CREATE TABLE mfg.scrap_records (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id UUID          NOT NULL REFERENCES mfg.production_orders(id),
  scrap_date          DATE          NOT NULL DEFAULT CURRENT_DATE,
  scrap_type          TEXT          NOT NULL CHECK (scrap_type IN
                        ('upper_offcut','rejected_sole','damaged_insole',
                         'adhesive_waste','packing_waste','other')),
  section             TEXT          NOT NULL,
  quantity            NUMERIC(10,3) NOT NULL CHECK (quantity > 0),
  uom                 TEXT          NOT NULL,
  unit_value          NUMERIC(10,4),
  disposal_method     TEXT          CHECK (disposal_method IN ('sale','recycle','landfill')),
  disposal_authorised_by UUID       REFERENCES sys.users(id),
  sale_amount         NUMERIC(10,2),
  notes               TEXT,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_by          UUID          NOT NULL REFERENCES sys.users(id)
);
CREATE INDEX idx_scrap_prod_order ON mfg.scrap_records(production_order_id);

-- ================================================================
-- SCHEMA: inv  (inventory)
-- ================================================================

CREATE TABLE inv.warehouses (
  id       UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  code     TEXT    NOT NULL UNIQUE,
  name     TEXT    NOT NULL,
  location TEXT,
  type     TEXT    NOT NULL CHECK (type IN
             ('raw_material','accessories','finished_goods','packing','general')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE inv.stock_items (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code      TEXT          NOT NULL UNIQUE,
  name           TEXT          NOT NULL,
  category       TEXT          NOT NULL CHECK (category IN
                   ('raw_material','sole','accessory','packing','finished_goods')),
  sub_category   TEXT,
  uom            TEXT          NOT NULL,
  reorder_level  NUMERIC(12,3) NOT NULL DEFAULT 0,
  min_stock      NUMERIC(12,3) NOT NULL DEFAULT 0,
  max_stock      NUMERIC(12,3),
  lead_time_days SMALLINT      NOT NULL DEFAULT 7,
  hsn_code       TEXT,
  is_active      BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_by     UUID          NOT NULL REFERENCES sys.users(id)
);
CREATE TRIGGER trg_items_upd BEFORE UPDATE ON inv.stock_items
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();
CREATE INDEX idx_items_name_trgm ON inv.stock_items USING GIN (name gin_trgm_ops);

-- Add deferred FK to prc tables now that inv.stock_items exists
ALTER TABLE prc.pr_lines ADD CONSTRAINT fk_pr_item
  FOREIGN KEY (item_id) REFERENCES inv.stock_items(id);
ALTER TABLE prc.po_lines ADD CONSTRAINT fk_po_item
  FOREIGN KEY (item_id) REFERENCES inv.stock_items(id);
ALTER TABLE prc.approved_vendor_items ADD CONSTRAINT fk_avi_item
  FOREIGN KEY (item_id) REFERENCES inv.stock_items(id);
ALTER TABLE mfg.bom_lines ADD CONSTRAINT fk_bom_item
  FOREIGN KEY (item_id) REFERENCES inv.stock_items(id);

-- Stock transactions (append-only ledger — no updates, no deletes)
CREATE TABLE inv.stock_transactions (
  id             UUID          NOT NULL DEFAULT gen_random_uuid(),
  txn_date       DATE          NOT NULL,
  txn_number     TEXT          NOT NULL UNIQUE,
  txn_type       TEXT          NOT NULL CHECK (txn_type IN
                   ('grn','production_issue','production_return','delivery',
                    'return_from_buyer','transfer_in','transfer_out',
                    'adjustment_in','adjustment_out','opening_stock','write_off',
                    'outsource_issue','outsource_return')),
  item_id        UUID          NOT NULL REFERENCES inv.stock_items(id),
  warehouse_id   UUID          NOT NULL REFERENCES inv.warehouses(id),
  quantity       NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  direction      SMALLINT      NOT NULL CHECK (direction IN (1,-1)),
  unit_cost      NUMERIC(12,4),
  batch_lot      TEXT,
  source_module  TEXT,         -- 'prc','ord','mfg','out'
  source_id      UUID,         -- GRN id, delivery challan id, etc.
  remarks        TEXT,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_by     UUID          NOT NULL REFERENCES sys.users(id)
) PARTITION BY RANGE (txn_date);

CREATE TABLE inv.stock_transactions_2025 PARTITION OF inv.stock_transactions
  FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
CREATE TABLE inv.stock_transactions_2026 PARTITION OF inv.stock_transactions
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
CREATE INDEX idx_stxn_item ON inv.stock_transactions(item_id, txn_date DESC);
CREATE INDEX idx_stxn_wh   ON inv.stock_transactions(warehouse_id, item_id);
CREATE INDEX idx_stxn_src  ON inv.stock_transactions(source_module, source_id);

-- Current stock balances (maintained by trigger)
CREATE TABLE inv.stock_balances (
  item_id      UUID          NOT NULL REFERENCES inv.stock_items(id),
  warehouse_id UUID          NOT NULL REFERENCES inv.warehouses(id),
  quantity     NUMERIC(12,3) NOT NULL DEFAULT 0,
  avg_cost     NUMERIC(12,4) NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (item_id, warehouse_id),
  CONSTRAINT chk_balance_non_negative CHECK (quantity >= 0)
);

-- Trigger: update stock_balances on each transaction insert
CREATE OR REPLACE FUNCTION inv.update_stock_balance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO inv.stock_balances (item_id, warehouse_id, quantity, avg_cost)
  VALUES (NEW.item_id, NEW.warehouse_id, NEW.quantity * NEW.direction, COALESCE(NEW.unit_cost,0))
  ON CONFLICT (item_id, warehouse_id) DO UPDATE SET
    quantity = inv.stock_balances.quantity + (NEW.quantity * NEW.direction),
    avg_cost = CASE
      WHEN NEW.direction = 1 AND NEW.unit_cost IS NOT NULL THEN
        ROUND(
          (inv.stock_balances.quantity * inv.stock_balances.avg_cost
           + NEW.quantity * NEW.unit_cost)
          / NULLIF(inv.stock_balances.quantity + NEW.quantity, 0), 4)
      ELSE inv.stock_balances.avg_cost
    END,
    last_updated = NOW();
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_stock_balance AFTER INSERT ON inv.stock_transactions
  FOR EACH ROW EXECUTE FUNCTION inv.update_stock_balance();

-- Physical stock counts
CREATE TABLE inv.stock_counts (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  count_date    DATE    NOT NULL DEFAULT CURRENT_DATE,
  warehouse_id  UUID    NOT NULL REFERENCES inv.warehouses(id),
  status        TEXT    NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','counting','variance_review','approved','cancelled')),
  approved_by   UUID    REFERENCES sys.users(id),
  approved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    UUID    NOT NULL REFERENCES sys.users(id)
);

CREATE TABLE inv.stock_count_lines (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id      UUID          NOT NULL REFERENCES inv.stock_counts(id) ON DELETE CASCADE,
  item_id       UUID          NOT NULL REFERENCES inv.stock_items(id),
  system_qty    NUMERIC(12,3) NOT NULL,
  physical_qty  NUMERIC(12,3),
  variance      NUMERIC(12,3) GENERATED ALWAYS AS
                  (CASE WHEN physical_qty IS NOT NULL THEN physical_qty - system_qty END) STORED,
  variance_reason TEXT,
  UNIQUE (count_id, item_id)
);

-- ================================================================
-- SCHEMA: fin  (finance, GL, assets, budgets)
-- ================================================================

CREATE TABLE fin.chart_of_accounts (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code   TEXT    NOT NULL UNIQUE,
  name           TEXT    NOT NULL,
  account_type   TEXT    NOT NULL CHECK (account_type IN
                   ('asset','liability','equity','revenue','expense')),
  account_class  TEXT    NOT NULL,   -- 'current_asset','fixed_asset','trade_payable', etc.
  parent_id      UUID    REFERENCES fin.chart_of_accounts(id),
  is_control     BOOLEAN NOT NULL DEFAULT FALSE,
  currency       CHAR(3) NOT NULL DEFAULT 'BDT',
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_coa_upd BEFORE UPDATE ON fin.chart_of_accounts
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();

CREATE TABLE fin.gl_periods (
  id            UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  period_year   SMALLINT NOT NULL,
  period_month  SMALLINT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  status        TEXT     NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','closed','locked')),
  closed_by     UUID     REFERENCES sys.users(id),
  closed_at     TIMESTAMPTZ,
  UNIQUE (period_year, period_month)
);

-- GL journal headers
CREATE TABLE fin.gl_entries (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_number   TEXT        NOT NULL UNIQUE DEFAULT sys.next_doc_number('gl_entry'),
  period_id      UUID        NOT NULL REFERENCES fin.gl_periods(id),
  entry_date     DATE        NOT NULL,
  entry_type     TEXT        NOT NULL DEFAULT 'manual'
                   CHECK (entry_type IN ('manual','system','reversal')),
  source_module  TEXT,       -- 'payroll','grn','delivery','depreciation','pf','gratuity'
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
CREATE INDEX idx_gl_entries_period ON fin.gl_entries(period_id, status);
CREATE INDEX idx_gl_entries_source ON fin.gl_entries(source_module, source_id);

-- GL journal lines (append-only, partitioned by year)
CREATE TABLE fin.gl_entry_lines (
  id           UUID          NOT NULL DEFAULT gen_random_uuid(),
  gl_entry_id  UUID          NOT NULL REFERENCES fin.gl_entries(id),
  account_id   UUID          NOT NULL REFERENCES fin.chart_of_accounts(id),
  debit        NUMERIC(15,4) NOT NULL DEFAULT 0,
  credit       NUMERIC(15,4) NOT NULL DEFAULT 0,
  currency     CHAR(3)       NOT NULL DEFAULT 'BDT',
  fx_rate      NUMERIC(12,6) NOT NULL DEFAULT 1,
  base_debit   NUMERIC(15,4) GENERATED ALWAYS AS (ROUND(debit  * fx_rate, 4)) STORED,
  base_credit  NUMERIC(15,4) GENERATED ALWAYS AS (ROUND(credit * fx_rate, 4)) STORED,
  department_id UUID         REFERENCES hr.departments(id),
  cost_center  TEXT,
  entry_date   DATE          NOT NULL,   -- denormalized for partition pruning
  narration    TEXT,
  CONSTRAINT chk_gl_debit_credit  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)),
  CONSTRAINT chk_gl_nonzero CHECK (debit + credit > 0)
) PARTITION BY RANGE (entry_date);

CREATE TABLE fin.gl_entry_lines_2025 PARTITION OF fin.gl_entry_lines
  FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
CREATE TABLE fin.gl_entry_lines_2026 PARTITION OF fin.gl_entry_lines
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
CREATE TABLE fin.gl_entry_lines_2027 PARTITION OF fin.gl_entry_lines
  FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');

CREATE INDEX idx_gl_lines_account ON fin.gl_entry_lines(account_id, entry_date DESC);
CREATE INDEX idx_gl_lines_entry   ON fin.gl_entry_lines(gl_entry_id);
CREATE INDEX idx_gl_lines_dept    ON fin.gl_entry_lines(department_id, entry_date DESC);

-- Trigger: prevent posting to a locked period
CREATE OR REPLACE FUNCTION fin.check_period_open()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_status TEXT;
BEGIN
  SELECT p.status INTO v_status
  FROM fin.gl_entries e JOIN fin.gl_periods p ON p.id = e.period_id
  WHERE e.id = NEW.gl_entry_id;
  IF v_status = 'locked' THEN
    RAISE EXCEPTION 'Cannot post to a locked GL period';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_gl_period_check BEFORE INSERT ON fin.gl_entry_lines
  FOR EACH ROW EXECUTE FUNCTION fin.check_period_open();

-- Bank accounts
CREATE TABLE fin.bank_accounts (
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

CREATE TABLE fin.bank_transactions (
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
CREATE INDEX idx_bank_txn_acct ON fin.bank_transactions(bank_account_id, txn_date DESC);

-- Fixed assets
CREATE TABLE fin.asset_categories (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT         NOT NULL UNIQUE,
  depreciation_method TEXT        NOT NULL CHECK (depreciation_method IN ('straight_line','diminishing_balance')),
  useful_life_years  SMALLINT     NOT NULL,
  depreciation_rate  NUMERIC(6,4) NOT NULL,   -- annual rate (e.g. 0.2 = 20%)
  salvage_pct        NUMERIC(5,2) NOT NULL DEFAULT 5,
  gl_asset_account   UUID         NOT NULL REFERENCES fin.chart_of_accounts(id),
  gl_depreciation_account UUID    NOT NULL REFERENCES fin.chart_of_accounts(id),
  gl_accum_dep_account UUID       NOT NULL REFERENCES fin.chart_of_accounts(id)
);

CREATE TABLE fin.fixed_assets (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_code        TEXT          NOT NULL UNIQUE DEFAULT sys.next_doc_number('asset'),
  name              TEXT          NOT NULL,
  category_id       UUID          NOT NULL REFERENCES fin.asset_categories(id),
  department_id     UUID          REFERENCES hr.departments(id),
  location          TEXT,
  purchase_date     DATE          NOT NULL,
  original_cost     NUMERIC(14,2) NOT NULL CHECK (original_cost > 0),
  salvage_value     NUMERIC(12,2) NOT NULL DEFAULT 0,
  useful_life_years SMALLINT      NOT NULL,
  depreciation_method TEXT        NOT NULL CHECK (depreciation_method IN ('straight_line','diminishing_balance')),
  accumulated_dep   NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_book_value    NUMERIC(14,2) GENERATED ALWAYS AS (original_cost - accumulated_dep) STORED,
  status            TEXT          NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','disposed','written_off')),
  disposal_date     DATE,
  disposal_proceeds NUMERIC(12,2),
  -- Link to import shipment if asset was imported
  import_ref        TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_by        UUID          NOT NULL REFERENCES sys.users(id)
);
CREATE TRIGGER trg_asset_upd BEFORE UPDATE ON fin.fixed_assets
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();

-- Monthly depreciation log
CREATE TABLE fin.asset_depreciation (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id     UUID          NOT NULL REFERENCES fin.fixed_assets(id),
  period_id    UUID          NOT NULL REFERENCES fin.gl_periods(id),
  dep_amount   NUMERIC(12,4) NOT NULL,
  nbv_before   NUMERIC(14,2) NOT NULL,
  nbv_after    NUMERIC(14,2) NOT NULL,
  gl_entry_id  UUID          REFERENCES fin.gl_entries(id),
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (asset_id, period_id)
);

-- Budgets
CREATE TABLE fin.budgets (
  id           UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_year  SMALLINT NOT NULL,
  name         TEXT     NOT NULL,
  budget_type  TEXT     NOT NULL CHECK (budget_type IN ('opex','capex','consolidated')),
  status       TEXT     NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','submitted','approved','locked')),
  approved_by  UUID     REFERENCES sys.users(id),
  approved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by   UUID     NOT NULL REFERENCES sys.users(id),
  UNIQUE (budget_year, budget_type)
);
CREATE TRIGGER trg_budget_upd BEFORE UPDATE ON fin.budgets
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();

CREATE TABLE fin.budget_lines (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id    UUID          NOT NULL REFERENCES fin.budgets(id) ON DELETE CASCADE,
  account_id   UUID          NOT NULL REFERENCES fin.chart_of_accounts(id),
  department_id UUID         REFERENCES hr.departments(id),
  period_month SMALLINT      NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  budgeted_amt NUMERIC(15,2) NOT NULL,
  revised_amt  NUMERIC(15,2),
  UNIQUE (budget_id, account_id, department_id, period_month)
);

-- Import LCs
CREATE TABLE fin.import_lcs (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  lc_number      TEXT          NOT NULL UNIQUE,
  issuing_bank   TEXT          NOT NULL,
  beneficiary    TEXT          NOT NULL,
  po_id          UUID          REFERENCES prc.purchase_orders(id),
  lc_amount      NUMERIC(15,2) NOT NULL,
  currency       CHAR(3)       NOT NULL DEFAULT 'USD',
  open_date      DATE          NOT NULL,
  expiry_date    DATE          NOT NULL,
  shipment_last  DATE,
  incoterm       TEXT,
  status         TEXT          NOT NULL DEFAULT 'open'
                   CHECK (status IN ('draft','open','shipment_confirmed','docs_received',
                                     'customs_cleared','delivered','settled')),
  landed_cost    NUMERIC(15,2),
  notes          TEXT,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_by     UUID          NOT NULL REFERENCES sys.users(id)
);
CREATE TRIGGER trg_ilc_upd BEFORE UPDATE ON fin.import_lcs
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();

-- Export LCs
CREATE TABLE fin.export_lcs (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  lc_number       TEXT          NOT NULL UNIQUE,
  buyer_id        UUID          NOT NULL REFERENCES ord.buyers(id),
  order_id        UUID          REFERENCES ord.orders(id),
  advising_bank   TEXT,
  lc_amount       NUMERIC(15,2) NOT NULL,
  currency        CHAR(3)       NOT NULL DEFAULT 'USD',
  open_date       DATE          NOT NULL,
  expiry_date     DATE          NOT NULL,
  shipment_last   DATE,
  tolerance_pct   NUMERIC(4,1)  NOT NULL DEFAULT 5,
  status          TEXT          NOT NULL DEFAULT 'received'
                    CHECK (status IN ('received','docs_submitted','negotiated',
                                      'payment_received','repatriated','closed')),
  repatriation_date DATE,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_by      UUID          NOT NULL REFERENCES sys.users(id)
);
CREATE TRIGGER trg_elc_upd BEFORE UPDATE ON fin.export_lcs
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();

-- Delivery challans (lives in fin as it generates AR)
CREATE TABLE fin.delivery_challans (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  dc_number       TEXT    NOT NULL UNIQUE DEFAULT sys.next_doc_number('delivery'),
  order_id        UUID    NOT NULL REFERENCES ord.orders(id),
  export_lc_id    UUID    REFERENCES fin.export_lcs(id),
  dc_date         DATE    NOT NULL DEFAULT CURRENT_DATE,
  vehicle_no      TEXT,
  carrier         TEXT,
  dispatch_by     UUID    REFERENCES sys.users(id),
  status          TEXT    NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','dispatched','delivered','returned')),
  pod_date        DATE,
  pod_receiver    TEXT,
  pod_notes       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID    NOT NULL REFERENCES sys.users(id)
);
CREATE TRIGGER trg_dc_upd BEFORE UPDATE ON fin.delivery_challans
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();
CREATE INDEX idx_dc_order ON fin.delivery_challans(order_id);

CREATE TABLE fin.dc_lines (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  dc_id       UUID          NOT NULL REFERENCES fin.delivery_challans(id) ON DELETE CASCADE,
  order_line_id UUID        NOT NULL REFERENCES ord.order_lines(id),
  quantity    INTEGER       NOT NULL CHECK (quantity > 0),
  unit_price  NUMERIC(12,4) NOT NULL,
  amount      NUMERIC(14,4) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Buyer invoices (AR)
CREATE TABLE fin.buyer_invoices (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no      TEXT          NOT NULL UNIQUE,
  buyer_id        UUID          NOT NULL REFERENCES ord.buyers(id),
  dc_id           UUID          NOT NULL REFERENCES fin.delivery_challans(id),
  invoice_date    DATE          NOT NULL DEFAULT CURRENT_DATE,
  due_date        DATE          NOT NULL,
  currency        CHAR(3)       NOT NULL DEFAULT 'USD',
  gross_amount    NUMERIC(15,2) NOT NULL,
  collected_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  status          TEXT          NOT NULL DEFAULT 'unpaid'
                    CHECK (status IN ('unpaid','partial','paid','disputed')),
  gl_entry_id     UUID          REFERENCES fin.gl_entries(id),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_by      UUID          NOT NULL REFERENCES sys.users(id)
);
CREATE TRIGGER trg_binv_upd BEFORE UPDATE ON fin.buyer_invoices
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();
CREATE INDEX idx_binv_buyer  ON fin.buyer_invoices(buyer_id);
CREATE INDEX idx_binv_status ON fin.buyer_invoices(status) WHERE status != 'paid';

-- ================================================================
-- SCHEMA: hr  (employees, payroll, leave, PF, gratuity)
-- ================================================================

CREATE TABLE hr.departments (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  parent_id   UUID    REFERENCES hr.departments(id),
  head_id     UUID,   -- FK to hr.employees (added after employee table)
  cost_center TEXT,
  location    TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_dept_upd BEFORE UPDATE ON hr.departments
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();

-- Add deferred FK to gl_entry_lines now that hr.departments exists
ALTER TABLE fin.gl_entry_lines ADD CONSTRAINT fk_gl_department
  FOREIGN KEY (department_id) REFERENCES hr.departments(id);

CREATE TABLE hr.job_titles (
  id        UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  code      TEXT    NOT NULL UNIQUE,
  title     TEXT    NOT NULL,
  level     TEXT    NOT NULL CHECK (level IN ('junior','mid','senior','lead','manager','director'))
);

CREATE TABLE hr.pay_grades (
  id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT          NOT NULL UNIQUE,
  name       TEXT          NOT NULL,
  min_salary NUMERIC(12,2) NOT NULL,
  max_salary NUMERIC(12,2) NOT NULL,
  currency   CHAR(3)       NOT NULL DEFAULT 'BDT',
  CONSTRAINT chk_salary_range CHECK (max_salary >= min_salary)
);

CREATE TABLE hr.employees (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code        TEXT         NOT NULL UNIQUE,
  full_name            TEXT         NOT NULL,
  date_of_birth        DATE         NOT NULL,
  gender               CHAR(1)      NOT NULL CHECK (gender IN ('M','F','O')),
  nationality          TEXT         NOT NULL DEFAULT 'Bangladeshi',
  religion             TEXT,
  marital_status       TEXT         CHECK (marital_status IN ('single','married','divorced','widowed')),
  join_date            DATE         NOT NULL,
  confirmation_date    DATE,
  department_id        UUID         NOT NULL REFERENCES hr.departments(id),
  job_title_id         UUID         REFERENCES hr.job_titles(id),
  pay_grade_id         UUID         REFERENCES hr.pay_grades(id),
  designation          TEXT         NOT NULL,
  employment_type      TEXT         NOT NULL CHECK (employment_type IN
                         ('full_time','contractor','intern','part_time')),
  employee_category    TEXT         NOT NULL CHECK (employee_category IN ('office','factory')),
  factory_category     TEXT         CHECK (factory_category IN
                         ('operator','helper','qc_inspector','supervisor','floor_incharge')),
  reporting_manager_id UUID         REFERENCES hr.employees(id),
  status               TEXT         NOT NULL DEFAULT 'probation'
                         CHECK (status IN ('active','probation','notice_period','terminated','resigned')),
  basic_salary         NUMERIC(12,2) NOT NULL DEFAULT 0,
  last_working_date    DATE,
  photo_url            TEXT,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at           TIMESTAMPTZ,
  created_by           UUID         NOT NULL REFERENCES sys.users(id),
  CONSTRAINT chk_factory_cat CHECK (employee_category != 'factory' OR factory_category IS NOT NULL)
);
CREATE TRIGGER trg_emp_upd BEFORE UPDATE ON hr.employees
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();
CREATE UNIQUE INDEX idx_emp_code ON hr.employees(employee_code) WHERE deleted_at IS NULL;
CREATE INDEX idx_emp_dept ON hr.employees(department_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_emp_manager ON hr.employees(reporting_manager_id);
CREATE INDEX idx_emp_name_trgm ON hr.employees USING GIN (full_name gin_trgm_ops);

-- Now add deferred FKs for departments.head_id and sys.users.employee_id
ALTER TABLE hr.departments ADD CONSTRAINT fk_dept_head
  FOREIGN KEY (head_id) REFERENCES hr.employees(id);
ALTER TABLE sys.users ADD CONSTRAINT fk_users_employee
  FOREIGN KEY (employee_id) REFERENCES hr.employees(id);

-- Encrypted sensitive fields (separate table; AES-256-GCM at app layer)
CREATE TABLE hr.employee_secrets (
  employee_id            UUID  PRIMARY KEY REFERENCES hr.employees(id) ON DELETE CASCADE,
  nid_encrypted          BYTEA,
  passport_encrypted     BYTEA,
  bank_account_encrypted BYTEA,
  bank_name              TEXT,
  bank_branch            TEXT,
  routing_number         TEXT,
  emergency_contact      JSONB,   -- { name, relation, phone, address }
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Append-only employment event log
CREATE TABLE hr.employment_events (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id      UUID         NOT NULL REFERENCES hr.employees(id),
  event_type       TEXT         NOT NULL CHECK (event_type IN
                     ('hire','transfer','promotion','demotion','salary_revision',
                      'confirmation','notice_period','termination','resignation')),
  effective_date   DATE         NOT NULL,
  old_department   UUID         REFERENCES hr.departments(id),
  new_department   UUID         REFERENCES hr.departments(id),
  old_designation  TEXT,
  new_designation  TEXT,
  old_basic        NUMERIC(12,2),
  new_basic        NUMERIC(12,2),
  reason           TEXT,
  notes            TEXT,
  approved_by      UUID         NOT NULL REFERENCES sys.users(id),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_by       UUID         NOT NULL REFERENCES sys.users(id)
);
CREATE INDEX idx_emp_events ON hr.employment_events(employee_id, effective_date DESC);

-- Leave types and policies
CREATE TABLE hr.leave_types (
  id                  UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  code                TEXT     NOT NULL UNIQUE,
  name                TEXT     NOT NULL,
  is_paid             BOOLEAN  NOT NULL DEFAULT TRUE,
  accrual_type        TEXT     NOT NULL DEFAULT 'annual'
                        CHECK (accrual_type IN ('annual','monthly','none')),
  annual_entitlement  NUMERIC(5,2) NOT NULL DEFAULT 0,
  carry_forward_limit NUMERIC(5,2) NOT NULL DEFAULT 0,
  max_balance         NUMERIC(5,2),
  is_encashable       BOOLEAN  NOT NULL DEFAULT FALSE,
  requires_document   BOOLEAN  NOT NULL DEFAULT FALSE,
  min_advance_days    SMALLINT NOT NULL DEFAULT 0,
  half_day_allowed    BOOLEAN  NOT NULL DEFAULT TRUE,
  is_active           BOOLEAN  NOT NULL DEFAULT TRUE
);

-- Holiday calendars
CREATE TABLE hr.holiday_calendars (
  id       UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  year     SMALLINT NOT NULL,
  location TEXT,
  name     TEXT    NOT NULL,
  UNIQUE (year, location)
);

CREATE TABLE hr.holidays (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id UUID    NOT NULL REFERENCES hr.holiday_calendars(id) ON DELETE CASCADE,
  holiday_date DATE   NOT NULL,
  name        TEXT    NOT NULL,
  type        TEXT    NOT NULL CHECK (type IN ('public','optional','restricted'))
);

-- Leave balances (per employee, per year, per leave type)
CREATE TABLE hr.leave_balances (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID          NOT NULL REFERENCES hr.employees(id),
  leave_type_id UUID          NOT NULL REFERENCES hr.leave_types(id),
  year          SMALLINT      NOT NULL,
  opening_bal   NUMERIC(6,2)  NOT NULL DEFAULT 0,
  accrued       NUMERIC(6,2)  NOT NULL DEFAULT 0,
  adjusted      NUMERIC(6,2)  NOT NULL DEFAULT 0,
  used          NUMERIC(6,2)  NOT NULL DEFAULT 0,
  balance       NUMERIC(6,2)  GENERATED ALWAYS AS
                  (opening_bal + accrued + adjusted - used) STORED,
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, leave_type_id, year)
);
CREATE INDEX idx_leave_bal_emp ON hr.leave_balances(employee_id, year);

-- Leave requests
CREATE TABLE hr.leave_requests (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id    UUID        NOT NULL REFERENCES hr.employees(id),
  leave_type_id  UUID        NOT NULL REFERENCES hr.leave_types(id),
  start_date     DATE        NOT NULL,
  end_date       DATE        NOT NULL,
  half_day       TEXT        CHECK (half_day IN ('morning','afternoon')),
  total_days     NUMERIC(5,2) NOT NULL,
  reason         TEXT,
  status         TEXT        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','manager_approved','hr_approved','rejected','cancelled')),
  manager_id     UUID        REFERENCES sys.users(id),
  manager_decision_at TIMESTAMPTZ,
  hr_decision_at TIMESTAMPTZ,
  rejection_reason TEXT,
  document_url   TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_leave_dates CHECK (end_date >= start_date)
);
CREATE TRIGGER trg_leave_req_upd BEFORE UPDATE ON hr.leave_requests
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();
CREATE INDEX idx_leave_req_emp ON hr.leave_requests(employee_id, start_date DESC);

-- Attendance (partitioned by year)
CREATE TABLE hr.attendance_records (
  id            UUID        NOT NULL DEFAULT gen_random_uuid(),
  employee_id   UUID        NOT NULL REFERENCES hr.employees(id),
  check_date    DATE        NOT NULL,
  clock_in      TIMESTAMPTZ,
  clock_out     TIMESTAMPTZ,
  source        TEXT        NOT NULL DEFAULT 'web'
                  CHECK (source IN ('web','biometric','manual')),
  status        TEXT        NOT NULL DEFAULT 'present'
                  CHECK (status IN ('present','absent','late','half_day','on_leave','holiday')),
  late_minutes  SMALLINT    NOT NULL DEFAULT 0,
  overtime_hrs  NUMERIC(4,2) NOT NULL DEFAULT 0,
  lop_days      NUMERIC(3,2) NOT NULL DEFAULT 0,
  corrected_by  UUID        REFERENCES sys.users(id),
  correction_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (check_date);

CREATE TABLE hr.attendance_2025 PARTITION OF hr.attendance_records
  FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
CREATE TABLE hr.attendance_2026 PARTITION OF hr.attendance_records
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
CREATE UNIQUE INDEX idx_att_emp_date ON hr.attendance_records(employee_id, check_date);
CREATE INDEX idx_att_date ON hr.attendance_records(check_date);

-- Salary components
CREATE TABLE hr.salary_components (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  code             TEXT    NOT NULL UNIQUE,
  name             TEXT    NOT NULL,
  component_type   TEXT    NOT NULL CHECK (component_type IN ('earning','deduction','benefit')),
  calc_mode        TEXT    NOT NULL CHECK (calc_mode IN ('fixed','pct_of','formula')),
  pct_of_component TEXT,   -- e.g., 'BASIC' for HRA = 40% of basic
  pct_value        NUMERIC(6,4),
  formula_expr     TEXT,
  sequence         SMALLINT NOT NULL DEFAULT 10,
  taxable          BOOLEAN  NOT NULL DEFAULT TRUE,
  is_active        BOOLEAN  NOT NULL DEFAULT TRUE
);

-- Salary structures (bundles of components)
CREATE TABLE hr.salary_structures (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT    NOT NULL UNIQUE,
  name       TEXT    NOT NULL,
  currency   CHAR(3) NOT NULL DEFAULT 'BDT',
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE hr.struct_components (
  structure_id   UUID     NOT NULL REFERENCES hr.salary_structures(id) ON DELETE CASCADE,
  component_id   UUID     NOT NULL REFERENCES hr.salary_components(id),
  sequence       SMALLINT NOT NULL DEFAULT 10,
  override_value NUMERIC(12,2),
  PRIMARY KEY (structure_id, component_id)
);

-- Employee salary assignments (effective-dated)
CREATE TABLE hr.employee_salaries (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID          NOT NULL REFERENCES hr.employees(id),
  structure_id  UUID          NOT NULL REFERENCES hr.salary_structures(id),
  basic_salary  NUMERIC(12,2) NOT NULL CHECK (basic_salary >= 0),
  effective_from DATE         NOT NULL,
  effective_to  DATE,
  is_current    BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_by    UUID          NOT NULL REFERENCES sys.users(id),
  CONSTRAINT chk_salary_dates CHECK (effective_to IS NULL OR effective_to > effective_from)
);
CREATE INDEX idx_emp_salary_current ON hr.employee_salaries(employee_id) WHERE is_current;

-- Payroll runs
CREATE TABLE hr.payroll_runs (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month    SMALLINT      NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year     SMALLINT      NOT NULL,
  status          TEXT          NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','processing','approved','disbursed','reversed')),
  total_gross     NUMERIC(16,2) NOT NULL DEFAULT 0,
  total_deductions NUMERIC(16,2) NOT NULL DEFAULT 0,
  total_net       NUMERIC(16,2) NOT NULL DEFAULT 0,
  employee_count  INTEGER       NOT NULL DEFAULT 0,
  run_by          UUID          NOT NULL REFERENCES sys.users(id),
  approved_by     UUID          REFERENCES sys.users(id),
  approved_at     TIMESTAMPTZ,
  disbursed_at    TIMESTAMPTZ,
  gl_entry_id     UUID          REFERENCES fin.gl_entries(id),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (period_month, period_year),
  CONSTRAINT chk_no_future_payroll CHECK (
    make_date(period_year, period_month, 28) <= CURRENT_DATE + INTERVAL '31 days'
  )
);
CREATE TRIGGER trg_payroll_upd BEFORE UPDATE ON hr.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();

-- Payroll entries (one per employee per run)
CREATE TABLE hr.payroll_entries (
  id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id         UUID          NOT NULL REFERENCES hr.payroll_runs(id),
  employee_id            UUID          NOT NULL REFERENCES hr.employees(id),
  basic_salary           NUMERIC(12,2) NOT NULL,
  gross_pay              NUMERIC(12,2) NOT NULL,
  total_deductions       NUMERIC(12,2) NOT NULL,
  net_pay                NUMERIC(12,2) NOT NULL,
  lop_days               NUMERIC(4,2)  NOT NULL DEFAULT 0,
  overtime_hours         NUMERIC(5,2)  NOT NULL DEFAULT 0,
  pf_employee            NUMERIC(10,2) NOT NULL DEFAULT 0,
  pf_employer            NUMERIC(10,2) NOT NULL DEFAULT 0,
  tds_amount             NUMERIC(10,2) NOT NULL DEFAULT 0,
  festival_bonus         NUMERIC(10,2) NOT NULL DEFAULT 0,
  -- Full component breakdown for payslip rendering
  components             JSONB         NOT NULL DEFAULT '[]',
  -- Encrypted bank account snapshot at disbursement time
  bank_account_snapshot  BYTEA,
  disburse_status        TEXT          NOT NULL DEFAULT 'pending'
                           CHECK (disburse_status IN ('pending','disbursed','failed','hold')),
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (payroll_run_id, employee_id)
);
CREATE INDEX idx_payroll_entries_run ON hr.payroll_entries(payroll_run_id);
CREATE INDEX idx_payroll_entries_emp ON hr.payroll_entries(employee_id);

-- PF accounts and ledger
CREATE TABLE hr.pf_accounts (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID          NOT NULL UNIQUE REFERENCES hr.employees(id),
  employee_pct    NUMERIC(5,2)  NOT NULL DEFAULT 10,
  employer_pct    NUMERIC(5,2)  NOT NULL DEFAULT 10,
  enrolled_date   DATE          NOT NULL,
  balance         NUMERIC(14,2) NOT NULL DEFAULT 0,
  status          TEXT          NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','suspended','settled'))
);

CREATE TABLE hr.pf_transactions (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  pf_account_id   UUID          NOT NULL REFERENCES hr.pf_accounts(id),
  txn_type        TEXT          NOT NULL CHECK (txn_type IN
                    ('employee_contrib','employer_contrib','interest','withdrawal','settlement')),
  period_month    SMALLINT,
  period_year     SMALLINT,
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  direction       SMALLINT      NOT NULL CHECK (direction IN (1,-1)),
  balance_after   NUMERIC(14,2) NOT NULL,
  payroll_run_id  UUID          REFERENCES hr.payroll_runs(id),
  gl_entry_id     UUID          REFERENCES fin.gl_entries(id),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_pf_txn_acct ON hr.pf_transactions(pf_account_id, created_at DESC);

-- Gratuity provisions (monthly accrual per employee)
CREATE TABLE hr.gratuity_provisions (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       UUID          NOT NULL REFERENCES hr.employees(id),
  as_of_date        DATE          NOT NULL,
  service_years     NUMERIC(5,2)  NOT NULL,
  last_basic        NUMERIC(12,2) NOT NULL,
  -- BD Labour Act: basic × 30/26 × completed years
  provision_amount  NUMERIC(14,2) NOT NULL,
  cumulative_amount NUMERIC(14,2) NOT NULL,
  period_charge     NUMERIC(12,2) NOT NULL,
  gl_entry_id       UUID          REFERENCES fin.gl_entries(id),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, as_of_date)
);
CREATE INDEX idx_gratuity_emp ON hr.gratuity_provisions(employee_id, as_of_date DESC);

-- Function: compute gratuity entitlement per BD Labour Act 2006
CREATE OR REPLACE FUNCTION hr.compute_gratuity(
  p_employee_id UUID,
  p_exit_date   DATE DEFAULT CURRENT_DATE
) RETURNS NUMERIC(14,2) LANGUAGE plpgsql AS $$
DECLARE
  v_join_date   DATE;
  v_basic       NUMERIC(12,2);
  v_years       NUMERIC(5,2);
  v_months      INTEGER;
BEGIN
  SELECT e.join_date, e.basic_salary INTO v_join_date, v_basic
  FROM hr.employees e WHERE e.id = p_employee_id;
  v_months := (DATE_PART('year', age(p_exit_date, v_join_date)) * 12
               + DATE_PART('month', age(p_exit_date, v_join_date)))::INTEGER;
  -- Per Act: < 6 months fractional year ignored; >= 6 months rounds to 1 full year
  v_years := TRUNC(v_months / 12.0) + CASE WHEN (v_months % 12) >= 6 THEN 1 ELSE 0 END;
  IF v_years < 1 THEN RETURN 0; END IF;
  RETURN ROUND(v_basic * (30.0 / 26.0) * v_years, 2);
END;
$$;

-- Expense claims
CREATE TABLE hr.expense_claims (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id    UUID    NOT NULL REFERENCES hr.employees(id),
  claim_date     DATE    NOT NULL DEFAULT CURRENT_DATE,
  title          TEXT    NOT NULL,
  total_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  status         TEXT    NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','submitted','manager_approved','finance_approved',
                                     'reimbursed','rejected','cancelled')),
  reimburse_via  TEXT    NOT NULL DEFAULT 'payroll'
                   CHECK (reimburse_via IN ('payroll','direct_transfer')),
  payroll_run_id UUID    REFERENCES hr.payroll_runs(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_expense_upd BEFORE UPDATE ON hr.expense_claims
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();

CREATE TABLE hr.expense_lines (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id     UUID          NOT NULL REFERENCES hr.expense_claims(id) ON DELETE CASCADE,
  category     TEXT          NOT NULL,
  description  TEXT,
  amount       NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  receipt_url  TEXT,
  expense_date DATE          NOT NULL,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Salary advances
CREATE TABLE hr.salary_advances (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id    UUID          NOT NULL REFERENCES hr.employees(id),
  request_date   DATE          NOT NULL DEFAULT CURRENT_DATE,
  amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reason         TEXT,
  recovery_months SMALLINT     NOT NULL DEFAULT 3,
  status         TEXT          NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','approved','rejected','settled')),
  approved_by    UUID          REFERENCES sys.users(id),
  approved_at    TIMESTAMPTZ,
  recovered_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_advance_upd BEFORE UPDATE ON hr.salary_advances
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();

-- ================================================================
-- SCHEMA: brd  (board governance)
-- ================================================================

CREATE TABLE brd.directors (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name           TEXT    NOT NULL,
  father_name         TEXT,
  din                 TEXT    UNIQUE,   -- RJSC Director Identification Number
  nid_encrypted       BYTEA,
  passport_encrypted  BYTEA,
  date_of_birth       DATE,
  nationality         TEXT    NOT NULL DEFAULT 'Bangladeshi',
  address             TEXT,
  email               TEXT,
  phone               TEXT,
  designation         TEXT    NOT NULL CHECK (designation IN
                        ('chairman','managing_director','executive_director',
                         'independent_director','nominee_director','non_executive_director')),
  appointment_date    DATE    NOT NULL,
  tenure_years        SMALLINT,
  resignation_date    DATE,
  status              TEXT    NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','resigned','removed','deceased')),
  qualification_shares INTEGER NOT NULL DEFAULT 0,
  employee_id         UUID    REFERENCES hr.employees(id),   -- if also a staff member
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          UUID    NOT NULL REFERENCES sys.users(id)
);
CREATE TRIGGER trg_director_upd BEFORE UPDATE ON brd.directors
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();

CREATE TABLE brd.shareholders (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  shareholder_type TEXT    NOT NULL CHECK (shareholder_type IN ('individual','corporate')),
  name             TEXT    NOT NULL,
  nid_or_reg       TEXT,
  address          TEXT,
  email            TEXT,
  phone            TEXT,
  director_id      UUID    REFERENCES brd.directors(id),
  is_nominee       BOOLEAN NOT NULL DEFAULT FALSE,
  beneficial_owner TEXT,   -- if nominee, actual owner name
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Share transactions (append-only)
CREATE TABLE brd.share_transactions (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  txn_type          TEXT    NOT NULL CHECK (txn_type IN ('allotment','transfer','buyback','bonus')),
  txn_date          DATE    NOT NULL,
  from_shareholder  UUID    REFERENCES brd.shareholders(id),   -- NULL for allotment
  to_shareholder    UUID    NOT NULL REFERENCES brd.shareholders(id),
  shares            INTEGER NOT NULL CHECK (shares > 0),
  price_per_share   NUMERIC(12,4),
  consideration     NUMERIC(14,2) GENERATED ALWAYS AS
                      (CASE WHEN price_per_share IS NOT NULL THEN shares * price_per_share END) STORED,
  resolution_id     UUID,   -- FK to brd.resolutions (added after)
  approved_by       UUID    NOT NULL REFERENCES sys.users(id),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_share_txn_to ON brd.share_transactions(to_shareholder, txn_date DESC);

-- Share certificates
CREATE TABLE brd.share_certificates (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  cert_number      TEXT    NOT NULL UNIQUE,
  shareholder_id   UUID    NOT NULL REFERENCES brd.shareholders(id),
  shares           INTEGER NOT NULL CHECK (shares > 0),
  issue_date       DATE    NOT NULL,
  cancelled_date   DATE,
  status           TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Board meetings
CREATE TABLE brd.board_meetings (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_type   TEXT    NOT NULL CHECK (meeting_type IN ('regular','special','circular')),
  scheduled_at   TIMESTAMPTZ NOT NULL,
  venue          TEXT,
  video_link     TEXT,
  quorum_required SMALLINT NOT NULL DEFAULT 2,
  status         TEXT    NOT NULL DEFAULT 'scheduled'
                   CHECK (status IN ('scheduled','held','adjourned','cancelled','inquorate')),
  minutes_signed BOOLEAN NOT NULL DEFAULT FALSE,
  signed_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by     UUID    NOT NULL REFERENCES sys.users(id)
);
CREATE TRIGGER trg_meeting_upd BEFORE UPDATE ON brd.board_meetings
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();

CREATE TABLE brd.meeting_agenda (
  id           UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id   UUID     NOT NULL REFERENCES brd.board_meetings(id) ON DELETE CASCADE,
  sequence     SMALLINT NOT NULL,
  title        TEXT     NOT NULL,
  description  TEXT,
  presenter    TEXT,
  time_minutes SMALLINT,
  UNIQUE (meeting_id, sequence)
);

CREATE TABLE brd.meeting_attendees (
  id          UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id  UUID     NOT NULL REFERENCES brd.board_meetings(id) ON DELETE CASCADE,
  director_id UUID     NOT NULL REFERENCES brd.directors(id),
  attendance  TEXT     NOT NULL DEFAULT 'present'
                CHECK (attendance IN ('present','video','absent','leave_of_absence')),
  UNIQUE (meeting_id, director_id)
);

-- Resolution register (append-only after approval)
CREATE TABLE brd.resolutions (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  resolution_number TEXT   NOT NULL UNIQUE DEFAULT sys.next_doc_number('resolution'),
  meeting_id       UUID    REFERENCES brd.board_meetings(id),   -- NULL for circular
  agenda_id        UUID    REFERENCES brd.meeting_agenda(id),
  resolution_date  DATE    NOT NULL,
  resolution_type  TEXT    NOT NULL CHECK (resolution_type IN ('ordinary','special','circular')),
  category         TEXT    NOT NULL CHECK (category IN
                     ('financial','appointment','policy','contract','regulatory',
                      'dividend','share','other')),
  title            TEXT    NOT NULL,
  resolution_text  TEXT    NOT NULL,
  votes_for        SMALLINT NOT NULL DEFAULT 0,
  votes_against    SMALLINT NOT NULL DEFAULT 0,
  votes_abstained  SMALLINT NOT NULL DEFAULT 0,
  outcome          TEXT    NOT NULL DEFAULT 'passed'
                     CHECK (outcome IN ('passed','failed','deferred','withdrawn')),
  signed_at        TIMESTAMPTZ,
  sha256_hash      TEXT,   -- tamper-proof hash of signed document
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by       UUID    NOT NULL REFERENCES sys.users(id)
);
-- After resolutions table, add FK for share_transactions
ALTER TABLE brd.share_transactions ADD CONSTRAINT fk_stxn_resolution
  FOREIGN KEY (resolution_id) REFERENCES brd.resolutions(id);

-- AGMs / EGMs
CREATE TABLE brd.agms (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_type    TEXT    NOT NULL CHECK (meeting_type IN ('agm','egm')),
  financial_year  SMALLINT NOT NULL,
  meeting_date    TIMESTAMPTZ NOT NULL,
  venue           TEXT,
  notice_sent_at  TIMESTAMPTZ,
  status          TEXT    NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled','held','adjourned','cancelled')),
  minutes_url     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID    NOT NULL REFERENCES sys.users(id)
);
CREATE TRIGGER trg_agm_upd BEFORE UPDATE ON brd.agms
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();

CREATE TABLE brd.agm_proxies (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  agm_id          UUID    NOT NULL REFERENCES brd.agms(id),
  shareholder_id  UUID    NOT NULL REFERENCES brd.shareholders(id),
  proxy_holder    TEXT    NOT NULL,
  shares_represented INTEGER NOT NULL,
  proxy_date      DATE    NOT NULL,
  UNIQUE (agm_id, shareholder_id)
);

-- Dividends
CREATE TABLE brd.dividends (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_year   SMALLINT      NOT NULL,
  dividend_type    TEXT          NOT NULL CHECK (dividend_type IN ('interim','final')),
  declaration_date DATE          NOT NULL,
  record_date      DATE          NOT NULL,
  payment_date     DATE          NOT NULL,
  rate_per_share   NUMERIC(10,4) NOT NULL,
  total_dividend   NUMERIC(16,2) NOT NULL,
  withholding_tax_pct NUMERIC(5,2) NOT NULL DEFAULT 10,
  status           TEXT          NOT NULL DEFAULT 'declared'
                     CHECK (status IN ('declared','approved','paid')),
  resolution_id    UUID          REFERENCES brd.resolutions(id),
  gl_entry_id      UUID          REFERENCES fin.gl_entries(id),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_by       UUID          NOT NULL REFERENCES sys.users(id)
);

CREATE TABLE brd.dividend_payments (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  dividend_id     UUID          NOT NULL REFERENCES brd.dividends(id),
  shareholder_id  UUID          NOT NULL REFERENCES brd.shareholders(id),
  shares_held     INTEGER       NOT NULL,
  gross_amount    NUMERIC(12,2) NOT NULL,
  tax_deducted    NUMERIC(10,2) NOT NULL DEFAULT 0,
  net_amount      NUMERIC(12,2) NOT NULL,
  payment_status  TEXT          NOT NULL DEFAULT 'pending'
                    CHECK (payment_status IN ('pending','paid','unclaimed')),
  paid_at         TIMESTAMPTZ,
  UNIQUE (dividend_id, shareholder_id)
);

-- Related party register
CREATE TABLE brd.related_parties (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT    NOT NULL,
  relationship    TEXT    NOT NULL,   -- 'director','director_relative','director_company'
  director_id     UUID    REFERENCES brd.directors(id),
  entity_type     TEXT    NOT NULL CHECK (entity_type IN ('individual','company')),
  notes           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- MATERIALIZED VIEWS
-- ================================================================

-- Current shareholding percentages
CREATE MATERIALIZED VIEW brd.current_shareholding AS
SELECT
  s.id                                                AS shareholder_id,
  s.name,
  s.shareholder_type,
  COALESCE(allot.total_allotted, 0)
    - COALESCE(trans_out.total_transferred, 0)
    + COALESCE(trans_in.total_received, 0)            AS shares_held,
  ROUND(
    (COALESCE(allot.total_allotted, 0)
     - COALESCE(trans_out.total_transferred, 0)
     + COALESCE(trans_in.total_received, 0))::NUMERIC
    / NULLIF((SELECT SUM(st2.shares) FROM brd.share_transactions st2
               WHERE st2.txn_type = 'allotment'), 0) * 100, 4)  AS pct_held
FROM brd.shareholders s
LEFT JOIN (
  SELECT to_shareholder, SUM(shares) AS total_allotted
  FROM brd.share_transactions WHERE txn_type = 'allotment' GROUP BY to_shareholder
) allot ON allot.to_shareholder = s.id
LEFT JOIN (
  SELECT from_shareholder, SUM(shares) AS total_transferred
  FROM brd.share_transactions WHERE txn_type = 'transfer' GROUP BY from_shareholder
) trans_out ON trans_out.from_shareholder = s.id
LEFT JOIN (
  SELECT to_shareholder, SUM(shares) AS total_received
  FROM brd.share_transactions WHERE txn_type = 'transfer' GROUP BY to_shareholder
) trans_in ON trans_in.to_shareholder = s.id
WHERE s.is_active = TRUE;

CREATE UNIQUE INDEX idx_mv_shareholding ON brd.current_shareholding(shareholder_id);

-- Inventory summary across all warehouses
CREATE MATERIALIZED VIEW inv.stock_summary AS
SELECT
  i.id            AS item_id,
  i.item_code,
  i.name,
  i.category,
  i.uom,
  i.reorder_level,
  COALESCE(SUM(b.quantity), 0)                AS total_qty,
  COALESCE(SUM(b.quantity * b.avg_cost), 0)   AS total_value,
  COALESCE(SUM(b.avg_cost) / NULLIF(COUNT(b.*), 0), 0) AS avg_unit_cost,
  CASE WHEN COALESCE(SUM(b.quantity), 0) <= i.reorder_level
       THEN TRUE ELSE FALSE END                AS below_reorder
FROM inv.stock_items i
LEFT JOIN inv.stock_balances b ON b.item_id = i.id
WHERE i.is_active = TRUE
GROUP BY i.id, i.item_code, i.name, i.category, i.uom, i.reorder_level;

CREATE UNIQUE INDEX idx_mv_stock ON inv.stock_summary(item_id);

-- ================================================================
-- KEY REMAINING INDEXES
-- ================================================================

-- Procurement
CREATE INDEX idx_grn_po          ON prc.goods_receipts(po_id);
CREATE INDEX idx_gr_lines_po_ln  ON prc.gr_lines(po_line_id);
CREATE INDEX idx_po_lines_item   ON prc.po_lines(item_id);

-- BOM
CREATE INDEX idx_bom_lines_item  ON mfg.bom_lines(item_id);

-- Finance
CREATE INDEX idx_fa_category     ON fin.fixed_assets(category_id);
CREATE INDEX idx_fa_dept         ON fin.fixed_assets(department_id);
CREATE INDEX idx_budget_lines_bgt ON fin.budget_lines(budget_id, period_month);
CREATE INDEX idx_dc_order        ON fin.delivery_challans(order_id);
CREATE INDEX idx_binv_due        ON fin.buyer_invoices(due_date) WHERE status != 'paid';

-- HR
CREATE INDEX idx_emp_events_emp  ON hr.employment_events(employee_id, effective_date DESC);
CREATE INDEX idx_leave_req_status ON hr.leave_requests(status) WHERE status = 'pending';
CREATE INDEX idx_gratuity_emp    ON hr.gratuity_provisions(employee_id, as_of_date DESC);
CREATE INDEX idx_pf_acct_emp     ON hr.pf_accounts(employee_id);

-- Board
CREATE INDEX idx_meetings_status ON brd.board_meetings(status, scheduled_at);
CREATE INDEX idx_res_date        ON brd.resolutions(resolution_date DESC);
CREATE INDEX idx_div_pmt_div     ON brd.dividend_payments(dividend_id);

-- ================================================================
-- FULL TEXT SEARCH INDEXES (trigram)
-- ================================================================
CREATE INDEX idx_articles_desc_trgm  ON ord.articles    USING GIN (description gin_trgm_ops);
CREATE INDEX idx_stock_items_trgm    ON inv.stock_items  USING GIN (name gin_trgm_ops);
CREATE INDEX idx_directors_name_trgm ON brd.directors    USING GIN (full_name gin_trgm_ops);
CREATE INDEX idx_shareholders_trgm   ON brd.shareholders USING GIN (name gin_trgm_ops);

-- ================================================================
-- INITIAL SEED DATA
-- ================================================================

-- System roles
INSERT INTO sys.roles (name, description, is_system) VALUES
  ('super_admin',        'Full system access',              TRUE),
  ('md',                 'Managing Director',               TRUE),
  ('finance_manager',    'Finance & Accounts',              TRUE),
  ('hr_manager',         'HR & Payroll',                    TRUE),
  ('factory_manager',    'Production & Operations',         TRUE),
  ('procurement_manager','Procurement',                     TRUE),
  ('store_officer',      'Inventory & Warehouse',           TRUE),
  ('order_manager',      'Order Management',                TRUE),
  ('company_secretary',  'Board & Corporate Governance',    TRUE),
  ('employee_ess',       'Employee Self-Service only',      TRUE),
  ('manager_mss',        'Manager Self-Service',            TRUE),
  ('it_admin',           'System Administration',           TRUE);

-- Leave types (Bangladesh standard)
INSERT INTO hr.leave_types (code, name, is_paid, accrual_type, annual_entitlement,
  carry_forward_limit, is_encashable, min_advance_days) VALUES
  ('CL',  'Casual Leave',     TRUE,  'annual', 10,  0,  FALSE, 0),
  ('SL',  'Sick Leave',       TRUE,  'annual', 14,  0,  FALSE, 0),
  ('EL',  'Earned Leave',     TRUE,  'annual', 18,  18, TRUE,  7),
  ('ML',  'Maternity Leave',  TRUE,  'none',   112, 0,  FALSE, 30),
  ('PL',  'Paternity Leave',  TRUE,  'none',   3,   0,  FALSE, 0),
  ('UL',  'Unpaid Leave',     FALSE, 'none',   0,   0,  FALSE, 1),
  ('BL',  'Bereavement Leave',TRUE,  'none',   3,   0,  FALSE, 0),
  ('CO',  'Comp-Off',         TRUE,  'none',   0,   90, FALSE, 0);

-- Asset categories
INSERT INTO fin.asset_categories (name, depreciation_method, useful_life_years,
  depreciation_rate, salvage_pct, gl_asset_account, gl_depreciation_account, gl_accum_dep_account)
SELECT 'Machinery & Equipment', 'diminishing_balance', 10, 0.15, 5,
  coa_a.id, coa_d.id, coa_ad.id
FROM fin.chart_of_accounts coa_a, fin.chart_of_accounts coa_d, fin.chart_of_accounts coa_ad
WHERE coa_a.account_code = '1210' AND coa_d.account_code = '6110' AND coa_ad.account_code = '1211'
LIMIT 1;   -- Only inserts if accounts exist; harmless if not

-- ================================================================
-- END OF SCHEMA
-- ================================================================
