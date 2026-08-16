// =============================================================================
// TC-DB-FIN-001…003 + TC-DB-CON-001…002 — fin.check_period_open + GL line CHECKs
// =============================================================================
// db push does not apply migration SQL — deploy partitions + trigger in beforeAll.
// =============================================================================

import { prisma } from '@test/helpers/integration-test-setup';

const USER_ID = 'a1111111-1111-4111-8111-111111111111';
const ACC_DR = 'a1200000-0000-4000-8000-000000001200';
const ACC_CR = 'a4100000-0000-4000-8000-000000004100';
const PERIOD_OPEN = 'b1000000-0000-4000-8000-000000000001';
const PERIOD_CLOSED = 'b2000000-0000-4000-8000-000000000002';
const PERIOD_LOCKED = 'b3000000-0000-4000-8000-000000000003';

async function ensureFinLedger(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS fin.gl_periods (
      id            UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
      period_year   SMALLINT NOT NULL,
      period_month  SMALLINT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
      status        TEXT     NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','closed','locked')),
      closed_by     UUID,
      closed_at     TIMESTAMPTZ,
      UNIQUE (period_year, period_month)
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS fin.gl_entries (
      id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      entry_number   TEXT        NOT NULL UNIQUE,
      period_id      UUID        NOT NULL REFERENCES fin.gl_periods(id),
      entry_date     DATE        NOT NULL,
      entry_type     TEXT        NOT NULL DEFAULT 'manual',
      source_module  TEXT,
      source_id      UUID,
      narration      TEXT        NOT NULL,
      status         TEXT        NOT NULL DEFAULT 'draft',
      reversal_of    UUID,
      posted_at      TIMESTAMPTZ,
      posted_by      UUID,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by     UUID        NOT NULL
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS fin.gl_entry_lines (
      id            UUID          NOT NULL DEFAULT gen_random_uuid(),
      gl_entry_id   UUID          NOT NULL REFERENCES fin.gl_entries(id),
      account_id    UUID          NOT NULL,
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
  `);

  for (const [y, n] of [
    ['2025', '2026'],
    ['2026', '2027'],
    ['2027', '2028'],
  ] as const) {
    await prisma
      .$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS fin.gl_entry_lines_${y}
         PARTITION OF fin.gl_entry_lines
         FOR VALUES FROM ('${y}-01-01') TO ('${n}-01-01')`,
      )
      .catch(() => undefined);
  }

  // Ensure named CHECK constraints exist when table came from an older push
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE fin.gl_entry_lines
        ADD CONSTRAINT chk_gl_debit_credit CHECK (
          (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
        );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE fin.gl_entry_lines
        ADD CONSTRAINT chk_gl_nonzero CHECK (debit + credit > 0);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
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
  `);

  await prisma.$executeRawUnsafe(`
    DROP TRIGGER IF EXISTS trg_gl_period_check ON fin.gl_entry_lines;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER trg_gl_period_check BEFORE INSERT ON fin.gl_entry_lines
      FOR EACH ROW EXECUTE FUNCTION fin.check_period_open();
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO sys.document_sequences (prefix, last_number, pad_length, separator)
    VALUES ('JV', 0, 6, '-')
    ON CONFLICT (prefix) DO NOTHING;
  `);
}

async function seedBase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO sys.users (id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
     VALUES ($1::uuid, 'fin-db@okfootwear.com', 'x', 'Fin', 'Db', true, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    USER_ID,
  );

  await prisma.chartOfAccount.upsert({
    where: { accountCode: '1200' },
    create: {
      id: ACC_DR,
      accountCode: '1200',
      name: 'Trade Receivables',
      accountType: 'ASSET',
      accountClass: 'current_asset',
      isControl: true,
    },
    update: { isActive: true },
  });

  await prisma.chartOfAccount.upsert({
    where: { accountCode: '4100' },
    create: {
      id: ACC_CR,
      accountCode: '4100',
      name: 'Sales Revenue',
      accountType: 'REVENUE',
      accountClass: 'operating_revenue',
    },
    update: { isActive: true },
  });

  for (const [id, year, month, status] of [
    [PERIOD_OPEN, 2026, 1, 'open'],
    [PERIOD_CLOSED, 2026, 2, 'closed'],
    [PERIOD_LOCKED, 2026, 3, 'locked'],
  ] as const) {
    await prisma.glPeriod.upsert({
      where: { periodYear_periodMonth: { periodYear: year, periodMonth: month } },
      create: {
        id,
        periodYear: year,
        periodMonth: month,
        status,
      },
      update: { status },
    });
  }
}

async function periodId(year: number, month: number): Promise<string> {
  const p = await prisma.glPeriod.findUniqueOrThrow({
    where: { periodYear_periodMonth: { periodYear: year, periodMonth: month } },
  });
  return p.id;
}

async function createHeader(periodId: string): Promise<string> {
  const entryNumber = `JV-T-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const row = await prisma.glEntry.create({
    data: {
      entryNumber,
      periodId,
      entryDate: new Date('2026-06-15'),
      entryType: 'manual',
      narration: 'DB test entry',
      status: 'posted',
      postedAt: new Date(),
      postedBy: USER_ID,
      createdBy: USER_ID,
    },
  });
  return row.id;
}

async function insertLine(opts: {
  glEntryId: string;
  debit: number;
  credit: number;
  accountId?: string;
}): Promise<void> {
  await prisma.$executeRawUnsafe(
    `
    INSERT INTO fin.gl_entry_lines (
      gl_entry_id, account_id, debit, credit, currency, fx_rate, entry_date
    ) VALUES (
      $1::uuid, $2::uuid, $3, $4, 'BDT', 1, '2026-06-15'::date
    )
    `,
    opts.glEntryId,
    opts.accountId ?? ACC_DR,
    opts.debit,
    opts.credit,
  );
}

describe('Database: fin.check_period_open + GL line CHECKs (TC-DB-FIN / TC-DB-CON)', () => {
  beforeAll(async () => {
    await ensureFinLedger();
  }, 120_000);

  beforeEach(async () => {
    await seedBase();
  });

  // TC-DB-FIN-001
  it('posting to open period succeeds', async () => {
    const entryId = await createHeader(await periodId(2026, 1));
    await expect(
      insertLine({ glEntryId: entryId, debit: 100, credit: 0 }),
    ).resolves.not.toThrow();
  });

  // TC-DB-FIN-002
  it('posting to closed period raises exception', async () => {
    const entryId = await createHeader(await periodId(2026, 2));
    await expect(
      insertLine({ glEntryId: entryId, debit: 100, credit: 0 }),
    ).rejects.toThrow(/closed GL period/i);
  });

  // TC-DB-FIN-003
  it('posting to locked period raises exception', async () => {
    const entryId = await createHeader(await periodId(2026, 3));
    await expect(
      insertLine({ glEntryId: entryId, debit: 100, credit: 0 }),
    ).rejects.toThrow(/locked GL period/i);
  });

  // TC-DB-CON-001
  it('GL line debit and credit cannot both be non-zero', async () => {
    const entryId = await createHeader(await periodId(2026, 1));
    await expect(
      insertLine({ glEntryId: entryId, debit: 50, credit: 50 }),
    ).rejects.toThrow(/chk_gl_debit_credit/i);
  });

  // TC-DB-CON-002
  // Isolate chk_gl_nonzero: both-zero also violates chk_gl_debit_credit first,
  // so drop that CHECK for this test (rolled back afterEach).
  it('GL line debit and credit cannot both be zero', async () => {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE fin.gl_entry_lines DROP CONSTRAINT IF EXISTS chk_gl_debit_credit
    `);
    for (const y of ['2025', '2026', '2027']) {
      await prisma
        .$executeRawUnsafe(
          `ALTER TABLE fin.gl_entry_lines_${y} DROP CONSTRAINT IF EXISTS chk_gl_debit_credit`,
        )
        .catch(() => undefined);
    }

    const entryId = await createHeader(await periodId(2026, 1));
    await expect(
      insertLine({ glEntryId: entryId, debit: 0, credit: 0 }),
    ).rejects.toThrow(/chk_gl_nonzero/i);
  });
});
