// =============================================================================
// TC-PRC-U-001 … TC-PRC-U-005 — Sprint 5 Procurement unit tests
// =============================================================================

import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@shared/database/prisma.service';
import { DocNumberService } from '@modules/orders/services/doc-number.service';
import { AppConfigService } from '@shared/config/app-config.service';
import { EMAIL_QUEUE } from '@infrastructure/queue/queue.constants';
import { StorageService } from '@infrastructure/storage/storage.service';
import { PurchaseOrdersService } from '@modules/procurement/services/purchase-orders.service';
import { GoodsReceiptsService } from '@modules/procurement/services/goods-receipts.service';
import { VendorInvoicesService } from '@modules/procurement/services/vendor-invoices.service';
import { VendorsService } from '@modules/procurement/services/vendors.service';
import { GrnApprovedEvent } from '@modules/procurement/events/grn-approved.event';
import { resolveApproverRole } from '@modules/procurement/state/po-state-machine';

describe('TC-PRC-U-001 · PO total_amount = Σ(qty × unit_price)', () => {
  it('sums line amounts correctly', () => {
    const total = PurchaseOrdersService.calcTotalAmount([
      { itemId: 'a', orderedQty: 10, unitPrice: 100, uom: 'PCS' },
      { itemId: 'b', orderedQty: 2.5, unitPrice: 40, uom: 'KG' },
    ]);
    expect(total).toBe(1100);
  });

  it('returns 0 for empty-equivalent calculation of zeros', () => {
    expect(
      PurchaseOrdersService.calcTotalAmount([
        { itemId: 'a', orderedQty: 0.001, unitPrice: 0, uom: 'PCS' },
      ]),
    ).toBe(0);
  });
});

describe('TC-PRC-U-002 · PO creation rejected for blacklisted vendor', () => {
  let service: PurchaseOrdersService;
  const mockPrisma: any = {
    vendor: { findUnique: jest.fn() },
    purchaseOrder: { create: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseOrdersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DocNumberService, useValue: { generate: jest.fn() } },
        {
          provide: AppConfigService,
          useValue: {
            procurement: {
              poThresholdLineMgr: 50_000,
              poThresholdManager: 500_000,
              poThresholdFinance: 5_000_000,
              invoiceMatchTolerancePct: 2,
              tdsRatePct: 0,
            },
          },
        },
        { provide: getQueueToken(EMAIL_QUEUE), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get(PurchaseOrdersService);
  });

  it('rejects PO for blacklisted vendor via PurchaseOrdersService.create', async () => {
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
});

describe('TC-PRC-U-003 · Vendor invoice three-way match tolerance', () => {
  it('rejects when invoice exceeds GRN value beyond tolerance', () => {
    expect(() =>
      VendorInvoicesService.assertThreeWayMatch(110, 100, 200, 2),
    ).toThrow(BadRequestException);
  });

  it('rejects when invoice exceeds PO total beyond tolerance', () => {
    expect(() =>
      VendorInvoicesService.assertThreeWayMatch(110, 200, 100, 2),
    ).toThrow(BadRequestException);
  });

  it('allows invoice within tolerance of GRN and under PO', () => {
    expect(() =>
      VendorInvoicesService.assertThreeWayMatch(101.5, 100, 200, 2),
    ).not.toThrow();
  });
});

describe('TC-PRC-U-004 · GrnApprovedEvent fired on GRN approval', () => {
  let service: GoodsReceiptsService;
  const mockEmit = jest.fn();
  const mockPrisma: any = {
    goodsReceipt: { findUnique: jest.fn(), update: jest.fn() },
    purchaseOrderLine: { findMany: jest.fn(), update: jest.fn() },
    purchaseOrder: { update: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoodsReceiptsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DocNumberService, useValue: { generate: jest.fn() } },
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

  it('emits GrnApprovedEvent with item details and approvedBy', async () => {
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
});

describe('TC-PRC-U-005 · accepted + rejected ≤ received', () => {
  it('throws when sum exceeds received', () => {
    expect(() => GoodsReceiptsService.assertQtyRules(10, 7, 4)).toThrow(
      BadRequestException,
    );
  });

  it('allows accepted + rejected equal to received', () => {
    expect(() => GoodsReceiptsService.assertQtyRules(10, 6, 4)).not.toThrow();
  });

  it('allows accepted + rejected below received', () => {
    expect(() => GoodsReceiptsService.assertQtyRules(10, 5, 0)).not.toThrow();
  });
});

describe('PO threshold → approver role', () => {
  const thresholds = { lineMgr: 50_000, manager: 500_000, finance: 5_000_000 };

  it('maps amount bands to roles', () => {
    expect(resolveApproverRole(10_000, thresholds)).toBe('line_manager');
    expect(resolveApproverRole(100_000, thresholds)).toBe('manager');
    expect(resolveApproverRole(1_000_000, thresholds)).toBe('finance');
    expect(resolveApproverRole(6_000_000, thresholds)).toBe('md');
  });
});
