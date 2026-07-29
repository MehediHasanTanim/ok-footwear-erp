// =============================================================================
// TC-ORD-SVC — OrdersService Unit Tests
// =============================================================================
// OK Footwear ERP — Sprint 3
//
// Acceptance Tests Covered:
//   1. sum(orderLines.quantity) !== totalQuantity → 422 with field-level error
//   4. draft → confirmed generates exactly 6 milestones with correct offsets
//   5. OrderConfirmedEvent emitted only after transaction commits
//   7. PATCH /orders/:id on confirmed order is rejected
// =============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { OrdersService } from '@modules/orders/services/orders.service';
import { DocNumberService } from '@modules/orders/services/doc-number.service';
import { PrismaService } from '@shared/database/prisma.service';
import { OrderConfirmedEvent } from '@modules/orders/events/order-confirmed.event';
import { CreateOrderDto, UpdateOrderDto, StatusTransitionDto } from '@modules/orders/dto/orders.dto';

const CONFIRMED_BY_USER = 'user-456';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockTx = {
  buyer: { findUnique: jest.fn() },
  article: { findUnique: jest.fn() },
  order: { create: jest.fn(), update: jest.fn() },
  orderMilestone: { createMany: jest.fn() },
  $queryRawUnsafe: jest.fn(),
};

const mockPrisma = {
  buyer: { findUnique: jest.fn() },
  article: { findUnique: jest.fn() },
  order: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  orderMilestone: {
    createMany: jest.fn(),
  },
  $transaction: jest.fn(),
  $queryRawUnsafe: jest.fn(),
};

const mockEventEmitter = {
  emit: jest.fn(),
};

const mockDocNumber = {
  generate: jest.fn().mockResolvedValue('ORD-000001'),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-123',
    orderNumber: 'ORD-000001',
    buyerId: 'buyer-1',
    articleId: 'article-1',
    status: 'draft',
    sampleApproved: false,
    totalQuantity: 1000,
    deliveryDate: new Date('2026-12-31'),
    currency: 'USD',
    confirmedAt: null,
    confirmedBy: null,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    buyer: { name: 'Test Buyer', currency: 'USD' },
    article: { code: 'ART-001', description: 'Test Article' },
    orderLines: [
      { id: 'line-1', sizeLabel: '38', quantity: 500, unitPrice: 12.5 },
      { id: 'line-2', sizeLabel: '39', quantity: 500, unitPrice: 12.5 },
    ],
    milestones: [],
    ...overrides,
  };
}

function validCreateDto(overrides: Partial<CreateOrderDto> = {}): CreateOrderDto {
  return {
    buyerId: 'buyer-1',
    articleId: 'article-1',
    totalQuantity: 1000,
    deliveryDate: '2026-12-31',
    currency: 'USD',
    orderLines: [
      { sizeLabel: '38', quantity: 500, unitPrice: 12.5 },
      { sizeLabel: '39', quantity: 500, unitPrice: 12.5 },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OrdersService', () => {
  let service: OrdersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: DocNumberService, useValue: mockDocNumber },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);

    // Reset mocks
    jest.clearAllMocks();
    mockDocNumber.generate.mockResolvedValue('ORD-000001');

    // Default mock setup
    mockPrisma.buyer.findUnique.mockResolvedValue({
      id: 'buyer-1',
      isActive: true,
      deletedAt: null,
    });
    mockPrisma.article.findUnique.mockResolvedValue({
      id: 'article-1',
      isActive: true,
      deletedAt: null,
    });

    // $transaction mock: execute the callback with mockTx
    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx),
    );

    // Set up mockTx defaults
    mockTx.buyer.findUnique.mockResolvedValue({
      id: 'buyer-1',
      isActive: true,
      deletedAt: null,
    });
    mockTx.article.findUnique.mockResolvedValue({
      id: 'article-1',
      isActive: true,
      deletedAt: null,
    });
    mockTx.order.create.mockResolvedValue({
      id: 'order-123',
      orderNumber: 'ORD-000001',
      status: 'draft',
      buyerId: 'buyer-1',
      articleId: 'article-1',
      sampleApproved: false,
      totalQuantity: 1000,
      deliveryDate: new Date('2026-12-31'),
      currency: 'USD',
      confirmedAt: null,
      confirmedBy: null,
      cancelledAt: null,
      cancellationReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      buyer: { name: 'Test Buyer', currency: 'USD' },
      article: { code: 'ART-001', description: 'Test Article' },
      orderLines: [
        { id: 'line-1', sizeLabel: '38', quantity: 500, unitPrice: 12.5 },
        { id: 'line-2', sizeLabel: '39', quantity: 500, unitPrice: 12.5 },
      ],
    });
    mockTx.orderMilestone.createMany.mockResolvedValue({ count: 6 });
  });

  // =========================================================================
  // Acceptance Test 1: sum(orderLines.quantity) !== totalQuantity → 422
  // =========================================================================

  describe('create() — quantity sum validation', () => {
    it('should throw 422 when sum(orderLines) != totalQuantity', async () => {
      const dto = validCreateDto({ totalQuantity: 999 });

      try {
        await service.create(dto);
        fail('Should have thrown');
      } catch (e) {
        const err = e as BadRequestException;
        const resp = err.getResponse() as Record<string, unknown>;
        expect(resp['statusCode']).toBe(422);
        expect(resp['message']).toBe('Validation failed');
        const errors = resp['errors'] as Array<{ field: string; message: string }>;
        expect(errors).toBeDefined();
        expect(errors[0]?.field).toBe('orderLines');
        expect(errors[0]?.message).toContain('must equal totalQuantity');
      }
    });

    it('should create successfully when sum matches', async () => {
      const result = await service.create(validCreateDto());

      expect(result.orderNumber).toBe('ORD-000001');
      expect(result.status).toBe('draft');
      expect(result.nextAllowedStates).toEqual(['confirmed', 'cancelled']);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockDocNumber.generate).toHaveBeenCalledWith(mockTx, 'ORD');
    });

    it('should create order with draft status unconditionally', async () => {
      const result = await service.create(validCreateDto());
      expect(result.status).toBe('draft');
    });
  });

  // =========================================================================
  // Acceptance Test: buyer/article validation
  // =========================================================================

  describe('create() — buyer/article validation', () => {
    it('should reject inactive buyer', async () => {
      mockTx.buyer.findUnique.mockResolvedValue({
        id: 'buyer-1',
        isActive: false,
        deletedAt: null,
      });

      await expect(service.create(validCreateDto())).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject soft-deleted buyer', async () => {
      mockTx.buyer.findUnique.mockResolvedValue({
        id: 'buyer-1',
        isActive: false,
        deletedAt: new Date(),
      });

      await expect(service.create(validCreateDto())).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject inactive article', async () => {
      mockTx.article.findUnique.mockResolvedValue({
        id: 'article-1',
        isActive: false,
        deletedAt: null,
      });

      await expect(service.create(validCreateDto())).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // =========================================================================
  // Acceptance Test 7: Edit restrictions
  // =========================================================================

  describe('update() — draft-only restrictions', () => {
    it('should allow editing a draft order', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(mockOrder({ status: 'draft' }));
      mockPrisma.order.update.mockResolvedValue(mockOrder({ status: 'draft' }));

      await expect(
        service.update('order-123', { deliveryDate: '2027-01-15' } as UpdateOrderDto),
      ).resolves.not.toThrow();
    });

    it('should reject editing a confirmed order', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(mockOrder({ status: 'confirmed' }));

      await expect(
        service.update('order-123', { deliveryDate: '2027-01-15' } as UpdateOrderDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject editing an in_production order', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(mockOrder({ status: 'in_production' }));

      await expect(
        service.update('order-123', {} as UpdateOrderDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // Acceptance Test 4: Milestones generated on confirm
  // =========================================================================

  describe('transitionStatus() — milestone generation', () => {
    it('should generate exactly 6 milestones on draft → confirmed', async () => {
      const order = mockOrder({
        status: 'draft',
        deliveryDate: new Date('2026-12-31'),
      });
      mockPrisma.order.findUnique.mockResolvedValue(order);
      mockTx.order.update.mockResolvedValue({ ...order, status: 'confirmed' });
      mockPrisma.order.update.mockResolvedValue({ ...order, status: 'confirmed' });

      await service.transitionStatus(
        'order-123',
        { toStatus: 'confirmed' } as StatusTransitionDto,
        CONFIRMED_BY_USER,
      );

      expect(mockTx.orderMilestone.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ milestoneType: 'material_booking' }),
          expect.objectContaining({ milestoneType: 'pp_sample' }),
          expect.objectContaining({ milestoneType: 'bulk_start' }),
          expect.objectContaining({ milestoneType: 'qc' }),
          expect.objectContaining({ milestoneType: 'packing' }),
          expect.objectContaining({ milestoneType: 'shipment' }),
        ]),
      });

      // Verify the call had exactly 6 items
      const callArgs = mockTx.orderMilestone.createMany.mock.calls[0][0] as {
        data: Array<{ milestoneType: string; plannedDate: Date }>;
      };
      expect(callArgs.data).toHaveLength(6);
    });

    it('should back-calculate planned dates from delivery_date', async () => {
      const deliveryDate = new Date('2026-12-31');
      const order = mockOrder({ status: 'draft', deliveryDate });
      mockPrisma.order.findUnique.mockResolvedValue(order);
      mockTx.order.update.mockResolvedValue({ ...order, status: 'confirmed' });
      mockPrisma.order.update.mockResolvedValue({ ...order, status: 'confirmed' });

      await service.transitionStatus(
        'order-123',
        { toStatus: 'confirmed' } as StatusTransitionDto,
        CONFIRMED_BY_USER,
      );

      const callArgs = mockTx.orderMilestone.createMany.mock.calls[0][0] as {
        data: Array<{ milestoneType: string; plannedDate: Date }>;
      };

      // Shipment: Dec 31 - 7 = Dec 24
      const shipment = callArgs.data.find((m) => m.milestoneType === 'shipment');
      expect(shipment?.plannedDate.toISOString().split('T')[0]).toBe('2026-12-24');

      // Packing: Dec 31 - 14 = Dec 17
      const packing = callArgs.data.find((m) => m.milestoneType === 'packing');
      expect(packing?.plannedDate.toISOString().split('T')[0]).toBe('2026-12-17');

      // Material booking: Dec 31 - 90 = Oct 2
      const matBooking = callArgs.data.find((m) => m.milestoneType === 'material_booking');
      expect(matBooking?.plannedDate.toISOString().split('T')[0]).toBe('2026-10-02');
    });

    it('should NOT generate milestones on non-confirm transitions', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(
        mockOrder({ status: 'in_production', sampleApproved: true }),
      );
      mockPrisma.order.update.mockResolvedValue(
        mockOrder({ status: 'qc' }),
      );

      await service.transitionStatus('order-123', {
        toStatus: 'qc',
      } as StatusTransitionDto);

      // $transaction should NOT have been called (non-confirm transitions
      // don't use a transaction)
      expect(mockTx.orderMilestone.createMany).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Acceptance Test 5: OrderConfirmedEvent emitted post-commit
  // =========================================================================

  describe('transitionStatus() — event emission', () => {
    it('should emit OrderConfirmedEvent after confirming an order', async () => {
      const order = mockOrder({ status: 'draft', deliveryDate: new Date('2026-12-31') });
      mockPrisma.order.findUnique.mockResolvedValue(order);
      mockTx.order.update.mockResolvedValue({ ...order, status: 'confirmed' });
      mockPrisma.order.update.mockResolvedValue({ ...order, status: 'confirmed' });

      await service.transitionStatus(
        'order-123',
        { toStatus: 'confirmed' } as StatusTransitionDto,
        CONFIRMED_BY_USER,
      );

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'order.confirmed',
        expect.any(OrderConfirmedEvent),
      );

      const emittedEvent = mockEventEmitter.emit.mock.calls[0][1] as OrderConfirmedEvent;
      expect(emittedEvent.orderId).toBe('order-123');
      expect(emittedEvent.buyerId).toBe('buyer-1');
      expect(emittedEvent.confirmedBy).toBe(CONFIRMED_BY_USER);
    });

    it('should reject confirm without authenticated userId', async () => {
      const order = mockOrder({ status: 'draft', deliveryDate: new Date('2026-12-31') });
      mockPrisma.order.findUnique.mockResolvedValue(order);

      await expect(
        service.transitionStatus('order-123', {
          toStatus: 'confirmed',
        } as StatusTransitionDto),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should NOT emit event if milestone generation fails (rollback scenario)', async () => {
      const order = mockOrder({ status: 'draft', deliveryDate: new Date('2026-12-31') });
      mockPrisma.order.findUnique.mockResolvedValue(order);

      // Simulate milestone generation failure inside transaction
      mockPrisma.$transaction.mockImplementation(async () => {
        throw new Error('Simulated milestone generation failure');
      });

      try {
        await service.transitionStatus(
          'order-123',
          { toStatus: 'confirmed' } as StatusTransitionDto,
          CONFIRMED_BY_USER,
        );
        fail('Should have thrown');
      } catch (_e) {
        // Transaction failed — event should NOT have been emitted
      }

      // Event should NOT have been emitted because the transaction rolled back
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should NOT emit event on non-confirm transitions', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(
        mockOrder({ status: 'in_production', sampleApproved: true }),
      );
      mockPrisma.order.update.mockResolvedValue(mockOrder({ status: 'qc' }));

      await service.transitionStatus('order-123', {
        toStatus: 'qc',
      } as StatusTransitionDto);

      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should emit event AFTER the transaction, not inside it', async () => {
      const callOrder: string[] = [];

      // Set up a proper transaction mock that exposes tx.order.update
      mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
        callOrder.push('transaction');
        // Ensure mockTx.order.update is set up for this test
        mockTx.order.update = jest.fn().mockResolvedValue(
          mockOrder({ status: 'confirmed' }),
        );
        mockTx.orderMilestone.createMany = jest.fn().mockResolvedValue({ count: 6 });
        const result = await cb(mockTx);
        callOrder.push('transaction-done');
        return result;
      });

      mockEventEmitter.emit.mockImplementation(() => {
        callOrder.push('event-emitted');
      });

      const order = mockOrder({ status: 'draft', deliveryDate: new Date('2026-12-31') });
      mockPrisma.order.findUnique.mockResolvedValue(order);
      mockPrisma.order.update.mockResolvedValue({ ...order, status: 'confirmed' });

      await service.transitionStatus(
        'order-123',
        { toStatus: 'confirmed' } as StatusTransitionDto,
        CONFIRMED_BY_USER,
      );

      // Event MUST be emitted after transaction completes
      expect(callOrder).toEqual(['transaction', 'transaction-done', 'event-emitted']);
    });
  });

  // =========================================================================
  // Acceptance Test 6 (partial): Cancel transition
  // =========================================================================

  describe('transitionStatus() — cancel', () => {
    it('should cancel a draft order with reason', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(mockOrder({ status: 'draft' }));
      mockPrisma.order.update.mockResolvedValue(
        mockOrder({ status: 'cancelled', cancellationReason: 'Test reason' }),
      );

      const result = await service.transitionStatus('order-123', {
        toStatus: 'cancelled',
        cancellationReason: 'Test reason',
      } as StatusTransitionDto);

      expect(result.status).toBe('cancelled');
      expect(mockPrisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'cancelled',
            cancellationReason: 'Test reason',
          }),
        }),
      );
    });

    it('should reject cancel without reason', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(mockOrder({ status: 'draft' }));

      await expect(
        service.transitionStatus('order-123', {
          toStatus: 'cancelled',
        } as StatusTransitionDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject cancelling a packed order', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(mockOrder({ status: 'packed' }));

      await expect(
        service.transitionStatus('order-123', {
          toStatus: 'cancelled',
          cancellationReason: 'test',
        } as StatusTransitionDto),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
