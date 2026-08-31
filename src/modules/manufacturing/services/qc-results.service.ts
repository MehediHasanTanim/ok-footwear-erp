import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { CreateQcResultDto } from '../dto/production.dto';
import { calcAqlSampleSize } from '../utils/aql-sample-size';
import { ProductionCompletedEvent } from '../events/production-completed.event';
import { ProductionOrdersService } from './production-orders.service';

@Injectable()
export class QcResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productionOrders: ProductionOrdersService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(productionOrderId: string, dto: CreateQcResultDto, userId: string) {
    const po = await this.prisma.productionOrder.findUnique({
      where: { id: productionOrderId },
    });
    if (!po) {
      throw new NotFoundException({ statusCode: 404, message: 'Production order not found' });
    }

    const reworkQty = dto.reworkQty ?? 0;
    if (dto.passedQty + dto.failedQty + reworkQty !== dto.inspectedQty) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'passed_qty + failed_qty + rework_qty must equal inspected_qty',
      });
    }

    if (dto.qcType === 'inline' && !dto.operationId) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'operationId is required for inline QC',
      });
    }

    if (dto.defectDetails?.length) {
      for (const d of dto.defectDetails) {
        if (!d.type || !d.section || d.qty < 1) {
          throw new UnprocessableEntityException({
            statusCode: 422,
            message: 'Each defect must have type, section, and qty >= 1',
          });
        }
      }
    }

    const suggestedSampleSize = calcAqlSampleSize(po.plannedQty);

    const created = await this.prisma.qcResult.create({
      data: {
        productionOrderId,
        qcDate: dto.qcDate ? new Date(dto.qcDate) : new Date(),
        qcType: dto.qcType,
        operationId: dto.operationId,
        inspectedQty: dto.inspectedQty,
        passedQty: dto.passedQty,
        failedQty: dto.failedQty,
        reworkQty,
        verdict: dto.verdict,
        defectDetails: dto.defectDetails as unknown as Prisma.InputJsonValue,
        inspectorId: userId,
      },
    });

    if (dto.qcType === 'final' && dto.verdict === 'pass') {
      await this.productionOrders.markCompleted(productionOrderId);
      this.eventEmitter.emit(
        'production.completed',
        new ProductionCompletedEvent({
          productionOrderId,
          orderId: po.orderId,
          qcResultId: created.id,
          completedBy: userId,
        }),
      );
    }

    return {
      ...this.toDto(created),
      meta: { suggestedSampleSize, lotSize: po.plannedQty },
    };
  }

  async list(productionOrderId: string) {
    const po = await this.prisma.productionOrder.findUnique({ where: { id: productionOrderId } });
    if (!po) {
      throw new NotFoundException({ statusCode: 404, message: 'Production order not found' });
    }

    const rows = await this.prisma.qcResult.findMany({
      where: { productionOrderId },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((r) => this.toDto(r));
  }

  getAqlSampleSize(lotSize: number) {
    return {
      lotSize,
      sampleSize: calcAqlSampleSize(lotSize),
      inspectionLevel: 'II',
    };
  }

  private toDto(row: {
    id: string;
    productionOrderId: string;
    qcDate: Date;
    qcType: string;
    operationId: string | null;
    inspectedQty: number;
    passedQty: number;
    failedQty: number;
    reworkQty: number;
    verdict: string;
    defectDetails: unknown;
    inspectorId: string | null;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      productionOrderId: row.productionOrderId,
      qcDate: row.qcDate,
      qcType: row.qcType,
      operationId: row.operationId,
      inspectedQty: row.inspectedQty,
      passedQty: row.passedQty,
      failedQty: row.failedQty,
      reworkQty: row.reworkQty,
      verdict: row.verdict,
      defectDetails: row.defectDetails,
      inspectorId: row.inspectorId,
      createdAt: row.createdAt,
    };
  }
}
