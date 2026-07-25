// =============================================================================
// OrdersService — Unit Tests
// =============================================================================
// OK Footwear ERP — Sprint 3
//
// TC-ORD-U-001 · Order number auto-generated in ORD-NNNNNN format
// TC-ORD-U-002 · Status machine: draft → confirmed is a valid transition
// TC-ORD-U-003 · Invalid transition draft → in_production rejected with message
// TC-ORD-U-004 · confirmed → in_production blocked when sample_approved = false
// TC-ORD-U-005 · OrderConfirmedEvent fired with correct orderId payload
// TC-ORD-U-006 · 6 milestone records auto-generated with correct planned_dates
// =============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@shared/database/prisma.service';
import { CorrelationStore } from '@shared/logger/correlation-store';

import { OrdersService } from './orders.service';
import {
  STATUS_TRANSITIONS,
  OrderStatus,
} from './order-state-machine';
import { OrderConfirmedEvent } from '../events/order-confirmed.event';
import {
  SHIPMENT_LEAD_DAYS,
  PACKING_LEAD_DAYS,
  QC_LEAD_DAYS,
  BULK_START_LEAD_DAYS,
  PP_SAMPLE_LEAD_DAYS,
  MATERIAL_BOOKING_LEAD_DAYS,
} from './orders.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pure date helper — mirrors the private addDays() in orders.service.ts.
 *  Used here to compute expected milestone dates using the exported constants,
 *  not hardcoded magic numbers. */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Compute expected milestone planned_dates from a delivery_date using the
 * same formula as generateMilestonesInTx().  The test imports the real
 * constants — if they change, the test changes with them.
 */
function computeExpectedMilestones(deliveryDate: Date) {
  const del = new Date(deliveryDate);
  return {
    material_booking: addDays(del, -MATERIAL_BOOKING_LEAD_DAYS),
    pp_sample: addDays(del, -PP_SAMPLE_LEAD_DAYS),
    bulk_start: addDays(del, -BULK_START_LEAD_DAYS),
    qc: addDays(del, -QC_LEAD_DAYS),
    packing: addDays(del, -PACKING_LEAD_DAYS),
    shipment: addDays(del, -SHIPMENT_LEAD_DAYS),
  };
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

/** Creates a minimal mock order object as returned by prisma.order.findUnique */
function mockOrder(overrides: Partial<{
  id: string;
  orderNumber: string;
  status: OrderStatus;
  sampleApproved: boolean;
  deliveryDate: Date;
  buyerId: string;
  articleId: string;
  totalQuantity: number;
  currency: string;
}> = {}): Record<string, unknown> {
  return {
    id: overrides.id ?? 'test-order-id',
    orderNumber: overrides.orderNumber ?? 'ORD-000042',
    status: overrides.status ?? 'draft',
    sampleApproved: overrides.sampleApproved ?? false,
    deliveryDate: overrides.deliveryDate ?? new Date('2025-12-01'),
    buyerId: overrides.buyerId ?? 'test-buyer-id',
    articleId: overrides.articleId ?? 'test-article-id',
    totalQuantity: overrides.totalQuantity ?? 1000,
    currency: overrides.currency ?? 'USD',
    orderLines: [],
  };
}

// =============================================================================
// Test Suite
// =============================================================================

describe('OrdersService', () => {
  let service: OrdersService;
  let callOrder: string[];

  // --- Shared mocks ---
  const mockEmit = jest.fn();
  const mockTxClient = {
    buyer: { findUnique: jest.fn(), findFirst: jest.fn() },
    article: { findUnique: jest.fn(), findFirst: jest.fn() },
    order: { create: jest.fn(), update: jest.fn() },
    orderMilestone: { createMany: jest.fn() },
    $queryRawUnsafe: jest.fn(),
  };

  const mockPrisma = {
    order: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    buyer: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    article: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    orderMilestone: {
      createMany: jest.fn(),
    },
    $transaction: jest.fn(),
    $queryRawUnsafe: jest.fn(),
  };

  const mockEventEmitter = {
    emit: mockEmit,
  };

  // -------------------------------------------------------------------
  // beforeEach — reset all mocks and build the testing module
  // -------------------------------------------------------------------

  beforeEach(async () => {
    jest.clearAllMocks();
    callOrder = [];

    // Reset deep mocks on txClient
    mockTxClient.buyer.findUnique.mockReset();
    mockTxClient.buyer.findFirst.mockReset();
    mockTxClient.article.findUnique.mockReset();
    mockTxClient.article.findFirst.mockReset();
    mockTxClient.order.create.mockReset();
    mockTxClient.order.update.mockReset();
    mockTxClient.orderMilestone.createMany.mockReset();
    mockTxClient.$queryRawUnsafe.mockReset();

    // Default: $transaction forwards to the tx client mock.
    // Individual tests override this when they need specific tx behavior.
    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: typeof mockTxClient) => unknown) => cb(mockTxClient),
    );

    // Mock CorrelationStore to return a known userId for confirmedBy
    jest.spyOn(CorrelationStore, 'getStore').mockReturnValue({
      correlationId: 'test-correlation-id',
      userId: 'test-user-id',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  // =========================================================================
  // TC-ORD-U-002 · draft → confirmed is a valid transition
  // =========================================================================

  describe('TC-ORD-U-002 · Status machine: draft → confirmed is a valid transition', () => {
    it('STATUS_TRANSITIONS map permits draft → confirmed', () => {
      // Direct assertion on the map — if this changes, the test fails explicitly.
      expect(STATUS_TRANSITIONS['draft']).toContain('confirmed');
    });

    it('transitionStatus() resolves without throwing for draft → confirmed', async () => {
      const order = mockOrder({ status: 'draft', sampleApproved: false });

      mockPrisma.order.findUnique.mockResolvedValue(order);

      // The confirm path uses $transaction again for the update + milestones.
      // Override $transaction for this test to simulate the confirm tx.
      mockPrisma.$transaction.mockImplementationOnce(
        async (cb: (tx: typeof mockTxClient) => unknown) => {
          // Inside the confirm tx, resolve update + createMany
          mockTxClient.order.update.mockResolvedValue({
            ...order,
            status: 'confirmed',
            confirmedAt: new Date(),
            confirmedBy: 'test-user-id',
          });
          mockTxClient.orderMilestone.createMany.mockResolvedValue({ count: 6 });
          return cb(mockTxClient);
        },
      );

      await expect(
        service.transitionStatus('test-order-id', { toStatus: 'confirmed' }),
      ).resolves.toBeDefined();

      // Verify update was called with confirmed status
      expect(mockTxClient.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'confirmed' }),
        }),
      );
    });
  });

  // =========================================================================
  // TC-ORD-U-003 · Invalid transition draft → in_production rejected
  // =========================================================================

  describe('TC-ORD-U-003 · Invalid transition draft → in_production rejected with message', () => {
    it('should reject draft → in_production with a descriptive BadRequestException', async () => {
      const order = mockOrder({ status: 'draft', sampleApproved: true });
      // sampleApproved: true isolates this from TC-ORD-U-004's gate.
      // The rejection is purely because the transition isn't in the map.

      mockPrisma.order.findUnique.mockResolvedValue(order);

      await expect(
        service.transitionStatus('test-order-id', { toStatus: 'in_production' }),
      ).rejects.toThrow(BadRequestException);

      // Verify the error message references both states
      try {
        await service.transitionStatus('test-order-id', { toStatus: 'in_production' });
      } catch (err) {
        const be = err as BadRequestException;
        const response = be.getResponse() as { detail?: string; message?: string };
        const detail = response.detail ?? response.message ?? '';
        expect(detail).toMatch(/draft/i);
        expect(detail).toMatch(/in_production/i);
      }
    });

    it('should NOT call prisma.order.update when transition is rejected', async () => {
      const order = mockOrder({ status: 'draft', sampleApproved: true });
      mockPrisma.order.findUnique.mockResolvedValue(order);

      // Reset transaction mock so the tx path is never entered
      mockPrisma.$transaction.mockReset();

      await expect(
        service.transitionStatus('test-order-id', { toStatus: 'in_production' }),
      ).rejects.toThrow(BadRequestException);

      // No update call should have occurred — not on the tx client, not on prisma
      expect(mockPrisma.order.update).toHaveBeenCalledTimes(0);
      expect(mockTxClient.order.update).toHaveBeenCalledTimes(0);
      // $transaction itself should not have been called
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(0);
    });
  });

  // =========================================================================
  // TC-ORD-U-004 · confirmed → in_production blocked when sample_approved = false
  // =========================================================================

  describe('TC-ORD-U-004 · confirmed → in_production blocked when sample_approved = false', () => {
    it('should reject when sample_approved is false', async () => {
      const order = mockOrder({ status: 'confirmed', sampleApproved: false });
      mockPrisma.order.findUnique.mockResolvedValue(order);

      await expect(
        service.transitionStatus('test-order-id', { toStatus: 'in_production' }),
      ).rejects.toThrow(BadRequestException);

      // Verify error message references sample approval
      try {
        await service.transitionStatus('test-order-id', { toStatus: 'in_production' });
      } catch (err) {
        const be = err as BadRequestException;
        const response = be.getResponse() as { detail?: string; message?: string };
        const detailOrMessage = (response.detail ?? response.message ?? '').toLowerCase();
        expect(detailOrMessage).toMatch(/sample/);
      }

      // No update should have occurred
      expect(mockPrisma.order.update).toHaveBeenCalledTimes(0);
    });

    it('should resolve when sample_approved is true (gate passes)', async () => {
      const order = mockOrder({ status: 'confirmed', sampleApproved: true });
      mockPrisma.order.findUnique.mockResolvedValue(order);

      // For non-confirm transitions (confirmed → in_production), the service
      // calls prisma.order.update directly (no inner $transaction).
      mockPrisma.order.update.mockResolvedValue({
        ...order,
        status: 'in_production',
      });

      await expect(
        service.transitionStatus('test-order-id', { toStatus: 'in_production' }),
      ).resolves.toBeDefined();

      expect(mockPrisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'in_production' }),
        }),
      );
    });
  });

  // =========================================================================
  // TC-ORD-U-001 · Order number auto-generated in ORD-NNNNNN format
  // =========================================================================

  describe('TC-ORD-U-001 · Order number auto-generated in ORD-NNNNNN format', () => {
    /**
     * Helper: sets up the create() mocks for a given sequence number.
     * Returns the captured create args so the test can assert on them.
     */
    async function setupCreateTest(seqNumber: number): Promise<{
      capturedCreateArgs: Record<string, unknown> | null;
    }> {
      const formatted = `ORD-${String(seqNumber).padStart(6, '0')}`;
      let capturedCreateArgs: Record<string, unknown> | null = null;

      // Mock the tx-level $queryRawUnsafe to return the doc number
      mockTxClient.$queryRawUnsafe.mockResolvedValue([
        { next_doc_number: formatted },
      ]);

      // Mock buyer/article validation in tx
      mockTxClient.buyer.findUnique.mockResolvedValue({
        id: 'test-buyer-id',
        isActive: true,
        deletedAt: null,
      });
      mockTxClient.article.findUnique.mockResolvedValue({
        id: 'test-article-id',
        isActive: true,
        deletedAt: null,
      });

      // Capture the order.create args
      mockTxClient.order.create.mockImplementation(async (args: { data: Record<string, unknown> }) => {
        capturedCreateArgs = args;
        return {
          id: 'new-order-id',
          orderNumber: args.data.orderNumber,
          status: 'draft',
        };
      });

      await service.create({
        buyerId: 'test-buyer-id',
        articleId: 'test-article-id',
        totalQuantity: 100,
        deliveryDate: '2026-06-01',
        currency: 'USD',
        orderLines: [{ sizeLabel: '42', quantity: 100, unitPrice: 12.5 }],
      });

      return { capturedCreateArgs };
    }

    it('should call create with order_number matching ORD-NNNNNN pattern', async () => {
      const { capturedCreateArgs } = await setupCreateTest(1);
      const orderNumber = capturedCreateArgs?.data
        ? (capturedCreateArgs.data as Record<string, unknown>).orderNumber
        : null;

      expect(orderNumber).toMatch(/^ORD-\d{6}$/);
    });

    it('should zero-pad sequence 1 to ORD-000001', async () => {
      const { capturedCreateArgs } = await setupCreateTest(1);
      const orderNumber = capturedCreateArgs?.data
        ? (capturedCreateArgs.data as Record<string, unknown>).orderNumber
        : null;

      expect(orderNumber).toBe('ORD-000001');
    });

    it('should zero-pad sequence 42 to ORD-000042', async () => {
      const { capturedCreateArgs } = await setupCreateTest(42);
      const orderNumber = capturedCreateArgs?.data
        ? (capturedCreateArgs.data as Record<string, unknown>).orderNumber
        : null;

      expect(orderNumber).toBe('ORD-000042');
    });

    it('should call $queryRawUnsafe exactly once per create() call', async () => {
      // Reset before this specific test
      mockTxClient.$queryRawUnsafe.mockReset();
      mockTxClient.$queryRawUnsafe.mockResolvedValue([
        { next_doc_number: 'ORD-000001' },
      ]);
      mockTxClient.buyer.findUnique.mockResolvedValue({
        id: 'test-buyer-id',
        isActive: true,
        deletedAt: null,
      });
      mockTxClient.article.findUnique.mockResolvedValue({
        id: 'test-article-id',
        isActive: true,
        deletedAt: null,
      });
      mockTxClient.order.create.mockResolvedValue({
        id: 'new-order-id',
        orderNumber: 'ORD-000001',
        status: 'draft',
      });

      await service.create({
        buyerId: 'test-buyer-id',
        articleId: 'test-article-id',
        totalQuantity: 100,
        deliveryDate: '2026-06-01',
        currency: 'USD',
        orderLines: [{ sizeLabel: '42', quantity: 100, unitPrice: 12.5 }],
      });

      // $queryRawUnsafe should be called exactly once — no double-consumption
      expect(mockTxClient.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // TC-ORD-U-005 · OrderConfirmedEvent fired with correct payload
  // =========================================================================

  describe('TC-ORD-U-005 · OrderConfirmedEvent fired with correct orderId payload on confirmation', () => {
    it('should emit OrderConfirmedEvent with correct payload', async () => {
      const deliveryDate = new Date('2025-12-01');
      const order = mockOrder({
        id: 'order-confirm-event-id',
        status: 'draft',
        deliveryDate,
        buyerId: 'buyer-event-id',
        sampleApproved: false,
      });

      mockPrisma.order.findUnique.mockResolvedValue(order);

      // Override $transaction for the confirm path with call-order tracking
      mockPrisma.$transaction.mockImplementationOnce(
        async (cb: (tx: typeof mockTxClient) => unknown) => {
          mockTxClient.order.update.mockImplementation(async () => {
            callOrder.push('db_update');
            return {
              ...order,
              status: 'confirmed',
              confirmedAt: new Date(),
              confirmedBy: 'test-user-id',
            };
          });
          mockTxClient.orderMilestone.createMany.mockResolvedValue({ count: 6 });
          return cb(mockTxClient);
        },
      );

      // Track emit calls
      mockEmit.mockImplementation(() => {
        callOrder.push('event_emit');
      });

      await service.transitionStatus('order-confirm-event-id', {
        toStatus: 'confirmed',
      });

      // 1. emit was called exactly once
      expect(mockEmit).toHaveBeenCalledTimes(1);

      // 2. First argument is the event name
      expect(mockEmit).toHaveBeenCalledWith(
        'order.confirmed',
        expect.any(OrderConfirmedEvent),
      );

      // 3. Second argument is an OrderConfirmedEvent instance
      const emittedEvent: OrderConfirmedEvent = mockEmit.mock.calls[0][1];
      expect(emittedEvent).toBeInstanceOf(OrderConfirmedEvent);

      // 4. Payload fields match
      expect(emittedEvent.orderId).toBe('order-confirm-event-id');
      expect(emittedEvent.deliveryDate).toEqual(deliveryDate);
      expect(emittedEvent.buyerId).toBe('buyer-event-id');
      expect(emittedEvent.confirmedBy).toBe('test-user-id');
    });

    it('should emit event AFTER the DB update resolves (post-commit ordering)', async () => {
      const order = mockOrder({ status: 'draft', sampleApproved: false });
      mockPrisma.order.findUnique.mockResolvedValue(order);

      mockPrisma.$transaction.mockImplementationOnce(
        async (cb: (tx: typeof mockTxClient) => unknown) => {
          mockTxClient.order.update.mockImplementation(async () => {
            callOrder.push('db_update');
            return {
              ...order,
              status: 'confirmed',
              confirmedAt: new Date(),
              confirmedBy: 'test-user-id',
            };
          });
          mockTxClient.orderMilestone.createMany.mockResolvedValue({ count: 6 });
          return cb(mockTxClient);
        },
      );

      mockEmit.mockImplementation(() => {
        callOrder.push('event_emit');
      });

      await service.transitionStatus('test-order-id', {
        toStatus: 'confirmed',
      });

      const updateIndex = callOrder.indexOf('db_update');
      const emitIndex = callOrder.indexOf('event_emit');

      expect(updateIndex).toBeGreaterThanOrEqual(0);
      expect(emitIndex).toBeGreaterThanOrEqual(0);
      // Post-commit guarantee: emit must happen after update
      expect(updateIndex).toBeLessThan(emitIndex);
    });
  });

  // =========================================================================
  // TC-ORD-U-006 · 6 milestone records auto-generated with correct planned_dates
  // =========================================================================

  describe('TC-ORD-U-006 · 6 milestone records auto-generated with correct planned_dates', () => {
    const deliveryDate = new Date('2026-06-01');
    const expectedDates = computeExpectedMilestones(deliveryDate);

    /** Run a confirm transition and return the captured createMany args. */
    async function captureMilestones(): Promise<{
      data: Array<{
        milestoneType: string;
        plannedDate: Date;
        status: string;
        actualDate?: null;   // undefined in mock (Prisma defaults to NULL in DB)
        orderId?: string;
      }>;
    } | null> {
      const order = mockOrder({
        id: 'milestone-order-id',
        status: 'draft',
        deliveryDate,
        sampleApproved: false,
      });

      mockPrisma.order.findUnique.mockResolvedValue(order);

      let capturedData: Array<Record<string, unknown>> | null = null;

      mockPrisma.$transaction.mockImplementationOnce(
        async (cb: (tx: typeof mockTxClient) => unknown) => {
          mockTxClient.order.update.mockResolvedValue({
            ...order,
            status: 'confirmed',
            confirmedAt: new Date(),
            confirmedBy: 'test-user-id',
            deliveryDate,
          });
          mockTxClient.orderMilestone.createMany.mockImplementation(
            async (args: { data: Array<Record<string, unknown>> }) => {
              capturedData = args.data;
              callOrder.push('milestone_create');
              return { count: 6 };
            },
          );
          return cb(mockTxClient);
        },
      );

      await service.transitionStatus('milestone-order-id', {
        toStatus: 'confirmed',
      });

      if (!capturedData) return null;
      return {
        data: capturedData as Array<{
          milestoneType: string;
          plannedDate: Date;
          status: string;
          actualDate: null;
        }>,
      };
    }

    it('should call createMany exactly once', async () => {
      const result = await captureMilestones();
      expect(result).not.toBeNull();
      // Proves it's a single createMany, not 6 individual create() calls
      expect(mockTxClient.orderMilestone.createMany).toHaveBeenCalledTimes(1);
    });

    it('should generate exactly 6 milestone rows', async () => {
      const result = await captureMilestones();
      expect(result).not.toBeNull();
      expect(result!.data).toHaveLength(6);
    });

    it('should contain all 6 expected milestone types with no duplicates', async () => {
      const result = await captureMilestones();
      expect(result).not.toBeNull();

      const types = result!.data.map((m) => m.milestoneType).sort();
      const expectedTypes = [
        'bulk_start',
        'material_booking',
        'packing',
        'pp_sample',
        'qc',
        'shipment',
      ];

      expect(types).toEqual(expectedTypes);
      // No duplicates
      expect(new Set(types).size).toBe(6);
    });

    it('should compute planned_date using the lead-time constants', async () => {
      const result = await captureMilestones();
      expect(result).not.toBeNull();

      for (const milestone of result!.data) {
        const type = milestone.milestoneType as keyof typeof expectedDates;
        const expected = expectedDates[type];

        expect(expected).toBeDefined();
        // Compare date strings to avoid timezone issues in unit tests.
        // The implementation uses addDays() which works in local time,
        // and the test mirrors that same function — so toDateString()
        // comparison is safe and deterministic.
        expect(milestone.plannedDate.toDateString()).toBe(expected.toDateString());
      }
    });

    it('should set status: pending and actual_date: null for all milestones', async () => {
      const result = await captureMilestones();
      expect(result).not.toBeNull();

      for (const milestone of result!.data) {
        expect(milestone.status).toBe('pending');
        // actualDate is never set by generateMilestonesInTx —
        // Prisma defaults it to NULL in the DB; in the mock it's undefined.
        expect(milestone.actualDate).toBeUndefined();
      }
    });

    it('should create all 6 rows in a single createMany call (not 6 individual creates)', async () => {
      const result = await captureMilestones();
      expect(result).not.toBeNull();

      // The single createMany call should have all 6 rows
      expect(mockTxClient.orderMilestone.createMany).toHaveBeenCalledTimes(1);
      expect(result!.data).toHaveLength(6);
    });
  });
});
