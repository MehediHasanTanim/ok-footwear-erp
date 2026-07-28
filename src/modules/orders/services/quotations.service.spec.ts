// =============================================================================
// QuotationsService — Unit Tests
// =============================================================================
// OK Footwear ERP — Sprint 4
//
// TC-ORD-U-007 · Quotation marks as lost with outcome_reason correctly stored
// =============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@shared/database/prisma.service';
import { DocNumberService } from './doc-number.service';
import { QuotationsService } from './quotations.service';
import { QuotationWonEvent } from '../events/quotation-won.event';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const mockEmit = jest.fn();

const mockPrisma = {
  order: {
    findUnique: jest.fn(),
  },
  quotation: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    groupBy: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockDocNumber = {
  generate: jest.fn(),
};

const mockEventEmitter = {
  emit: mockEmit,
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('QuotationsService', () => {
  let service: QuotationsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default: $transaction forwards to the callback
    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: unknown) => unknown) => cb(mockPrisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DocNumberService, useValue: mockDocNumber },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<QuotationsService>(QuotationsService);
  });

  // =========================================================================
  // TC-ORD-U-007 · Quotation marks as lost with outcome_reason stored
  // =========================================================================

  describe('TC-ORD-U-007 · Quotation close() — lost with outcome_reason', () => {
    const quotationId = 'test-quotation-id';
    const orderId = 'test-order-id';

    it('should store outcome_reason and set status to lost', async () => {
      // Mock: quotation is in 'sent' status
      mockPrisma.quotation.findUnique.mockResolvedValue({
        id: quotationId,
        orderId,
        quotationNumber: 'QUO-2026-000001',
        status: 'sent',
        quotedPrice: null,
      });

      // Mock: update captures the data
      let capturedData: Record<string, unknown> | null = null;
      mockPrisma.quotation.update.mockImplementation(async (args: { data: Record<string, unknown> }) => {
        capturedData = args.data;
        return { ...args.data, id: quotationId };
      });

      await service.close(quotationId, {
        outcome: 'lost',
        outcomeReason: 'Buyer chose competitor due to lower pricing',
      });

      // Assert update was called
      expect(mockPrisma.quotation.update).toHaveBeenCalledTimes(1);

      // Assert status is 'lost'
      expect(capturedData).not.toBeNull();
      expect(capturedData!.status).toBe('lost');

      // Assert outcome_reason is stored
      expect(capturedData!.outcomeReason).toBe('Buyer chose competitor due to lower pricing');

      // Assert closed_at is set
      expect(capturedData!.closedAt).toBeInstanceOf(Date);
    });

    it('should NOT emit QuotationWonEvent when outcome is lost', async () => {
      mockPrisma.quotation.findUnique.mockResolvedValue({
        id: quotationId,
        orderId,
        quotationNumber: 'QUO-2026-000001',
        status: 'sent',
        quotedPrice: null,
      });

      mockPrisma.quotation.update.mockResolvedValue({
        id: quotationId,
        status: 'lost',
        outcomeReason: 'Buyer went with competitor',
        closedAt: new Date(),
      });

      await service.close(quotationId, {
        outcome: 'lost',
        outcomeReason: 'Buyer went with competitor',
      });

      // QuotationWonEvent must NOT be emitted for 'lost' outcome
      expect(mockEmit).not.toHaveBeenCalledWith(
        'quotation.won',
        expect.any(QuotationWonEvent),
      );
      expect(mockEmit).not.toHaveBeenCalled();
    });

    it('should reject close when quotation is not in sent status', async () => {
      mockPrisma.quotation.findUnique.mockResolvedValue({
        id: quotationId,
        orderId,
        quotationNumber: 'QUO-2026-000001',
        status: 'draft', // not 'sent'
        quotedPrice: null,
      });

      await expect(
        service.close(quotationId, {
          outcome: 'lost',
          outcomeReason: 'No longer interested',
        }),
      ).rejects.toThrow(BadRequestException);

      // Update should not be called
      expect(mockPrisma.quotation.update).toHaveBeenCalledTimes(0);
    });

    it('should reject close when quotation not found', async () => {
      mockPrisma.quotation.findUnique.mockResolvedValue(null);

      await expect(
        service.close(quotationId, {
          outcome: 'lost',
          outcomeReason: 'N/A',
        }),
      ).rejects.toThrow('Quotation not found');

      expect(mockPrisma.quotation.update).toHaveBeenCalledTimes(0);
    });
  });

  // =========================================================================
  // Bonus: won outcome emits QuotationWonEvent
  // =========================================================================

  describe('close() — won outcome emits QuotationWonEvent', () => {
    const quotationId = 'test-quotation-id';
    const orderId = 'test-order-id';

    it('should emit QuotationWonEvent when outcome is won', async () => {
      mockPrisma.quotation.findUnique.mockResolvedValue({
        id: quotationId,
        orderId,
        quotationNumber: 'QUO-2026-000001',
        status: 'sent',
        quotedPrice: { toNumber: () => 12500 },
      });

      // No existing won quotation
      mockPrisma.quotation.count.mockResolvedValue(0);

      mockPrisma.quotation.update.mockResolvedValue({
        id: quotationId,
        status: 'won',
        closedAt: new Date(),
      });

      await service.close(quotationId, {
        outcome: 'won',
      });

      expect(mockEmit).toHaveBeenCalledTimes(1);
      expect(mockEmit).toHaveBeenCalledWith(
        'quotation.won',
        expect.objectContaining({
          quotationId,
          orderId,
          quotedPrice: 12500,
        }),
      );
    });

    it('should reject second won quotation with ConflictException', async () => {
      mockPrisma.quotation.findUnique.mockResolvedValue({
        id: quotationId,
        orderId,
        quotationNumber: 'QUO-2026-000002',
        status: 'sent',
        quotedPrice: null,
      });

      // Another quotation already won for this order
      mockPrisma.quotation.count.mockResolvedValue(1);

      await expect(
        service.close(quotationId, { outcome: 'won' }),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.quotation.update).toHaveBeenCalledTimes(0);
    });
  });
});
