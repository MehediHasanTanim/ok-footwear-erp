// =============================================================================
// ComplaintsService — Order complaint tracking & escalation
// =============================================================================
// OK Footwear ERP — Sprint 4, Orders Module
// =============================================================================

import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { DocNumberService } from './doc-number.service';
import { CorrelationStore } from '@shared/logger/correlation-store';
import { NotificationsService } from '@modules/system/services/notifications.service';
import { CreateComplaintDto, UpdateRootCauseDto } from '../dto/complaints.dto';

@Injectable()
export class ComplaintsService {
  private readonly logger = new Logger(ComplaintsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly docNumber: DocNumberService,
    private readonly notifications: NotificationsService,
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

  async create(orderId: string, dto: CreateComplaintDto) {
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

    // Get authenticated user from request context
    const raisedBy = CorrelationStore.getStore()?.userId ?? 'system';

    return this.prisma.$transaction(async (tx) => {
      const complaintNumber = await this.docNumber.generate(tx, 'CMP');

      const complaint = await tx.complaint.create({
        data: {
          complaintNumber,
          orderId,
          type: dto.type,
          severity: dto.severity,
          description: dto.description,
          raisedBy,
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
}
