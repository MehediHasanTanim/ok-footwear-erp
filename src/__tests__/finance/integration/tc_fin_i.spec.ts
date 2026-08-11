// =============================================================================
// TC-FIN-I-001…003 — HTTP POST /finance/gl/entries
// =============================================================================

import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { prisma } from '@test/helpers/integration-test-setup';
import { PrismaService } from '@shared/database/prisma.service';
import { DocNumberService } from '@modules/orders/services/doc-number.service';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RbacGuard } from '@common/guards/rbac.guard';
import { HttpExceptionFilter } from '@common/filters/http-exception.filter';
import { FinanceService } from '@modules/finance/services/finance.service';
import { GlService } from '@modules/finance/services/gl.service';
import { GlEntriesController } from '@modules/finance/controllers/gl.controller';

const USER_ID = 'c1111111-1111-4111-8111-111111111111';
const ACC_DR = 'a1200000-0000-4000-8000-000000001200';
const ACC_CR = 'a4100000-0000-4000-8000-000000004100';
const PERIOD_OPEN = 'd1000000-0000-4000-8000-000000000001';
const PERIOD_LOCKED = 'd3000000-0000-4000-8000-000000000003';

const allowGuard: CanActivate = {
  canActivate: (_context: ExecutionContext) => true,
};

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

  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION fin.check_period_open()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    DECLARE v_status TEXT;
    BEGIN
      SELECT p.status INTO v_status
      FROM fin.gl_entries e
      JOIN fin.gl_periods p ON p.id = e.period_id
      WHERE e.id = NEW.gl_entry_id;
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

  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION sys.next_doc_number(p_prefix TEXT)
    RETURNS TEXT LANGUAGE plpgsql AS $$
    DECLARE v_last INT; v_pad INT; v_sep CHAR(1); v_year INT;
    BEGIN
      SELECT last_number, pad_length, separator INTO v_last, v_pad, v_sep
      FROM sys.document_sequences WHERE prefix = p_prefix FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Unknown prefix %', p_prefix; END IF;
      v_last := v_last + 1;
      UPDATE sys.document_sequences SET last_number = v_last WHERE prefix = p_prefix;
      v_year := EXTRACT(YEAR FROM CURRENT_DATE)::INT;
      RETURN p_prefix || v_sep || v_year::TEXT || v_sep || LPAD(v_last::TEXT, v_pad, '0');
    END; $$;
  `);
}

async function seed(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO sys.users (id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
     VALUES ($1::uuid, 'fin-i@okfootwear.com', 'x', 'Fin', 'I', true, NOW(), NOW())
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

  await prisma.glPeriod.upsert({
    where: { periodYear_periodMonth: { periodYear: 2026, periodMonth: 8 } },
    create: {
      id: PERIOD_OPEN,
      periodYear: 2026,
      periodMonth: 8,
      status: 'open',
    },
    update: { status: 'open' },
  });

  await prisma.glPeriod.upsert({
    where: { periodYear_periodMonth: { periodYear: 2026, periodMonth: 9 } },
    create: {
      id: PERIOD_LOCKED,
      periodYear: 2026,
      periodMonth: 9,
      status: 'locked',
    },
    update: { status: 'locked' },
  });
}

describe('Finance HTTP integration (TC-FIN-I-001…003)', () => {
  let app: INestApplication;
  let http: request.SuperTest<request.Test>;
  let openPeriodId: string;
  let lockedPeriodId: string;

  beforeAll(async () => {
    await ensureFinLedger();

    const prismaSvc = prisma as unknown as PrismaService;
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GlEntriesController],
      providers: [
        FinanceService,
        GlService,
        DocNumberService,
        { provide: PrismaService, useValue: prismaSvc },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(allowGuard)
      .overrideGuard(RbacGuard)
      .useValue(allowGuard)
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user?: unknown }).user = {
        sub: USER_ID,
        email: 'fin-i@okfootwear.com',
        permissions: ['finance:read', 'finance:create'],
      };
      next();
    });
    await app.init();
    http = request(app.getHttpServer());
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await seed();
    const open = await prisma.glPeriod.findUnique({
      where: { periodYear_periodMonth: { periodYear: 2026, periodMonth: 8 } },
    });
    const locked = await prisma.glPeriod.findUnique({
      where: { periodYear_periodMonth: { periodYear: 2026, periodMonth: 9 } },
    });
    openPeriodId = open!.id;
    lockedPeriodId = locked!.id;
  });

  // TC-FIN-I-001
  it('POST /finance/gl/entries → 201 with status=posted for balanced journal', async () => {
    const res = await http.post('/finance/gl/entries').send({
      periodId: openPeriodId,
      entryDate: '2026-08-15',
      narration: 'Balanced AR entry',
      lines: [
        { accountId: ACC_DR, debit: 5000, credit: 0 },
        { accountId: ACC_CR, debit: 0, credit: 5000 },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('posted');
    expect(res.body.entryNumber).toMatch(/^JV-/);
    expect(res.body.lines).toHaveLength(2);
  });

  // TC-FIN-I-002
  it('POST /finance/gl/entries → 422 for unbalanced journal', async () => {
    const res = await http.post('/finance/gl/entries').send({
      periodId: openPeriodId,
      entryDate: '2026-08-15',
      narration: 'Unbalanced',
      lines: [
        { accountId: ACC_DR, debit: 5000, credit: 0 },
        { accountId: ACC_CR, debit: 0, credit: 4500 },
      ],
    });

    expect(res.status).toBe(422);
    expect(res.body.detail).toMatch(/balance/i);
  });

  // TC-FIN-I-003
  it('POST /finance/gl/entries → 422 when posting to locked period', async () => {
    const res = await http.post('/finance/gl/entries').send({
      periodId: lockedPeriodId,
      entryDate: '2026-09-15',
      narration: 'Locked period',
      lines: [
        { accountId: ACC_DR, debit: 100, credit: 0 },
        { accountId: ACC_CR, debit: 0, credit: 100 },
      ],
    });

    expect(res.status).toBe(422);
    expect(res.body.detail).toMatch(/locked/i);
  });
});
