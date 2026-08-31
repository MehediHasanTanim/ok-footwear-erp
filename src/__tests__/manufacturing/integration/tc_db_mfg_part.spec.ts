import { Test, TestingModule } from '@nestjs/testing';
import { prisma } from '@test/helpers/integration-test-setup';
import { PrismaService } from '@shared/database/prisma.service';
import { DailyProductionService } from '@modules/manufacturing/services/daily-production.service';
import {
  deployDailyProductionsPartition,
  seedMfgMasterData,
} from '../helpers/deploy-daily-productions';

const USER_ID = 'd9111111-1111-4111-8111-111111111111';
const ARTICLE_ID = 'a9111111-1111-4111-8111-111111111112';
const BUYER_ID = 'b9111111-1111-4111-8111-111111111112';
const ORDER_ID = '09111111-1111-4111-8111-111111111111';
const BOM_ID = 'f9111111-1111-4111-8111-111111111111';
const PO_ID = '09111111-1111-4111-8111-111111111112';
const LINE_ID = '09111111-1111-4111-8111-111111111113';
const LINE_ZERO_ID = '09111111-1111-4111-8111-111111111114';

async function deployProductionSchema(): Promise<void> {
  await seedMfgMasterData();
  await deployDailyProductionsPartition();
}

async function seedPartitionFixtures(): Promise<{
  factoryLineId: string;
  operationId: string;
}> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO sys.users (id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
     VALUES ($1::uuid, 'mfg-part@okfootwear.com', 'x', 'M', 'Part', true, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    USER_ID,
  );

  await prisma.article.upsert({
    where: { id: ARTICLE_ID },
    create: { id: ARTICLE_ID, code: 'ART-PART', description: 'Partition test article' },
    update: {},
  });

  await prisma.buyer.upsert({
    where: { id: BUYER_ID },
    create: {
      id: BUYER_ID,
      name: 'Part Buyer',
      currency: 'USD',
      paymentTerms: 'TT_ADVANCE',
    },
    update: {},
  });

  await prisma.order.upsert({
    where: { id: ORDER_ID },
    create: {
      id: ORDER_ID,
      orderNumber: 'ORD-PART-001',
      buyerId: BUYER_ID,
      articleId: ARTICLE_ID,
      status: 'in_production',
      sampleApproved: true,
      totalQuantity: 100,
      deliveryDate: new Date('2026-12-31'),
      currency: 'USD',
    },
    update: {},
  });

  await prisma.bomHeader.upsert({
    where: { id: BOM_ID },
    create: {
      id: BOM_ID,
      articleId: ARTICLE_ID,
      version: 'part-1.0',
      status: 'approved',
      createdBy: USER_ID,
    },
    update: {},
  });

  const lineRows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM mfg.factory_lines WHERE code = 'LINE-A' LIMIT 1
  `;
  const opRows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM mfg.operations WHERE code = 'CUT' LIMIT 1
  `;

  const factoryLineId = lineRows[0]?.id;
  const operationId = opRows[0]?.id;
  if (!factoryLineId || !operationId) {
    throw new Error('Seed factory line or operation missing');
  }

  await prisma.productionOrder.upsert({
    where: { id: PO_ID },
    create: {
      id: PO_ID,
      orderId: ORDER_ID,
      bomId: BOM_ID,
      factoryLineId,
      plannedQty: 100,
      producedQty: 0,
      status: 'in_progress',
      createdBy: USER_ID,
      sizePlan: [{ sizeLabel: 'UK8', plannedQty: 100 }],
    },
    update: { status: 'in_progress' },
  });

  await prisma.$executeRawUnsafe(
    `DELETE FROM mfg.daily_productions WHERE production_order_id = $1::uuid`,
    PO_ID,
  );

  await prisma.$executeRawUnsafe(
    `INSERT INTO mfg.daily_productions (
       id, production_order_id, prod_date, factory_line_id, operation_id,
       shift, target_qty, produced_qty
     ) VALUES (
       $1::uuid, $2::uuid, $3::date, $4::uuid, $5::uuid,
       'day', 100, 80
     )`,
    LINE_ID,
    PO_ID,
    '2025-06-15',
    factoryLineId,
    operationId,
  );

  return { factoryLineId, operationId };
}

describe('TC-DB-PART daily_productions partitions', () => {
  let dailySvc: DailyProductionService;

  beforeAll(async () => {
    await deployProductionSchema();

    const prismaSvc = prisma as unknown as PrismaService;
    const module: TestingModule = await Test.createTestingModule({
      providers: [DailyProductionService, { provide: PrismaService, useValue: prismaSvc }],
    }).compile();
    dailySvc = module.get(DailyProductionService);
  }, 120_000);

  beforeEach(async () => {
    await seedPartitionFixtures();
  });

  it('TC-DB-PART-001 2025-dated rows route to the 2025 partition child table', async () => {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM mfg.daily_productions_2025 WHERE id = ${LINE_ID}::uuid
    `;
    expect(rows).toHaveLength(1);
  });

  it('TC-DB-PART-002 2025 rows excluded when querying prod_date >= 2026-01-01', async () => {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM mfg.daily_productions
      WHERE production_order_id = ${PO_ID}::uuid
        AND prod_date >= '2026-01-01'::date
    `;
    expect(rows).toHaveLength(0);
  });

  it('TC-MFG-U-003 (DB) efficiency_pct = 80 for target=100 produced=80', async () => {
    const rows = await prisma.$queryRaw<{ efficiency_pct: number | null }[]>`
      SELECT efficiency_pct FROM mfg.daily_productions WHERE id = ${LINE_ID}::uuid
    `;
    expect(Number(rows[0]?.efficiency_pct)).toBe(80);
  });

  it('TC-MFG-U-004 (DB) efficiency_pct is NULL when target_qty is 0', async () => {
    const refs = await prisma.$queryRaw<{ factory_line_id: string; operation_id: string }[]>`
      SELECT factory_line_id, operation_id FROM mfg.daily_productions WHERE id = ${LINE_ID}::uuid
    `;
    const factoryLineId = refs[0]!.factory_line_id;
    const operationId = refs[0]!.operation_id;

    await prisma.$executeRawUnsafe(
      `INSERT INTO mfg.daily_productions (
         id, production_order_id, prod_date, factory_line_id, operation_id,
         shift, target_qty, produced_qty
       ) VALUES (
         $1::uuid, $2::uuid, $3::date, $4::uuid, $5::uuid,
         'day', 0, 50
       )`,
      LINE_ZERO_ID,
      PO_ID,
      '2025-07-01',
      factoryLineId,
      operationId,
    );

    const rows = await prisma.$queryRaw<{ efficiency_pct: number | null }[]>`
      SELECT efficiency_pct FROM mfg.daily_productions WHERE id = ${LINE_ZERO_ID}::uuid
    `;
    expect(rows[0]?.efficiency_pct).toBeNull();
  });

  it('TC-MFG-U-006 (DB) locked daily production entry throws on update', async () => {
    await prisma.$executeRawUnsafe(
      `UPDATE mfg.daily_productions SET locked = TRUE WHERE id = $1::uuid`,
      LINE_ID,
    );

    await expect(dailySvc.update(LINE_ID, { producedQty: 90 })).rejects.toMatchObject({
      response: {
        statusCode: 422,
        message: 'Daily production entry is locked and cannot be updated',
      },
    });
  });
});
