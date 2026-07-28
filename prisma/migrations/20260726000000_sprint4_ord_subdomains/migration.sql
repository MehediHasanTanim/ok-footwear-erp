-- =============================================================================
-- Sprint 4 · Orders Sub-domains: Quotations, Samples, Complaints, CAPA Actions
-- =============================================================================
-- Adds 4 new tables to ord schema + associated enums.
-- Non-destructive: only CREATE TYPE / CREATE TABLE / CREATE INDEX.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enum types
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE ord."QuotationStatus" AS ENUM ('draft', 'sent', 'won', 'lost');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ord."SampleType" AS ENUM ('PP', 'counter', 'size_set', 'TOP');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ord."ApprovalStatus" AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ord."ComplaintType" AS ENUM ('quality', 'delivery', 'packaging', 'documentation', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ord."Severity" AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ord."ComplaintStatus" AS ENUM ('open', 'under_investigation', 'resolved');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ord."CapaActionStatus" AS ENUM ('open', 'in_progress', 'done');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2. ord.quotations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ord.quotations (
  id                UUID        NOT NULL DEFAULT gen_random_uuid(),
  quotation_number  VARCHAR(20) NOT NULL,
  order_id          UUID        NOT NULL,
  status            ord."QuotationStatus" NOT NULL DEFAULT 'draft',
  bom_version_id    UUID,
  win_probability   DECIMAL(5,2),
  outcome_reason    TEXT,
  cost_breakdown    JSONB,
  total_cost        DECIMAL(15,2),
  quoted_price      DECIMAL(15,2),
  currency          CHAR(3)     NOT NULL,
  sent_at           TIMESTAMPTZ,
  closed_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT quotations_pkey PRIMARY KEY (id),
  CONSTRAINT quotations_quotation_number_key UNIQUE (quotation_number),
  CONSTRAINT quotations_order_id_fkey FOREIGN KEY (order_id)
    REFERENCES ord.orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_quotations_order_id ON ord.quotations(order_id);

-- ---------------------------------------------------------------------------
-- 3. ord.samples
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ord.samples (
  id              UUID        NOT NULL DEFAULT gen_random_uuid(),
  order_id        UUID        NOT NULL,
  round_number    INTEGER     NOT NULL,
  sample_type     ord."SampleType" NOT NULL,
  dispatch_date   DATE,
  received_date   DATE,
  approval_status ord."ApprovalStatus" NOT NULL DEFAULT 'pending',
  approved_by     UUID,
  approved_at     TIMESTAMPTZ,
  remarks         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT samples_pkey PRIMARY KEY (id),
  CONSTRAINT samples_order_round_type_unique UNIQUE (order_id, round_number, sample_type),
  CONSTRAINT samples_order_id_fkey FOREIGN KEY (order_id)
    REFERENCES ord.orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_samples_order_id ON ord.samples(order_id);

-- ---------------------------------------------------------------------------
-- 4. ord.complaints
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ord.complaints (
  id                UUID        NOT NULL DEFAULT gen_random_uuid(),
  complaint_number  VARCHAR(20) NOT NULL,
  order_id          UUID        NOT NULL,
  type              ord."ComplaintType" NOT NULL,
  severity          ord."Severity" NOT NULL,
  description       TEXT        NOT NULL,
  root_cause        TEXT,
  status            ord."ComplaintStatus" NOT NULL DEFAULT 'open',
  raised_by         UUID        NOT NULL,
  raised_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT complaints_pkey PRIMARY KEY (id),
  CONSTRAINT complaints_complaint_number_key UNIQUE (complaint_number),
  CONSTRAINT complaints_order_id_fkey FOREIGN KEY (order_id)
    REFERENCES ord.orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_complaints_order_id ON ord.complaints(order_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status_severity ON ord.complaints(status, severity);

-- ---------------------------------------------------------------------------
-- 5. ord.capa_actions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ord.capa_actions (
  id            UUID        NOT NULL DEFAULT gen_random_uuid(),
  complaint_id  UUID        NOT NULL,
  description   TEXT        NOT NULL,
  owner_id      UUID        NOT NULL,
  due_date      DATE        NOT NULL,
  status        ord."CapaActionStatus" NOT NULL DEFAULT 'open',
  closed_at     TIMESTAMPTZ,
  evidence      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT capa_actions_pkey PRIMARY KEY (id),
  CONSTRAINT capa_actions_complaint_id_fkey FOREIGN KEY (complaint_id)
    REFERENCES ord.complaints(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_capa_actions_complaint_id ON ord.capa_actions(complaint_id);
CREATE INDEX IF NOT EXISTS idx_capa_actions_owner_status ON ord.capa_actions(owner_id, status);

-- ---------------------------------------------------------------------------
-- 6. Seed QUO and CMP document sequence prefixes
-- ---------------------------------------------------------------------------

INSERT INTO sys.document_sequences (prefix, last_number, pad_length, separator)
VALUES ('QUO', 0, 6, '-')
ON CONFLICT (prefix) DO NOTHING;

INSERT INTO sys.document_sequences (prefix, last_number, pad_length, separator)
VALUES ('CMP', 0, 6, '-')
ON CONFLICT (prefix) DO NOTHING;
