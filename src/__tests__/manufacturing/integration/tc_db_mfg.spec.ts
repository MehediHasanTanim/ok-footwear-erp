import { prisma } from '@test/helpers/integration-test-setup';

const USER_ID = 'c9111111-1111-4111-8111-111111111111';
const ARTICLE_ID = 'a9111111-1111-4111-8111-111111111111';
const ITEM_ID = 'e9111111-1111-4111-8111-111111111111';
const BUYER_ID = 'b9111111-1111-4111-8111-111111111111';

async function ensureConstraints(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE mfg.bom_lines DROP CONSTRAINT IF EXISTS chk_bom_qty_positive`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE mfg.bom_lines ADD CONSTRAINT chk_bom_qty_positive CHECK (quantity_per_pair > 0)`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE mfg.bom_lines DROP CONSTRAINT IF EXISTS chk_bom_wastage_nonneg`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE mfg.bom_lines ADD CONSTRAINT chk_bom_wastage_nonneg CHECK (wastage_pct >= 0)`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE ord.order_lines DROP CONSTRAINT IF EXISTS chk_order_lines_quantity_positive`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE ord.order_lines ADD CONSTRAINT chk_order_lines_quantity_positive CHECK (quantity > 0)`,
  );
}

async function seedMasters(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO sys.users (id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
     VALUES ($1::uuid, 'mfg-db@okfootwear.com', 'x', 'M', 'Fg', true, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    USER_ID,
  );
  await prisma.article.upsert({
    where: { id: ARTICLE_ID },
    create: { id: ARTICLE_ID, code: 'ART-MFG-DB', description: 'DB BOM article' },
    update: {},
  });
  await prisma.stockItem.upsert({
    where: { id: ITEM_ID },
    create: {
      id: ITEM_ID,
      itemCode: 'ITM-MFG-DB',
      name: 'Upper leather',
      category: 'raw_material',
      uom: 'M',
    },
    update: {},
  });
  await prisma.buyer.upsert({
    where: { id: BUYER_ID },
    create: {
      id: BUYER_ID,
      name: 'MFG DB Buyer',
      currency: 'USD',
      paymentTerms: 'TT_ADVANCE',
    },
    update: {},
  });
}

describe('TC-DB manufacturing BOM constraints', () => {
  beforeAll(async () => {
    await ensureConstraints();
  }, 60_000);

  beforeEach(async () => {
    await seedMasters();
  });

  it('rejects BOM line quantity_per_pair = 0', async () => {
    const bom = await prisma.bomHeader.create({
      data: {
        articleId: ARTICLE_ID,
        version: `z-${Date.now()}`,
        createdBy: USER_ID,
      },
    });
    await expect(
      prisma.bomLine.create({
        data: {
          bomId: bom.id,
          itemId: ITEM_ID,
          componentType: 'upper_material',
          quantityPerPair: 0,
          uom: 'M',
        },
      }),
    ).rejects.toThrow(/chk_bom_qty_positive|quantity_per_pair/i);
  });

  it('rejects duplicate version for the same article', async () => {
    const version = `dup-${Date.now()}`;
    await prisma.bomHeader.create({
      data: { articleId: ARTICLE_ID, version, createdBy: USER_ID },
    });
    await expect(
      prisma.bomHeader.create({
        data: { articleId: ARTICLE_ID, version, createdBy: USER_ID },
      }),
    ).rejects.toThrow(/unique/i);
  });
});

describe('TC-DB-CON-003 / TC-DB-CON-004 order lines', () => {
  beforeAll(async () => {
    await ensureConstraints();
  }, 60_000);

  beforeEach(async () => {
    await seedMasters();
  });

  async function createOrder() {
    return prisma.order.create({
      data: {
        orderNumber: `OM${Date.now().toString().slice(-12)}`,
        buyerId: BUYER_ID,
        articleId: ARTICLE_ID,
        totalQuantity: 10,
        deliveryDate: new Date('2026-12-01'),
        currency: 'USD',
      },
    });
  }

  it('TC-DB-CON-003 order line quantity=0 rejected by CHECK', async () => {
    const order = await createOrder();
    await expect(
      prisma.orderLine.create({
        data: {
          orderId: order.id,
          sizeLabel: '38',
          quantity: 0,
          unitPrice: 10,
        },
      }),
    ).rejects.toThrow(/chk_order_lines_quantity_positive/);
  });

  it('TC-DB-CON-004 duplicate size_label on same order rejected', async () => {
    const order = await createOrder();
    await prisma.orderLine.create({
      data: {
        orderId: order.id,
        sizeLabel: '40',
        quantity: 5,
        unitPrice: 10,
      },
    });
    await expect(
      prisma.orderLine.create({
        data: {
          orderId: order.id,
          sizeLabel: '40',
          quantity: 3,
          unitPrice: 10,
        },
      }),
    ).rejects.toThrow(/unique/i);
  });
});
