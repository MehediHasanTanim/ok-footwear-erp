// =============================================================================
// TC-DB-INV-001…006 + TC-DB-MV-002 — inv.update_stock_balance + stock_summary
// =============================================================================
// db push does not apply migration SQL — deploy partitioned ledger + trigger + MV
// in beforeAll (same pattern as sys.next_doc_number tests).
// =============================================================================

import { prisma } from '@test/helpers/integration-test-setup';

const USER_ID = 'a1111111-1111-4111-8111-111111111111';
const WH_ID = 'b2222222-2222-4222-8222-222222222222';
const ITEM_ID = 'c3333333-3333-4333-8333-333333333333';

async function deployInvLedger(): Promise<void> {
  // Idempotent deploy of objects that Prisma db push cannot create
  await prisma.$executeRawUnsafe(`
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
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS inv.stock_transactions_2025
      PARTITION OF inv.stock_transactions
      FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
  `).catch(() => undefined);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS inv.stock_transactions_2026
      PARTITION OF inv.stock_transactions
      FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
  `).catch(() => undefined);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS inv.stock_transactions_2027
      PARTITION OF inv.stock_transactions
      FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');
  `).catch(() => undefined);

  // Ensure composite PK so ON CONFLICT in trigger works (db push can omit it)
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE inv.stock_balances
        ADD CONSTRAINT stock_balances_pkey PRIMARY KEY (item_id, warehouse_id);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN invalid_table_definition THEN NULL;
    END $$;
  `);

  // Ensure CHECK on balances (db push may omit named constraint text)
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE inv.stock_balances
        ADD CONSTRAINT chk_balance_non_negative CHECK (quantity >= 0);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // Ensure composite PK so ON CONFLICT / updates target the right row
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE inv.stock_balances
        ADD CONSTRAINT stock_balances_pkey PRIMARY KEY (item_id, warehouse_id);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN invalid_table_definition THEN NULL;
    END $$;
  `);

  // Insert-zero then UPDATE avoids CHECK on a transient negative INSERT row
  // when ON CONFLICT takes the update path (PostgreSQL evaluates CHECK on INSERT first).
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION inv.update_stock_balance()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    BEGIN
      INSERT INTO inv.stock_balances (item_id, warehouse_id, quantity, avg_cost)
      VALUES (NEW.item_id, NEW.warehouse_id, 0, COALESCE(NEW.unit_cost, 0))
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
    END;
    $$;
  `);

  await prisma.$executeRawUnsafe(`
    DROP TRIGGER IF EXISTS trg_stock_balance ON inv.stock_transactions;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER trg_stock_balance
      AFTER INSERT ON inv.stock_transactions
      FOR EACH ROW EXECUTE FUNCTION inv.update_stock_balance();
  `);

  await prisma.$executeRawUnsafe(`DROP MATERIALIZED VIEW IF EXISTS inv.stock_summary`);
  await prisma.$executeRawUnsafe(`
    CREATE MATERIALIZED VIEW inv.stock_summary AS
    SELECT
      i.id AS item_id, i.item_code, i.name, i.category, i.uom, i.reorder_level,
      COALESCE(SUM(b.quantity), 0) AS total_qty,
      COALESCE(SUM(b.quantity * b.avg_cost), 0) AS total_value,
      COALESCE(SUM(b.avg_cost) / NULLIF(COUNT(b.*), 0), 0) AS avg_unit_cost,
      CASE WHEN COALESCE(SUM(b.quantity), 0) <= i.reorder_level
           THEN TRUE ELSE FALSE END AS below_reorder
    FROM inv.stock_items i
    LEFT JOIN inv.stock_balances b ON b.item_id = i.id
    WHERE i.is_active = TRUE
    GROUP BY i.id, i.item_code, i.name, i.category, i.uom, i.reorder_level;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_stock ON inv.stock_summary (item_id);
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO sys.document_sequences (prefix, last_number, pad_length, separator)
    VALUES ('STXN', 0, 6, '-'), ('STC', 0, 6, '-')
    ON CONFLICT (prefix) DO NOTHING;
  `);
}

async function seedBase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `
    INSERT INTO sys.users (
      id, email, password_hash, first_name, last_name, is_active, created_at, updated_at
    ) VALUES (
      $1::uuid, 'inv-test@okfootwear.com', 'x', 'Inv', 'Test', true, NOW(), NOW()
    ) ON CONFLICT (id) DO NOTHING
    `,
    USER_ID,
  );

  await prisma.warehouse.upsert({
    where: { id: WH_ID },
    create: {
      id: WH_ID,
      code: 'WH-TEST',
      name: 'Test Warehouse',
      type: 'general',
    },
    update: { isActive: true },
  });

  await prisma.stockItem.upsert({
    where: { id: ITEM_ID },
    create: {
      id: ITEM_ID,
      itemCode: 'RM-TEST-01',
      name: 'Test Leather',
      category: 'raw_material',
      uom: 'PCS',
      reorderLevel: 50,
      createdBy: USER_ID,
    },
    update: { isActive: true, reorderLevel: 50 },
  });
}

async function insertTxn(opts: {
  direction: 1 | -1;
  quantity: number;
  txnType: string;
  unitCost?: number;
  txnNumber?: string;
}): Promise<void> {
  const num = opts.txnNumber ?? `STXN-T-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await prisma.$executeRawUnsafe(
    `
    INSERT INTO inv.stock_transactions (
      txn_date, txn_number, txn_type, item_id, warehouse_id,
      quantity, direction, unit_cost, created_by
    ) VALUES (
      CURRENT_DATE, $1, $2, $3::uuid, $4::uuid, $5, $6, $7, $8::uuid
    )
    `,
    num,
    opts.txnType,
    ITEM_ID,
    WH_ID,
    opts.quantity,
    opts.direction,
    opts.unitCost ?? null,
    USER_ID,
  );
}

async function getBalance(): Promise<{ quantity: number; avg_cost: number } | null> {
  const rows = await prisma.$queryRawUnsafe<
    { quantity: number; avg_cost: number }[]
  >(
    `SELECT quantity::float8 AS quantity, avg_cost::float8 AS avg_cost
     FROM inv.stock_balances WHERE item_id = $1::uuid AND warehouse_id = $2::uuid`,
    ITEM_ID,
    WH_ID,
  );
  return rows[0] ?? null;
}

describe('Database: inv.update_stock_balance trigger', () => {
  beforeAll(async () => {
    await deployInvLedger();
  }, 120_000);

  beforeEach(async () => {
    await seedBase();
    await prisma.$executeRawUnsafe(
      `DELETE FROM inv.stock_balances WHERE item_id = $1::uuid`,
      ITEM_ID,
    );
  });

  // TC-DB-INV-001
  it('increases balance by received quantity on GRN transaction', async () => {
    await insertTxn({ direction: 1, quantity: 100, txnType: 'grn', unitCost: 10 });
    const bal = await getBalance();
    expect(bal?.quantity).toBe(100);
  });

  // TC-DB-INV-002
  it('decreases balance by issued quantity on production_issue', async () => {
    await insertTxn({ direction: 1, quantity: 200, txnType: 'grn', unitCost: 10 });
    await insertTxn({ direction: -1, quantity: 50, txnType: 'production_issue' });
    const bal = await getBalance();
    expect(bal?.quantity).toBe(150);
  });

  // TC-DB-INV-003
  it('accumulates balance across multiple inserts', async () => {
    await insertTxn({ direction: 1, quantity: 100, txnType: 'grn', unitCost: 10 });
    await insertTxn({ direction: 1, quantity: 50, txnType: 'grn', unitCost: 10 });
    await insertTxn({ direction: -1, quantity: 30, txnType: 'production_issue' });
    const bal = await getBalance();
    expect(bal?.quantity).toBe(120);
  });

  // TC-DB-INV-004
  it('raises chk_balance_non_negative error on negative stock', async () => {
    await insertTxn({ direction: 1, quantity: 10, txnType: 'grn', unitCost: 10 });
    await expect(
      insertTxn({ direction: -1, quantity: 50, txnType: 'production_issue' }),
    ).rejects.toThrow(/chk_balance_non_negative|check constraint/i);
  });

  // TC-DB-INV-005
  it('recomputes avg_cost as weighted average on each receipt', async () => {
    await insertTxn({ direction: 1, quantity: 100, txnType: 'grn', unitCost: 10 });
    await insertTxn({ direction: 1, quantity: 100, txnType: 'grn', unitCost: 20 });
    const bal = await getBalance();
    expect(bal?.avg_cost).toBeCloseTo(15, 4);
  });

  // TC-DB-INV-006
  it('preserves avg_cost unchanged on production_issue', async () => {
    await insertTxn({ direction: 1, quantity: 100, txnType: 'grn', unitCost: 15 });
    await insertTxn({ direction: -1, quantity: 40, txnType: 'production_issue' });
    const bal = await getBalance();
    expect(bal?.avg_cost).toBeCloseTo(15, 4);
    expect(bal?.quantity).toBe(60);
  });
});

describe('Database: inv.stock_summary (TC-DB-MV-002)', () => {
  beforeAll(async () => {
    await deployInvLedger();
  }, 120_000);

  it('shows below_reorder=true when qty ≤ reorder_level after refresh', async () => {
    await seedBase();
    await prisma.$executeRawUnsafe(
      `DELETE FROM inv.stock_balances WHERE item_id = $1::uuid`,
      ITEM_ID,
    );
    await insertTxn({
      direction: 1,
      quantity: 30,
      txnType: 'grn',
      unitCost: 5,
      txnNumber: `STXN-MV-${Date.now()}`,
    });

    // Non-concurrent: CONCURRENTLY cannot run inside test transaction
    await prisma.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW inv.stock_summary`);

    const rows = await prisma.$queryRawUnsafe<{ below_reorder: boolean }[]>(
      `SELECT below_reorder FROM inv.stock_summary WHERE item_id = $1::uuid`,
      ITEM_ID,
    );
    expect(rows[0]?.below_reorder).toBe(true);
  });
});
