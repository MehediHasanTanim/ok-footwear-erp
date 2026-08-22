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

    const guard = new ProductionBlockGuard(service);
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
