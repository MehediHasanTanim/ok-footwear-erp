import { prisma } from '@test/helpers/integration-test-setup';

/** Deploy partitioned daily_productions (not created by prisma db push). */
export async function deployDailyProductionsPartition(): Promise<void> {
  await prisma.$executeRawUnsafe(`
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
    ) PARTITION BY RANGE (prod_date)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS mfg.daily_productions_2025 PARTITION OF mfg.daily_productions
      FOR VALUES FROM ('2025-01-01') TO ('2026-01-01')
  `).catch(() => undefined);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS mfg.daily_productions_2026 PARTITION OF mfg.daily_productions
      FOR VALUES FROM ('2026-01-01') TO ('2027-01-01')
  `).catch(() => undefined);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS mfg.daily_productions_2027 PARTITION OF mfg.daily_productions
      FOR VALUES FROM ('2027-01-01') TO ('2028-01-01')
  `).catch(() => undefined);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_daily_prod_order ON mfg.daily_productions(production_order_id, prod_date DESC)
  `).catch(() => undefined);
}

export async function seedMfgMasterData(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    INSERT INTO mfg.factory_lines (code, name, floor, capacity_prs)
    VALUES
      ('LINE-A', 'Assembly Line A', 'Floor 1', 500),
      ('LINE-B', 'Assembly Line B', 'Floor 1', 400)
    ON CONFLICT (code) DO NOTHING
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO mfg.operations (code, name, section, sam, sequence)
    VALUES
      ('CUT', 'Cutting', 'cutting', 2.50, 10),
      ('STI', 'Stitching', 'stitching', 8.00, 20)
    ON CONFLICT (code) DO NOTHING
  `);
}
