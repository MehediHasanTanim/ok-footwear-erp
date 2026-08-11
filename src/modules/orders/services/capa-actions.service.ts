// =============================================================================
// CapaActionsService — Corrective & Preventive Actions linked to complaints
// =============================================================================
// OK Footwear ERP — Sprint 4, Orders Module
//
// AUTO-CLOSE LOGIC (Design Decision C):
//   When all CAPA actions for a complaint reach 'done', the complaint
//   auto-transitions to 'resolved'. This is checked inside the same
//   transaction as the status update — if the CAPA update succeeds but
//   the complaint update fails, both roll back.
//
//   Zero-CAPA edge case: If total === 0, auto-close does NOT trigger.
//   A complaint with zero CAPA actions is closed via ComplaintsService.updateStatus.
// =============================================================================

import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@shared/database/prisma.service';
import { ComplaintResolvedEvent } from '../events/complaint-resolved.event';
import { CreateCapaActionDto, UpdateCapaActionDto, UpdateCapaStatusDto } from '../dto/capa-actions.dto';

@Injectable()
export class CapaActionsService {
  private readonly logger = new Logger(CapaActionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // =========================================================================
  // Query
  // =========================================================================

  async findByComplaint(complaintId: string) {
    return this.prisma.capaAction.findMany({
      where: { complaintId },
      orderBy: { createdAt: 'asc' },
    });
  }

  // =========================================================================
  // Create
  // =========================================================================

  async create(complaintId: string, dto: CreateCapaActionDto) {
    // Validate parent complaint exists and is not resolved
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
        message: 'Cannot add CAPA action',
        detail: 'CAPA actions cannot be added to a resolved complaint.',
      });
    }

    // Validate due_date is in the future (service-layer validation
    // for RFC 7807 error shape)
    const dueDate = new Date(dto.dueDate);
    if (dueDate <= new Date()) {
      throw new BadRequestException({
        statusCode: 422,
        message: 'Invalid due date',
        detail: 'CAPA action due_date must be in the future.',
      });
    }

    return this.prisma.capaAction.create({
      data: {
        complaintId,
        description: dto.description,
        ownerId: dto.ownerId,
        dueDate,
      },
    });
  }

  // =========================================================================
  // Update (if status ≠ done)
  // =========================================================================

  async update(capaActionId: string, dto: UpdateCapaActionDto) {
    const capa = await this.prisma.capaAction.findUnique({
      where: { id: capaActionId },
    });

    if (!capa) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'CAPA action not found',
      });
    }

    if (capa.status === 'done') {
      throw new BadRequestException({
        statusCode: 422,
        message: 'Cannot edit CAPA action',
        detail: 'Completed CAPA actions cannot be edited.',
      });
    }

    return this.prisma.capaAction.update({
      where: { id: capaActionId },
      data: {
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.ownerId !== undefined && { ownerId: dto.ownerId }),
        ...(dto.dueDate !== undefined && { dueDate: new Date(dto.dueDate) }),
        ...(dto.evidence !== undefined && { evidence: dto.evidence }),
      },
    });
  }

  // =========================================================================
  // Update Status — with auto-close trigger
  // =========================================================================

  /**
   * Update CAPA action status.
   *
   * After updating, checks if ALL CAPA actions for the same complaint are
   * 'done'. If so, auto-transitions the complaint to 'resolved' and emits
   * ComplaintResolvedEvent.
   *
   * All three operations (CAPA update + complaint count check + complaint
   * transition) are wrapped in a single Prisma transaction for atomicity.
   * Events are emitted POST-transaction.
   *
   * Design Decision C: total > 0 guard prevents auto-close for complaints
   * with zero CAPA actions.
   */
  async updateStatus(capaActionId: string, dto: UpdateCapaStatusDto) {
    const capa = await this.prisma.capaAction.findUnique({
      where: { id: capaActionId },
    });

    if (!capa) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'CAPA action not found',
      });
    }

    let complaintResolved = false;
    let complaintId = capa.complaintId;

    await this.prisma.$transaction(async (tx) => {
      // Update CAPA status
      await tx.capaAction.update({
        where: { id: capaActionId },
        data: {
          status: dto.status,
          ...(dto.status === 'done' && { closedAt: new Date() }),
        },
      });

      // --- Auto-close check ---
      const [total, done] = await Promise.all([
        tx.capaAction.count({ where: { complaintId } }),
        tx.capaAction.count({ where: { complaintId, status: 'done' } }),
      ]);

      if (total > 0 && total === done) {
        await tx.complaint.update({
          where: { id: complaintId },
          data: { status: 'resolved', resolvedAt: new Date() },
        });
        complaintResolved = true;
        this.logger.log(
          `Complaint ${complaintId} auto-resolved — all ${done} CAPA actions done`,
        );
      }
    });

    // Emit event POST-commit
    if (complaintResolved) {
      const event = new ComplaintResolvedEvent({ complaintId });
      this.eventEmitter.emit('complaint.resolved', event);
      this.logger.log(`ComplaintResolvedEvent emitted for complaint ${complaintId}`);
    }

    return this.prisma.capaAction.findUnique({
      where: { id: capaActionId },
    });
  }
}
