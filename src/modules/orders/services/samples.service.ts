// =============================================================================
// SamplesService — PP/Counter/Size-set/TOP sample tracking
// =============================================================================
// OK Footwear ERP — Sprint 4, Orders Module
// =============================================================================

import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@shared/database/prisma.service';
import { SampleApprovedEvent } from '../events/sample-approved.event';
import { CreateSampleDto, UpdateSampleDto } from '../dto/samples.dto';

@Injectable()
export class SamplesService {
  private readonly logger = new Logger(SamplesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // =========================================================================
  // Query
  // =========================================================================

  async findByOrder(orderId: string) {
    return this.prisma.sample.findMany({
      where: { orderId },
      orderBy: { roundNumber: 'asc' },
    });
  }

  async findOne(sampleId: string) {
    const sample = await this.prisma.sample.findUnique({
      where: { id: sampleId },
      include: {
        order: { select: { id: true, orderNumber: true, status: true } },
      },
    });

    if (!sample) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Sample not found',
      });
    }

    return sample;
  }

  // =========================================================================
  // Create
  // =========================================================================

  async create(orderId: string, dto: CreateSampleDto) {
    // Validate parent order exists
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true },
    });

    if (!order) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Order not found',
        detail: `Order ${orderId} does not exist.`,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      // Determine round number: use provided or auto-increment.
      // We lock the samples rows for this order to prevent concurrent
      // round collisions (SELECT ... FOR UPDATE).
      let roundNumber: number;

      if (dto.roundNumber) {
        roundNumber = dto.roundNumber;
      } else {
        const existing = await tx.$queryRawUnsafe<Array<{ max_round: number }>>(
          `SELECT COALESCE(MAX(round_number), 0) AS max_round
           FROM ord.samples
           WHERE order_id = $1::uuid
           FOR UPDATE`,
          orderId,
        );
        roundNumber = Number(existing[0]!.max_round) + 1;
      }

      // Enforce unique constraint at service layer before insert
      const duplicate = await tx.sample.findUnique({
        where: {
          orderId_roundNumber_sampleType: {
            orderId,
            roundNumber,
            sampleType: dto.sampleType,
          },
        },
      });

      if (duplicate) {
        throw new ConflictException({
          statusCode: 409,
          message: 'Duplicate sample round',
          detail: `Sample round ${roundNumber} with type '${dto.sampleType}' already exists for this order.`,
        });
      }

      const sample = await tx.sample.create({
        data: {
          orderId,
          roundNumber,
          sampleType: dto.sampleType,
          ...(dto.dispatchDate && { dispatchDate: new Date(dto.dispatchDate) }),
          ...(dto.receivedDate && { receivedDate: new Date(dto.receivedDate) }),
          ...(dto.remarks && { remarks: dto.remarks }),
        },
      });

      this.logger.log(`Sample created: order ${orderId}, round ${roundNumber}, type ${dto.sampleType}`);
      return sample;
    });
  }

  // =========================================================================
  // Update (pending only)
  // =========================================================================

  async update(sampleId: string, dto: UpdateSampleDto) {
    const sample = await this.prisma.sample.findUnique({
      where: { id: sampleId },
    });

    if (!sample) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Sample not found',
      });
    }

    if (sample.approvalStatus !== 'pending') {
      throw new BadRequestException({
        statusCode: 422,
        message: 'Cannot edit sample',
        detail: `Sample approval status is '${sample.approvalStatus}'. Only pending samples can be edited.`,
      });
    }

    return this.prisma.sample.update({
      where: { id: sampleId },
      data: {
        ...(dto.dispatchDate !== undefined && { dispatchDate: new Date(dto.dispatchDate) }),
        ...(dto.receivedDate !== undefined && { receivedDate: new Date(dto.receivedDate) }),
        ...(dto.remarks !== undefined && { remarks: dto.remarks }),
      },
    });
  }

  // =========================================================================
  // Approve — atomic: sample + order.sample_approved in one transaction
  // =========================================================================

  /**
   * Approve a sample and set orders.sample_approved = true.
   *
   * CRITICAL: These two writes are in the SAME transaction.
   * If either fails, both roll back.
   *
   * Design Decision D: If a second sample round is approved after the first,
   * sample_approved is already true — we set it to true again (no-op).
   * SampleApprovedEvent is emitted for EVERY approval. Downstream listeners
   * must handle duplicates idempotently.
   */
  async approveSample(sampleId: string, approvingUserId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Update sample
      const sample = await tx.sample.update({
        where: { id: sampleId },
        data: {
          approvalStatus: 'approved',
          approvedBy: approvingUserId,
          approvedAt: new Date(),
        },
      });

      // 2. Update parent order — set sample_approved = true
      await tx.order.update({
        where: { id: sample.orderId },
        data: { sampleApproved: true },
      });

      return sample;
    });

    // Emit event POST-commit
    const event = new SampleApprovedEvent({
      sampleId,
      orderId: result.orderId,
      approvedBy: approvingUserId,
      sampleType: result.sampleType,
    });

    this.eventEmitter.emit('sample.approved', event);
    this.logger.log(`Sample ${sampleId} approved, SampleApprovedEvent emitted`);

    return result;
  }

  // =========================================================================
  // Reject — does NOT change orders.sample_approved
  // =========================================================================

  async rejectSample(sampleId: string, remarks: string) {
    const sample = await this.prisma.sample.findUnique({
      where: { id: sampleId },
    });

    if (!sample) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Sample not found',
      });
    }

    if (sample.approvalStatus !== 'pending') {
      throw new BadRequestException({
        statusCode: 422,
        message: 'Cannot reject sample',
        detail: `Sample approval status is already '${sample.approvalStatus}'.`,
      });
    }

    return this.prisma.sample.update({
      where: { id: sampleId },
      data: {
        approvalStatus: 'rejected',
        remarks,
      },
    });
  }
}
