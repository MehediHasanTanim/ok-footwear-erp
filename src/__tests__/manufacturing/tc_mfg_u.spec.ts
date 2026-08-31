import {
  ConflictException,
  ExecutionContext,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import { BomService } from '@modules/manufacturing/services/bom.service';
import { computeSellingPrice } from '@modules/manufacturing/services/cost-sheets.service';
import { ProductionBlockGuard } from '@modules/manufacturing/guards/production-block.guard';
import { DailyProductionService } from '@modules/manufacturing/services/daily-production.service';
import { calcAqlSampleSize } from '@modules/manufacturing/utils/aql-sample-size';

const ARTICLE_ID = 'a1111111-1111-4111-8111-111111111111';
const USER_ID = 'u1111111-1111-4111-8111-111111111111';
const ITEM_ID = 'i1111111-1111-4111-8111-111111111111';

describe('Manufacturing unit (TC-MFG-U-001/002/005)', () => {
  let service: BomService;
  let prisma: {
    article: { findUnique: jest.Mock };
    bomHeader: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    stockItem: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      article: { findUnique: jest.fn().mockResolvedValue({ id: ARTICLE_ID }) },
      bomHeader: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      stockItem: { findMany: jest.fn().mockResolvedValue([{ id: ITEM_ID }]) },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [BomService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(BomService);
  });

  it('TC-MFG-U-001 ConflictException when same article+version already exists', async () => {
    prisma.bomHeader.findUnique.mockResolvedValue({ id: 'existing' });

    await expect(
      service.create(
        {
          articleId: ARTICLE_ID,
          version: '1.0',
          lines: [
            {
              itemId: ITEM_ID,
              componentType: 'upper_material',
              qtyPerUnit: 0.5,
              uom: 'M',
            },
          ],
        },
        USER_ID,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    try {
      await service.create(
        {
          articleId: ARTICLE_ID,
          version: '1.0',
          lines: [
            {
              itemId: ITEM_ID,
              componentType: 'upper_material',
              qtyPerUnit: 0.5,
              uom: 'M',
            },
          ],
        },
        USER_ID,
      );
    } catch (err) {
      const resp = (err as ConflictException).getResponse() as { message: string };
      expect(resp.message).toBe('BOM version 1.0 already exists for this article');
    }
  });

  it('TC-MFG-U-002 production blocked without approved BOM', async () => {
    prisma.bomHeader.count.mockResolvedValue(0);
    await expect(service.assertApprovedBom(ARTICLE_ID)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );

    try {
      await service.assertApprovedBom(ARTICLE_ID);
    } catch (err) {
      const resp = (err as UnprocessableEntityException).getResponse() as {
        message: string;
      };
      expect(resp.message).toBe(
        'Production is blocked: no approved BOM for this article',
      );
    }

    const guard = new ProductionBlockGuard(service, { order: { findUnique: jest.fn() } } as never);
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ body: { articleId: ARTICLE_ID }, params: {} }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );

    prisma.bomHeader.count.mockResolvedValue(1);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('archives previous approved version on approve', async () => {
    prisma.bomHeader.findUnique
      .mockResolvedValueOnce({
        id: 'b2',
        articleId: ARTICLE_ID,
        status: 'draft',
      })
      .mockResolvedValueOnce({
        id: 'b2',
        articleId: ARTICLE_ID,
        version: '1.1',
        status: 'approved',
        lines: [],
        sizeOverrides: [],
        approvedBy: USER_ID,
        approvedAt: new Date(),
        notes: null,
        createdAt: new Date(),
        createdBy: USER_ID,
      });
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
      fn(prisma),
    );

    const result = await service.approve('b2', USER_ID);
    expect(prisma.bomHeader.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'superseded' },
      }),
    );
    expect(result.status).toBe('approved');
  });

  it('TC-MFG-U-005 selling_price = total_cost × (1 + marginPct/100)', () => {
    expect(computeSellingPrice(10, 25)).toBe(12.5);
    expect(computeSellingPrice(100, 20)).toBe(120);
    expect(computeSellingPrice(50.5, 10)).toBe(55.55);
  });
});

describe('Manufacturing unit (TC-MFG-U-003/004/006)', () => {
  let dailySvc: DailyProductionService;
  let prisma: {
    $queryRaw: jest.Mock;
    productionOrder: { findUnique: jest.Mock; update: jest.Mock };
    factoryLine: { findUnique: jest.Mock };
    operation: { findUnique: jest.Mock };
    articleRouting: { count: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      $queryRaw: jest.fn(),
      productionOrder: { findUnique: jest.fn(), update: jest.fn() },
      factoryLine: { findUnique: jest.fn().mockResolvedValue({ isActive: true }) },
      operation: { findUnique: jest.fn().mockResolvedValue({ id: 'op-1' }) },
      articleRouting: { count: jest.fn().mockResolvedValue(1) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [DailyProductionService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    dailySvc = module.get(DailyProductionService);
  });

  it('TC-MFG-U-003 efficiency_pct = (produced / target) × 100 from DB generated column', async () => {
    prisma.productionOrder.findUnique.mockResolvedValue({
      id: 'po-1',
      status: 'in_progress',
      order: { articleId: 'art-1' },
    });
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        id: 'dp-1',
        production_order_id: 'po-1',
        prod_date: new Date('2026-06-01'),
        factory_line_id: 'fl-1',
        operation_id: 'op-1',
        shift: 'day',
        target_qty: 100,
        produced_qty: 80,
        rejected_qty: 0,
        efficiency_pct: 80,
        supervisor_id: null,
        locked: false,
        created_at: new Date(),
      },
    ]);
    prisma.$queryRaw.mockResolvedValueOnce([{ total: 80 }]);
    prisma.productionOrder.update.mockResolvedValue({});

    const result = await dailySvc.record(
      'po-1',
      {
        prodDate: '2026-06-01',
        factoryLineId: 'fl-1',
        operationId: 'op-1',
        targetQty: 100,
        producedQty: 80,
      },
      'user-1',
    );

    expect(result.efficiencyPct).toBe(80);
  });

  it('TC-MFG-U-004 efficiency_pct is NULL when target_qty is 0', async () => {
    prisma.productionOrder.findUnique.mockResolvedValue({
      id: 'po-1',
      status: 'in_progress',
      order: { articleId: 'art-1' },
    });
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        id: 'dp-2',
        production_order_id: 'po-1',
        prod_date: new Date('2026-06-02'),
        factory_line_id: 'fl-1',
        operation_id: 'op-1',
        shift: 'day',
        target_qty: 0,
        produced_qty: 50,
        rejected_qty: 0,
        efficiency_pct: null,
        supervisor_id: null,
        locked: false,
        created_at: new Date(),
      },
    ]);
    prisma.$queryRaw.mockResolvedValueOnce([{ total: 50 }]);
    prisma.productionOrder.update.mockResolvedValue({});

    const result = await dailySvc.record(
      'po-1',
      {
        prodDate: '2026-06-02',
        factoryLineId: 'fl-1',
        operationId: 'op-1',
        targetQty: 0,
        producedQty: 50,
      },
      'user-1',
    );

    expect(result.efficiencyPct).toBeNull();
  });

  it('TC-MFG-U-006 locked daily production entry throws on update', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        id: 'dp-locked',
        production_order_id: 'po-1',
        prod_date: new Date('2026-01-01'),
        factory_line_id: 'fl-1',
        operation_id: 'op-1',
        shift: 'day',
        target_qty: 100,
        produced_qty: 80,
        rejected_qty: 0,
        efficiency_pct: 80,
        supervisor_id: null,
        locked: true,
        created_at: new Date(),
      },
    ]);

    await expect(dailySvc.update('dp-locked', { producedQty: 90 })).rejects.toMatchObject({
      response: { message: expect.stringMatching(/locked/i) },
    });
  });

  it('AQL sample size for lot 500 returns 50 (Level II)', () => {
    expect(calcAqlSampleSize(500)).toBe(50);
    expect(calcAqlSampleSize(100)).toBe(20);
  });
});
