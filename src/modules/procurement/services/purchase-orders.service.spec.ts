// =============================================================================
// PurchaseOrdersService / GoodsReceiptsService — mocked unit paths
// =============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@shared/database/prisma.service';
import { DocNumberService } from '@modules/orders/services/doc-number.service';
import { AppConfigService } from '@shared/config/app-config.service';
import { EMAIL_QUEUE } from '@infrastructure/queue/queue.constants';
import { PurchaseOrdersService } from '../services/purchase-orders.service';
import { GoodsReceiptsService } from '../services/goods-receipts.service';
import { VendorsService } from '../services/vendors.service';
import { StorageService } from '@infrastructure/storage/storage.service';
import { GrnApprovedEvent } from '../events/grn-approved.event';

const mockPrisma: any = {
  vendor: { findUnique: jest.fn() },
  purchaseOrder: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  purchaseOrderLine: {
    findMany: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  goodsReceipt: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockDocNumber = { generate: jest.fn() };
const mockEmailQueue = { add: jest.fn() };
const mockConfig = {
  procurement: {
    poThresholdLineMgr: 50_000,
    poThresholdManager: 500_000,
    poThresholdFinance: 5_000_000,
    invoiceMatchTolerancePct: 2,
    tdsRatePct: 0,
  },
};
const mockEmit = jest.fn();

describe('PurchaseOrdersService.create — blacklisted vendor (TC-PRC-U-002)', () => {
  let service: PurchaseOrdersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseOrdersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DocNumberService, useValue: mockDocNumber },
        { provide: AppConfigService, useValue: mockConfig },
        { provide: getQueueToken(EMAIL_QUEUE), useValue: mockEmailQueue },
      ],
    }).compile();

    service = module.get(PurchaseOrdersService);
  });

  it('rejects PO for blacklisted vendor', async () => {
    mockPrisma.vendor.findUnique.mockResolvedValue({
      id: 'v1',
      vendorCode: 'VND-X',
      status: 'blacklisted',
    });

    await expect(
      service.create(
        {
          vendorId: 'v1',
          currency: 'BDT',
          deliveryDate: '2026-12-01',
          lines: [{ itemId: 'i1', orderedQty: 1, unitPrice: 10, uom: 'PCS' }],
        },
        'user-1',
      ),
    ).rejects.toThrow(BadRequestException);

    expect(mockPrisma.purchaseOrder.create).not.toHaveBeenCalled();
  });

  it('creates PO and persists calculated total for approved vendor', async () => {
    mockPrisma.vendor.findUnique.mockResolvedValue({
      id: 'v1',
      vendorCode: 'VND-OK',
      status: 'approved',
    });
    mockDocNumber.generate.mockResolvedValue('PO-2026-000001');
    mockPrisma.purchaseOrder.create.mockResolvedValue({
      id: 'po1',
      poNumber: 'PO-2026-000001',
      totalAmount: 250,
      lines: [],
    });

    await service.create(
      {
        vendorId: 'v1',
        currency: 'BDT',
        deliveryDate: '2026-12-01',
        lines: [
          { itemId: 'i1', orderedQty: 10, unitPrice: 20, uom: 'PCS' },
          { itemId: 'i2', orderedQty: 5, unitPrice: 10, uom: 'PCS' },
        ],
      },
      'user-1',
    );

    expect(mockPrisma.purchaseOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ totalAmount: 250 }),
      }),
    );
  });
});

describe('GoodsReceiptsService.approve — GrnApprovedEvent (TC-PRC-U-004)', () => {
  let service: GoodsReceiptsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoodsReceiptsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DocNumberService, useValue: mockDocNumber },
        { provide: StorageService, useValue: { putObject: jest.fn() } },
        {
          provide: VendorsService,
          useValue: { recomputeRating: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: EventEmitter2, useValue: { emit: mockEmit } },
      ],
    }).compile();

    service = module.get(GoodsReceiptsService);
  });

  it('emits GrnApprovedEvent after approval', async () => {
    const grn = {
      id: 'grn-1',
      grnNumber: 'GRN-2026-000001',
      status: 'qc_pending',
      poId: 'po-1',
      purchaseOrder: { vendorId: 'v1' },
      lines: [
        {
          id: 'gl1',
          poLineId: 'pl1',
          receivedQty: 10,
          acceptedQty: 8,
          rejectedQty: 2,
          unitCost: 5,
          poLine: { itemId: 'item-1', unitPrice: 5 },
        },
      ],
    };

    mockPrisma.goodsReceipt.findUnique
      .mockResolvedValueOnce(grn)
      .mockResolvedValueOnce(grn);
    mockPrisma.purchaseOrderLine.findMany.mockResolvedValue([
      { id: 'pl1', orderedQty: 10, receivedQty: 8 },
    ]);
    mockPrisma.purchaseOrderLine.update.mockResolvedValue({});
    mockPrisma.goodsReceipt.update.mockResolvedValue({ ...grn, status: 'approved' });
    mockPrisma.purchaseOrder.update.mockResolvedValue({});

    await service.approve('grn-1', { warehouseId: 'wh-1' }, 'user-1');

    expect(mockEmit).toHaveBeenCalledWith(
      'grn.approved',
      expect.any(GrnApprovedEvent),
    );
    const event = mockEmit.mock.calls[0][1] as GrnApprovedEvent;
    expect(event.grnId).toBe('grn-1');
    expect(event.approvedBy).toBe('user-1');
    expect(event.lines[0]).toMatchObject({
      itemId: 'item-1',
      warehouseId: 'wh-1',
      acceptedQty: 8,
      unitCost: 5,
    });
  });

  it('rejects approve when GRN not found', async () => {
    mockPrisma.goodsReceipt.findUnique.mockResolvedValue(null);
    await expect(
      service.approve('missing', { warehouseId: 'wh-1' }, 'user-1'),
    ).rejects.toThrow(NotFoundException);
  });
});
