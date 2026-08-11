// =============================================================================
// TC-INV-I-001 / I-002 / TC-E2E-INV-001 / TC-E2E-INV-002
// Integration against real PG (testcontainers)
// I-001/I-002: HTTP POST/GET via inventory controllers
// E2E-INV: service/handler flows (Sprint 6 locked decision — not browser)
// =============================================================================

import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { prisma } from '@test/helpers/integration-test-setup';
import { PrismaService } from '@shared/database/prisma.service';
import { DocNumberService } from '@modules/orders/services/doc-number.service';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RbacGuard } from '@common/guards/rbac.guard';
import { StockTransactionsService } from '@modules/inventory/services/stock-transactions.service';
import { StockCountsService } from '@modules/inventory/services/stock-counts.service';
import { StockSummaryService } from '@modules/inventory/services/stock-summary.service';
import { StockTransactionsController } from '@modules/inventory/controllers/stock-transactions.controller';
import { StockSummaryController } from '@modules/inventory/controllers/stock-summary.controller';
import { GrnApprovedHandler } from '@modules/inventory/listeners/grn-approved.handler';
import { GrnApprovedEvent } from '@modules/procurement/events/grn-approved.event';
import { REDIS_AUTH } from '@infrastructure/redis/redis.constants';

const USER_ID = 'd4444444-4444-4444-8444-444444444444';
const WH_ID = 'e5555555-5555-4555-8555-555555555555';
const ITEM_ID = 'f6666666-6666-4666-8666-666666666666';

const allowGuard: CanActivate = {
  canActivate: (_context: ExecutionContext) => true,
};

async function ensureLedger(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS inv.stock_transactions (
      id UUID NOT NULL DEFAULT gen_random_uuid(),
      txn_date DATE NOT NULL,
      txn_number TEXT NOT NULL,
      txn_type TEXT NOT NULL,
      item_id UUID NOT NULL REFERENCES inv.stock_items(id),
      warehouse_id UUID NOT NULL REFERENCES inv.warehouses(id),
      quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
      direction SMALLINT NOT NULL CHECK (direction IN (1, -1)),
      unit_cost NUMERIC(12,4),
      batch_lot TEXT,
      source_module TEXT,
      source_id UUID,
      remarks TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by UUID NOT NULL REFERENCES sys.users(id),
      PRIMARY KEY (id, txn_date),
      UNIQUE (txn_number, txn_date)
    ) PARTITION BY RANGE (txn_date);
  `);
  for (const [y, n] of [
    ['2025', '2026'],
    ['2026', '2027'],
    ['2027', '2028'],
  ] as const) {
    await prisma
      .$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS inv.stock_transactions_${y}
         PARTITION OF inv.stock_transactions
         FOR VALUES FROM ('${y}-01-01') TO ('${n}-01-01')`,
      )
      .catch(() => undefined);
  }
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION inv.update_stock_balance()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    BEGIN
      INSERT INTO inv.stock_balances (item_id, warehouse_id, quantity, avg_cost)
      VALUES (NEW.item_id, NEW.warehouse_id, 0, COALESCE(NEW.unit_cost,0))
      ON CONFLICT (item_id, warehouse_id) DO NOTHING;

      UPDATE inv.stock_balances SET
        quantity = inv.stock_balances.quantity + (NEW.quantity * NEW.direction),
        avg_cost = CASE
          WHEN NEW.direction = 1 AND NEW.unit_cost IS NOT NULL THEN
            ROUND(
              (inv.stock_balances.quantity * inv.stock_balances.avg_cost
               + NEW.quantity * NEW.unit_cost)
              / NULLIF(inv.stock_balances.quantity + NEW.quantity, 0), 4)
          ELSE inv.stock_balances.avg_cost
        END,
        last_updated = NOW()
      WHERE item_id = NEW.item_id AND warehouse_id = NEW.warehouse_id;

      RETURN NEW;
    END; $$;
  `);
  await prisma.$executeRawUnsafe(`
    DROP TRIGGER IF EXISTS trg_stock_balance ON inv.stock_transactions;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER trg_stock_balance AFTER INSERT ON inv.stock_transactions
      FOR EACH ROW EXECUTE FUNCTION inv.update_stock_balance();
  `);
  await prisma.$executeRawUnsafe(`DROP MATERIALIZED VIEW IF EXISTS inv.stock_summary`);
  await prisma.$executeRawUnsafe(`
    CREATE MATERIALIZED VIEW inv.stock_summary AS
    SELECT i.id AS item_id, i.item_code, i.name, i.category, i.uom, i.reorder_level,
      COALESCE(SUM(b.quantity), 0) AS total_qty,
      COALESCE(SUM(b.quantity * b.avg_cost), 0) AS total_value,
      COALESCE(SUM(b.avg_cost) / NULLIF(COUNT(b.*), 0), 0) AS avg_unit_cost,
      CASE WHEN COALESCE(SUM(b.quantity), 0) <= i.reorder_level THEN TRUE ELSE FALSE END AS below_reorder
    FROM inv.stock_items i
    LEFT JOIN inv.stock_balances b ON b.item_id = i.id
    WHERE i.is_active = TRUE
    GROUP BY i.id, i.item_code, i.name, i.category, i.uom, i.reorder_level;
  `);
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_stock ON inv.stock_summary (item_id)`,
  );
  await prisma.$executeRawUnsafe(`
    INSERT INTO sys.document_sequences (prefix, last_number, pad_length, separator)
    VALUES ('STXN', 0, 6, '-'), ('STC', 0, 6, '-')
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
     VALUES ($1::uuid, 'inv-i@okfootwear.com', 'x', 'I', 'Test', true, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    USER_ID,
  );
  await prisma.warehouse.upsert({
    where: { id: WH_ID },
    create: { id: WH_ID, code: 'WH-I', name: 'Int WH', type: 'general' },
    update: {},
  });
  await prisma.stockItem.upsert({
    where: { id: ITEM_ID },
    create: {
      id: ITEM_ID,
      itemCode: 'RM-I-01',
      name: 'Int Item',
      category: 'raw_material',
      reorderLevel: 100,
      createdBy: USER_ID,
    },
    update: { reorderLevel: 100 },
  });
}

describe('Inventory integration (TC-INV-I / TC-E2E-INV)', () => {
  let app: INestApplication;
  let http: request.SuperTest<request.Test>;
  let stockTx: StockTransactionsService;
  let counts: StockCountsService;
  let grnHandler: GrnApprovedHandler;
  let mockRedis: { set: jest.Mock; del: jest.Mock };

  beforeAll(async () => {
    await ensureLedger();

    mockRedis = {
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };

    const prismaSvc = prisma as unknown as PrismaService;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StockTransactionsController, StockSummaryController],
      providers: [
        StockTransactionsService,
        StockCountsService,
        StockSummaryService,
        GrnApprovedHandler,
        DocNumberService,
        { provide: PrismaService, useValue: prismaSvc },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: REDIS_AUTH, useValue: mockRedis },
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
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user?: unknown }).user = {
        sub: USER_ID,
        email: 'inv-i@okfootwear.com',
        permissions: ['inventory:read', 'inventory:create', 'inventory:approve'],
      };
      next();
    });
    await app.init();
    http = request(app.getHttpServer());

    stockTx = module.get(StockTransactionsService);
    counts = module.get(StockCountsService);
    grnHandler = module.get(GrnApprovedHandler);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await seed();
    await prisma.$executeRawUnsafe(
      `DELETE FROM inv.stock_balances WHERE item_id = $1::uuid`,
      ITEM_ID,
    );
  });

  // TC-INV-I-001
  it('POST /inventory/transactions updates balance via trigger', async () => {
    const res = await http.post('/inventory/transactions').send({
      txnType: 'grn',
      direction: 1,
      itemId: ITEM_ID,
      warehouseId: WH_ID,
      quantity: 75,
      unitCost: 12,
    });

    expect(res.status).toBeLessThan(300);
    expect(res.body.txnNumber).toMatch(/^STXN-/);

    const bal = await stockTx.findBalance(ITEM_ID, WH_ID);
    expect(Number(bal?.quantity)).toBe(75);
  });

  // TC-INV-I-002
  it('GET /inventory/stock-summary returns total_qty and below_reorder', async () => {
    await stockTx.recordMovement(
      {
        txnType: 'grn',
        direction: 1,
        itemId: ITEM_ID,
        warehouseId: WH_ID,
        quantity: 40,
        unitCost: 8,
      },
      USER_ID,
    );
    await prisma.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW inv.stock_summary`);

    const res = await http.get('/inventory/stock-summary').query({ page: 1, limit: 50 });

    expect(res.status).toBe(200);
    const row = (res.body.data as Array<{
      itemId: string;
      totalQty: number;
      belowReorder: boolean;
    }>).find((r) => r.itemId === ITEM_ID);
    expect(row).toBeDefined();
    expect(row!.totalQty).toBe(40);
    expect(row!.belowReorder).toBe(true);
  });

  // TC-E2E-INV-001
  it('GrnApprovedHandler posts balance for accepted lines', async () => {
    await grnHandler.handle(
      new GrnApprovedEvent({
        grnId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        approvedBy: USER_ID,
        lines: [
          {
            itemId: ITEM_ID,
            warehouseId: WH_ID,
            acceptedQty: 25,
            unitCost: 9,
          },
        ],
      }),
    );

    const bal = await stockTx.findBalance(ITEM_ID, WH_ID);
    expect(Number(bal?.quantity)).toBe(25);
  });

  // TC-E2E-INV-002
  it('stock count approve posts adjustments for variance', async () => {
    await stockTx.recordMovement(
      {
        txnType: 'grn',
        direction: 1,
        itemId: ITEM_ID,
        warehouseId: WH_ID,
        quantity: 100,
        unitCost: 10,
      },
      USER_ID,
    );

    const sheet = await counts.create({ warehouseId: WH_ID }, USER_ID);
    expect(sheet.lines.length).toBeGreaterThanOrEqual(1);
    const line = sheet.lines.find((l) => l.itemId === ITEM_ID)!;

    await counts.updateLine(sheet.id, line.id, { physicalQty: 90 });
    await counts.submit(sheet.id);
    await counts.approve(sheet.id, USER_ID);

    const bal = await stockTx.findBalance(ITEM_ID, WH_ID);
    expect(Number(bal?.quantity)).toBe(90);
  });
});
