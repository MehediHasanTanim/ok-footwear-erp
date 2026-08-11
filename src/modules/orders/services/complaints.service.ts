// =============================================================================
// ComplaintsService — Order complaint tracking & escalation
// =============================================================================
// OK Footwear ERP — Sprint 4, Orders Module
// =============================================================================

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@shared/database/prisma.service';
import { DocNumberService } from './doc-number.service';
import { NotificationsService } from '@modules/system/services/notifications.service';
import { ComplaintResolvedEvent } from '../events/complaint-resolved.event';
import {
  CreateComplaintDto,
  UpdateRootCauseDto,
  UpdateComplaintStatusDto,
} from '../dto/complaints.dto';
import type { ComplaintStatus } from '@prisma/client';

/** Allowed manual status transitions (resolved is terminal). */
const ALLOWED_COMPLAINT_TRANSITIONS: Record<ComplaintStatus, ComplaintStatus[]> = {
  open: ['under_investigation', 'resolved'],
  under_investigation: ['resolved'],
  resolved: [],
};

@Injectable()
export class ComplaintsService {
  private readonly logger = new Logger(ComplaintsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly docNumber: DocNumberService,
    private readonly notifications: NotificationsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // =========================================================================
  // Query
  // =========================================================================

  async findByOrder(orderId: string) {
    return this.prisma.complaint.findMany({
      where: { orderId },
      include: {
        capaActions: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(complaintId: string) {
    const complaint = await this.prisma.complaint.findUnique({
      where: { id: complaintId },
      include: {
        capaActions: true,
        order: { select: { id: true, orderNumber: true, status: true } },
      },
    });

    if (!complaint) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Complaint not found',
      });
    }

    return complaint;
  }

  // =========================================================================
  // Create
  // =========================================================================

  async create(orderId: string, dto: CreateComplaintDto, userId: string) {
    if (!userId) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Authentication required',
        detail: 'A valid user identity is required to raise a complaint.',
      });
    }

    // Validate parent order exists
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, orderNumber: true, status: true },
    });

    if (!order) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Order not found',
        detail: `Order ${orderId} does not exist.`,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const complaintNumber = await this.docNumber.generate(tx, 'CMP');

      const complaint = await tx.complaint.create({
        data: {
          complaintNumber,
          orderId,
          type: dto.type,
          severity: dto.severity,
          description: dto.description,
          raisedBy: userId,
        },
      });

      this.logger.log(
        `Complaint created: ${complaintNumber} for order ${order.orderNumber}, severity ${dto.severity}`,
      );

      // --- High/Critical severity → synchronous management notification ---
      if (dto.severity === 'high' || dto.severity === 'critical') {
        await this.notifications.notifyRole(
          'management',
          `[${dto.severity.toUpperCase()}] New complaint on order ${order.orderNumber}`,
          `${dto.severity} severity complaint (${complaintNumber}): ${dto.description.substring(0, 100)}`,
          'complaint.escalated',
          complaint.id,
        );
        this.logger.log(
          `Management notified for ${dto.severity} severity complaint ${complaintNumber}`,
        );
      }

      return complaint;
    });
  }

  // =========================================================================
  // Update Root Cause
  // =========================================================================

  async updateRootCause(complaintId: string, dto: UpdateRootCauseDto) {
    const complaint = await this.prisma.complaint.findUnique({
      where: { id: complaintId },
    });

    if (!complaint) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Complaint not found',
      });
    }

    if (complaint.status === 'resolved') {
      throw new BadRequestException({
        statusCode: 422,
        message: 'Cannot update resolved complaint',
        detail: 'Root cause cannot be updated on a resolved complaint.',
      });
    }

    return this.prisma.complaint.update({
      where: { id: complaintId },
      data: { rootCause: dto.rootCause },
    });
  }

  // =========================================================================
  // Update Status (manual workflow including zero-CAPA resolve)
  // =========================================================================

  async updateStatus(complaintId: string, dto: UpdateComplaintStatusDto) {
    const complaint = await this.prisma.complaint.findUnique({
      where: { id: complaintId },
    });

    if (!complaint) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Complaint not found',
      });
    }

    const from = complaint.status;
    const to = dto.status;

    if (from === to) {
      return complaint;
    }

    const allowed = ALLOWED_COMPLAINT_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new BadRequestException({
        statusCode: 422,
        message: 'Invalid status transition',
        detail: `Cannot transition complaint from '${from}' to '${to}'. Allowed: ${allowed.join(', ') || 'none'}.`,
      });
    }

    const updated = await this.prisma.complaint.update({
      where: { id: complaintId },
      data: {
        status: to,
        ...(to === 'resolved' && { resolvedAt: new Date() }),
      },
    });

    if (to === 'resolved') {
      const event = new ComplaintResolvedEvent({ complaintId });
      this.eventEmitter.emit('complaint.resolved', event);
      this.logger.log(`ComplaintResolvedEvent emitted for complaint ${complaintId}`);
    }

    return updated;
  }
}
