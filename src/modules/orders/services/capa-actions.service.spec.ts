// =============================================================================
// CapaActionsService — Unit Tests
// =============================================================================
// OK Footwear ERP — Sprint 4
//
// TC-ORD-U-008 · CAPA action with past due_date rejected with validation error
// =============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@shared/database/prisma.service';
import { CapaActionsService } from './capa-actions.service';
import { ComplaintResolvedEvent } from '../events/complaint-resolved.event';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const mockEmit = jest.fn();

const mockPrisma = {
  complaint: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  capaAction: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockEventEmitter = {
  emit: mockEmit,
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('CapaActionsService', () => {
  let service: CapaActionsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default: $transaction runs both queries and returns the callback result.
    // We use mockImplementation to simulate real transaction behavior.
    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: unknown) => unknown) => cb(mockPrisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CapaActionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<CapaActionsService>(CapaActionsService);
  });

  // =========================================================================
  // TC-ORD-U-008 · CAPA action with past due_date rejected
  // =========================================================================

  describe('TC-ORD-U-008 · create() rejects past due_date', () => {
    const complaintId = 'test-complaint-id';

    it('should throw BadRequestException when due_date is in the past', async () => {
      // Mock: complaint exists and is not resolved
      mockPrisma.complaint.findUnique.mockResolvedValue({
        id: complaintId,
        status: 'open',
      });

      // due_date is 2020-01-01 — definitely in the past
      await expect(
        service.create(complaintId, {
          description: 'Audit adhesive curing temperature logs',
          ownerId: 'owner-uuid',
          dueDate: '2020-01-01',
        }),
      ).rejects.toThrow(BadRequestException);

      // Verify the error message references the due date
      try {
        await service.create(complaintId, {
          description: 'Audit adhesive curing temperature logs',
          ownerId: 'owner-uuid',
          dueDate: '2020-01-01',
        });
      } catch (err) {
        const be = err as BadRequestException;
        const response = be.getResponse() as { detail?: string; message?: string };
        const detailOrMessage = (response.detail ?? response.message ?? '').toLowerCase();
        expect(detailOrMessage).toMatch(/due.date|future/);
      }
    });

    it('should NOT create any record when due_date validation fails', async () => {
      mockPrisma.complaint.findUnique.mockResolvedValue({
        id: complaintId,
        status: 'open',
      });

      await expect(
        service.create(complaintId, {
          description: 'Fix something',
          ownerId: 'owner-uuid',
          dueDate: '2019-06-01',
        }),
      ).rejects.toThrow(BadRequestException);

      // prisma.capaAction.create must NOT be called
      expect(mockPrisma.capaAction.create).toHaveBeenCalledTimes(0);
    });

    it('should allow creation when due_date is in the future', async () => {
      mockPrisma.complaint.findUnique.mockResolvedValue({
        id: complaintId,
        status: 'open',
      });

      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      mockPrisma.capaAction.create.mockResolvedValue({
        id: 'new-capa-id',
        complaintId,
        description: 'Valid future action',
        ownerId: 'owner-uuid',
        dueDate: futureDate,
        status: 'open',
        closedAt: null,
        evidence: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.create(complaintId, {
        description: 'Valid future action',
        ownerId: 'owner-uuid',
        dueDate: futureDate.toISOString().split('T')[0]!,
      });

      expect(result).toBeDefined();
      expect(mockPrisma.capaAction.create).toHaveBeenCalledTimes(1);
    });

    it('should reject when complaint is already resolved', async () => {
      mockPrisma.complaint.findUnique.mockResolvedValue({
        id: complaintId,
        status: 'resolved',
      });

      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      await expect(
        service.create(complaintId, {
          description: 'Fix resolved complaint',
          ownerId: 'owner-uuid',
          dueDate: futureDate.toISOString().split('T')[0]!,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.capaAction.create).toHaveBeenCalledTimes(0);
    });
  });
});
