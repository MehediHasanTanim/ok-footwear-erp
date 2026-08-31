-- Sprint 12–13: HR core, leave, attendance (partitioned), PF, gratuity, compute_gratuity().
-- Replaces stub hr.employees from baseline migration.

-- ---------------------------------------------------------------------------
-- 1. HR core — departments, designations, employees, secrets, events
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hr.departments (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  parent_id   UUID    REFERENCES hr.departments(id),
  head_id     UUID,
  cost_center TEXT,
  location    TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_dept_upd BEFORE UPDATE ON hr.departments
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();

CREATE TABLE IF NOT EXISTS hr.designations (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code      TEXT NOT NULL UNIQUE,
  title     TEXT NOT NULL,
  level     TEXT NOT NULL CHECK (level IN ('junior','mid','senior','lead','manager','director'))
);

DROP TABLE IF EXISTS hr.employees CASCADE;

CREATE TABLE hr.employees (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code        TEXT         NOT NULL UNIQUE,
  full_name            TEXT         NOT NULL,
  email                TEXT,
  phone                TEXT,
  date_of_birth        DATE         NOT NULL,
  gender               CHAR(1)      NOT NULL CHECK (gender IN ('M','F','O')),
  nationality          TEXT         NOT NULL DEFAULT 'Bangladeshi',
  religion             TEXT,
  marital_status       TEXT         CHECK (marital_status IN ('single','married','divorced','widowed')),
  join_date            DATE         NOT NULL,
  confirmation_date    DATE,
  department_id        UUID         NOT NULL REFERENCES hr.departments(id),
  designation_id       UUID         REFERENCES hr.designations(id),
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

ALTER TABLE hr.departments DROP CONSTRAINT IF EXISTS fk_dept_head;
ALTER TABLE hr.departments ADD CONSTRAINT fk_dept_head
  FOREIGN KEY (head_id) REFERENCES hr.employees(id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_employee'
  ) THEN
    ALTER TABLE sys.users ADD CONSTRAINT fk_users_employee
      FOREIGN KEY (employee_id) REFERENCES hr.employees(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_gl_department'
  ) THEN
    ALTER TABLE fin.gl_entry_lines ADD CONSTRAINT fk_gl_department
      FOREIGN KEY (department_id) REFERENCES hr.departments(id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS hr.employee_secrets (
  employee_id            UUID  PRIMARY KEY REFERENCES hr.employees(id) ON DELETE CASCADE,
  nid_encrypted          BYTEA,
  passport_encrypted     BYTEA,
  bank_account_encrypted BYTEA,
  bank_name              TEXT,
  bank_branch            TEXT,
  routing_number         TEXT,
  emergency_contact      JSONB,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hr.employment_events (
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
CREATE INDEX IF NOT EXISTS idx_emp_events ON hr.employment_events(employee_id, effective_date DESC);

-- ---------------------------------------------------------------------------
-- 2. Leave
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hr.leave_types (
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

CREATE TABLE IF NOT EXISTS hr.leave_policies (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_type_id           UUID NOT NULL REFERENCES hr.leave_types(id) ON DELETE CASCADE,
  department_id           UUID REFERENCES hr.departments(id),
  employee_category       TEXT CHECK (employee_category IN ('office','factory')),
  annual_override         NUMERIC(5,2),
  carry_forward_override  NUMERIC(5,2),
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (leave_type_id, department_id, employee_category)
);

CREATE TABLE IF NOT EXISTS hr.leave_balances (
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
CREATE INDEX IF NOT EXISTS idx_leave_bal_emp ON hr.leave_balances(employee_id, year);

CREATE TABLE IF NOT EXISTS hr.leave_requests (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id         UUID        NOT NULL REFERENCES hr.employees(id),
  leave_type_id       UUID        NOT NULL REFERENCES hr.leave_types(id),
  start_date          DATE        NOT NULL,
  end_date            DATE        NOT NULL,
  half_day            TEXT        CHECK (half_day IN ('morning','afternoon')),
  total_days          NUMERIC(5,2) NOT NULL,
  reason              TEXT,
  status              TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','manager_approved','hr_approved','rejected','cancelled')),
  manager_id          UUID        REFERENCES sys.users(id),
  manager_decision_at TIMESTAMPTZ,
  hr_decision_at      TIMESTAMPTZ,
  rejection_reason    TEXT,
  document_url        TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_leave_dates CHECK (end_date >= start_date)
);
CREATE TRIGGER trg_leave_req_upd BEFORE UPDATE ON hr.leave_requests
  FOR EACH ROW EXECUTE FUNCTION sys.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_leave_req_emp ON hr.leave_requests(employee_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_leave_req_pending ON hr.leave_requests(status) WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- 3. Attendance (yearly partition) + sync log + manual corrections
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hr.attendance_records (
  id                UUID        NOT NULL DEFAULT gen_random_uuid(),
  employee_id       UUID        NOT NULL REFERENCES hr.employees(id),
  check_date        DATE        NOT NULL,
  clock_in          TIMESTAMPTZ,
  clock_out         TIMESTAMPTZ,
  source            TEXT        NOT NULL DEFAULT 'web'
                      CHECK (source IN ('web','biometric','manual')),
  status            TEXT        NOT NULL DEFAULT 'present'
                      CHECK (status IN ('present','absent','late','half_day','on_leave','holiday')),
  late_minutes      SMALLINT    NOT NULL DEFAULT 0,
  overtime_hrs      NUMERIC(4,2) NOT NULL DEFAULT 0,
  lop_days          NUMERIC(3,2) NOT NULL DEFAULT 0,
  corrected_by      UUID        REFERENCES sys.users(id),
  correction_reason TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, check_date)
) PARTITION BY RANGE (check_date);

CREATE TABLE IF NOT EXISTS hr.attendance_2025 PARTITION OF hr.attendance_records
  FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
CREATE TABLE IF NOT EXISTS hr.attendance_2026 PARTITION OF hr.attendance_records
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
CREATE TABLE IF NOT EXISTS hr.attendance_2027 PARTITION OF hr.attendance_records
  FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');

CREATE UNIQUE INDEX IF NOT EXISTS idx_att_emp_date ON hr.attendance_records(employee_id, check_date);
CREATE INDEX IF NOT EXISTS idx_att_date ON hr.attendance_records(check_date);

CREATE TABLE IF NOT EXISTS hr.biometric_sync_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id           TEXT,
  sync_started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sync_completed_at   TIMESTAMPTZ,
  records_upserted    INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'running'
                        CHECK (status IN ('running','completed','failed')),
  error_message       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hr.manual_corrections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID NOT NULL REFERENCES hr.employees(id),
  check_date    DATE NOT NULL,
  attendance_id UUID,
  old_clock_in  TIMESTAMPTZ,
  old_clock_out TIMESTAMPTZ,
  new_clock_in  TIMESTAMPTZ,
  new_clock_out TIMESTAMPTZ,
  reason        TEXT NOT NULL,
  corrected_by  UUID NOT NULL REFERENCES sys.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_manual_corr_emp ON hr.manual_corrections(employee_id, check_date DESC);

-- ---------------------------------------------------------------------------
-- 4. PF + gratuity
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hr.pf_accounts (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID          NOT NULL UNIQUE REFERENCES hr.employees(id),
  employee_pct    NUMERIC(5,2)  NOT NULL DEFAULT 10,
  employer_pct    NUMERIC(5,2)  NOT NULL DEFAULT 10,
  enrolled_date   DATE          NOT NULL,
  balance         NUMERIC(14,2) NOT NULL DEFAULT 0,
  status          TEXT          NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','suspended','settled'))
);

CREATE TABLE IF NOT EXISTS hr.pf_transactions (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  pf_account_id   UUID          NOT NULL REFERENCES hr.pf_accounts(id),
  txn_type        TEXT          NOT NULL CHECK (txn_type IN
                    ('employee_contrib','employer_contrib','interest','withdrawal','settlement')),
  period_month    SMALLINT,
  period_year     SMALLINT,
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  direction       SMALLINT      NOT NULL CHECK (direction IN (1,-1)),
  balance_after   NUMERIC(14,2) NOT NULL,
  payroll_run_id  UUID,
  gl_entry_id     UUID          REFERENCES fin.gl_entries(id),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pf_txn_acct ON hr.pf_transactions(pf_account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS hr.gratuity_provisions (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       UUID          NOT NULL REFERENCES hr.employees(id),
  as_of_date        DATE          NOT NULL,
  service_years     NUMERIC(5,2)  NOT NULL,
  last_basic        NUMERIC(12,2) NOT NULL,
  provision_amount  NUMERIC(14,2) NOT NULL,
  cumulative_amount NUMERIC(14,2) NOT NULL,
  period_charge     NUMERIC(12,2) NOT NULL,
  gl_entry_id       UUID          REFERENCES fin.gl_entries(id),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, as_of_date)
);
CREATE INDEX IF NOT EXISTS idx_gratuity_emp ON hr.gratuity_provisions(employee_id, as_of_date DESC);

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
  FROM hr.employees e WHERE e.id = p_employee_id AND e.deleted_at IS NULL;
  IF v_join_date IS NULL THEN
    RETURN 0;
  END IF;
  v_months := (DATE_PART('year', age(p_exit_date, v_join_date)) * 12
               + DATE_PART('month', age(p_exit_date, v_join_date)))::INTEGER;
  v_years := TRUNC(v_months / 12.0) + CASE WHEN (v_months % 12) >= 6 THEN 1 ELSE 0 END;
  IF v_years < 1 THEN RETURN 0; END IF;
  RETURN ROUND(v_basic * (30.0 / 26.0) * v_years, 2);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. CoA seed for gratuity + PF
-- ---------------------------------------------------------------------------

INSERT INTO fin.chart_of_accounts (
  id, account_code, name, account_type, account_class, is_control, currency, is_active,
  created_at, updated_at
) VALUES
  ('a2200000-0000-4000-8000-000000002200', '2200', 'Gratuity Provision Payable',
   'LIABILITY', 'current_liability', FALSE, 'BDT', TRUE, NOW(), NOW()),
  ('a2110000-0000-4000-8000-000000002110', '2110', 'PF Payable',
   'LIABILITY', 'current_liability', FALSE, 'BDT', TRUE, NOW(), NOW()),
  ('a5200000-0000-4000-8000-000000005200', '5200', 'Gratuity Expense',
   'EXPENSE', 'operating_expense', FALSE, 'BDT', TRUE, NOW(), NOW())
ON CONFLICT (account_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. HR permissions
-- ---------------------------------------------------------------------------

INSERT INTO sys.permissions (id, module, action, description, created_at)
VALUES
  (gen_random_uuid(), 'hr', 'read', 'View HR records', NOW()),
  (gen_random_uuid(), 'hr', 'create', 'Create HR records', NOW()),
  (gen_random_uuid(), 'hr', 'update', 'Update HR records', NOW()),
  (gen_random_uuid(), 'hr', 'delete', 'Delete HR records', NOW()),
  (gen_random_uuid(), 'hr', 'approve', 'Approve HR workflows and reveal PII', NOW())
ON CONFLICT (module, action) DO NOTHING;
