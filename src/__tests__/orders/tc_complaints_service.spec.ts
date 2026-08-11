// =============================================================================
// ComplaintsService — Unit Tests
// =============================================================================
// OK Footwear ERP — Sprint 4 gap completion
// =============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@shared/database/prisma.service';
import { DocNumberService } from '@modules/orders/services/doc-number.service';
import { ComplaintsService } from '@modules/orders/services/complaints.service';
import { NotificationsService } from '@modules/system/services/notifications.service';
import { ComplaintResolvedEvent } from '@modules/orders/events/complaint-resolved.event';

const mockEmit = jest.fn();

const mockPrisma = {
  order: {
    findUnique: jest.fn(),
  },
  complaint: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockDocNumber = {
  generate: jest.fn(),
};

const mockNotifications = {
  notifyRole: jest.fn(),
};

const mockEventEmitter = {
  emit: mockEmit,
};

const USER_ID = '550e8400-e29b-41d4-a716-446655440010';
const COMPLAINT_ID = '550e8400-e29b-41d4-a716-446655440020';
const ORDER_ID = '550e8400-e29b-41d4-a716-446655440030';

describe('ComplaintsService', () => {
  let service: ComplaintsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: unknown) => unknown) => cb(mockPrisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComplaintsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DocNumberService, useValue: mockDocNumber },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<ComplaintsService>(ComplaintsService);
  });

  describe('create()', () => {
    it('persists raisedBy from authenticated userId', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: ORDER_ID,
        orderNumber: 'ORD-2026-000001',
        status: 'confirmed',
      });
      mockDocNumber.generate.mockResolvedValue('CMP-2026-000001');
      mockPrisma.complaint.create.mockResolvedValue({
        id: COMPLAINT_ID,
        complaintNumber: 'CMP-2026-000001',
        raisedBy: USER_ID,
      });

      await service.create(
        ORDER_ID,
        {
          type: 'quality',
          severity: 'low',
          description: 'Sole separation on size 42',
        },
        USER_ID,
      );

      expect(mockPrisma.complaint.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ raisedBy: USER_ID }),
      });
    });

    it('rejects create when userId is missing', async () => {
      await expect(
        service.create(
          ORDER_ID,
          {
            type: 'quality',
            severity: 'low',
            description: 'Missing user',
          },
          '',
        ),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockPrisma.complaint.create).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus()', () => {
    it('allows open → under_investigation', async () => {
      mockPrisma.complaint.findUnique.mockResolvedValue({
        id: COMPLAINT_ID,
        status: 'open',
      });
      mockPrisma.complaint.update.mockResolvedValue({
        id: COMPLAINT_ID,
        status: 'under_investigation',
      });

      const result = await service.updateStatus(COMPLAINT_ID, {
        status: 'under_investigation',
      });

      expect(result.status).toBe('under_investigation');
      expect(mockEmit).not.toHaveBeenCalled();
    });

    it('allows open → resolved, sets resolvedAt, emits event', async () => {
      mockPrisma.complaint.findUnique.mockResolvedValue({
        id: COMPLAINT_ID,
        status: 'open',
      });

      let captured: Record<string, unknown> | null = null;
      mockPrisma.complaint.update.mockImplementation(async (args: { data: Record<string, unknown> }) => {
        captured = args.data;
        return { id: COMPLAINT_ID, ...args.data };
      });

      await service.updateStatus(COMPLAINT_ID, { status: 'resolved' });

      expect(captured!.status).toBe('resolved');
      expect(captured!.resolvedAt).toBeInstanceOf(Date);
      expect(mockEmit).toHaveBeenCalledWith(
        'complaint.resolved',
        expect.any(ComplaintResolvedEvent),
      );
    });

    it('allows under_investigation → resolved', async () => {
      mockPrisma.complaint.findUnique.mockResolvedValue({
        id: COMPLAINT_ID,
        status: 'under_investigation',
      });
      mockPrisma.complaint.update.mockResolvedValue({
        id: COMPLAINT_ID,
        status: 'resolved',
        resolvedAt: new Date(),
      });

      await service.updateStatus(COMPLAINT_ID, { status: 'resolved' });

      expect(mockEmit).toHaveBeenCalledWith(
        'complaint.resolved',
        expect.objectContaining({ complaintId: COMPLAINT_ID }),
      );
    });

    it('rejects transition from resolved', async () => {
      mockPrisma.complaint.findUnique.mockResolvedValue({
        id: COMPLAINT_ID,
        status: 'resolved',
      });

      await expect(
        service.updateStatus(COMPLAINT_ID, { status: 'open' }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.complaint.update).not.toHaveBeenCalled();
      expect(mockEmit).not.toHaveBeenCalled();
    });

    it('rejects under_investigation → open', async () => {
      mockPrisma.complaint.findUnique.mockResolvedValue({
        id: COMPLAINT_ID,
        status: 'under_investigation',
      });

      await expect(
        service.updateStatus(COMPLAINT_ID, { status: 'open' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
