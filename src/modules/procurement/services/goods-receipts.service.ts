import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@shared/database/prisma.service';
import { DocNumberService } from '@modules/orders/services/doc-number.service';
import { StorageService } from '@infrastructure/storage/storage.service';
import {
  CreateGoodsReceiptDto,
  UpdateGrLineDto,
  ApproveGoodsReceiptDto,
  RejectGoodsReceiptDto,
} from '../dto/goods-receipts.dto';
import { VendorsService } from './vendors.service';
import { GrnApprovedEvent } from '../events/grn-approved.event';
import { canTransitionGrn, type GoodsReceiptStatus } from '../state/grn-state-machine';

@Injectable()
export class GoodsReceiptsService {
  private readonly logger = new Logger(GoodsReceiptsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly docNumber: DocNumberService,
    private readonly storage: StorageService,
    private readonly vendors: VendorsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** Validate accepted + rejected ≤ received (TC-PRC-U-005). */
  static assertQtyRules(received: number, accepted: number, rejected: number): void {
    if (accepted + rejected > received) {
      throw new BadRequestException({
        statusCode: 422,
        message: 'Invalid GRN quantities',
        detail: `accepted (${accepted}) + rejected (${rejected}) cannot exceed received (${received}).`,
      });
    }
  }

  async findByPo(poId: string) {
    return this.prisma.goodsReceipt.findMany({
      where: { poId },
      include: { lines: { include: { photos: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const grn = await this.prisma.goodsReceipt.findUnique({
      where: { id },
      include: {
        lines: { include: { photos: true, poLine: true } },
        purchaseOrder: { include: { vendor: true, lines: true } },
      },
    });
    if (!grn) {
      throw new NotFoundException({ statusCode: 404, message: 'Goods receipt not found' });
    }
    return grn;
  }

  async create(dto: CreateGoodsReceiptDto, userId: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id: dto.poId },
      include: { lines: true },
    });
    if (!po) {
      throw new NotFoundException({ statusCode: 404, message: 'Purchase order not found' });
    }
    if (po.status !== 'approved' && po.status !== 'partially_received') {
      throw new BadRequestException({
        statusCode: 422,
        message: 'Cannot create GRN',
        detail: `PO status is '${po.status}'. Must be approved or partially_received.`,
      });
    }

    const poLineIds = new Set(po.lines.map((l) => l.id));
    for (const line of dto.lines) {
      if (!poLineIds.has(line.poLineId)) {
        throw new BadRequestException({
          statusCode: 422,
          message: 'Invalid PO line',
          detail: `Line ${line.poLineId} does not belong to this PO.`,
        });
      }
      const accepted = line.acceptedQty ?? 0;
      const rejected = line.rejectedQty ?? 0;
      GoodsReceiptsService.assertQtyRules(line.receivedQty, accepted, rejected);
    }

    return this.prisma.$transaction(async (tx) => {
      const grnNumber = await this.docNumber.generate(tx, 'GRN');
      const grn = await tx.goodsReceipt.create({
        data: {
          grnNumber,
          poId: dto.poId,
          ...(dto.receiptDate && { receiptDate: new Date(dto.receiptDate) }),
          vehicleNo: dto.vehicleNo,
          notes: dto.notes,
          receivedBy: userId,
          lines: {
            create: dto.lines.map((l) => ({
              poLineId: l.poLineId,
              receivedQty: l.receivedQty,
              acceptedQty: l.acceptedQty ?? 0,
              rejectedQty: l.rejectedQty ?? 0,
              qcStatus: l.qcStatus ?? 'pending',
              rejectionReason: l.rejectionReason,
              batchLot: l.batchLot,
              unitCost: l.unitCost,
            })),
          },
        },
        include: { lines: true },
      });
      this.logger.log(`GRN created: ${grnNumber}`);
      return grn;
    });
  }

  async updateLine(grnId: string, lineId: string, dto: UpdateGrLineDto) {
    const grn = await this.findOne(grnId);
    if (grn.status !== 'draft' && grn.status !== 'qc_pending') {
      throw new BadRequestException({
        statusCode: 422,
        message: 'Cannot edit GRN lines',
        detail: `GRN status is '${grn.status}'.`,
      });
    }
    const line = grn.lines.find((l) => l.id === lineId);
    if (!line) {
      throw new NotFoundException({ statusCode: 404, message: 'GRN line not found' });
    }

    const received = dto.receivedQty ?? Number(line.receivedQty);
    const accepted = dto.acceptedQty ?? Number(line.acceptedQty);
    const rejected = dto.rejectedQty ?? Number(line.rejectedQty);
    GoodsReceiptsService.assertQtyRules(received, accepted, rejected);

    return this.prisma.goodsReceiptLine.update({
      where: { id: lineId },
      data: {
        ...(dto.receivedQty !== undefined && { receivedQty: dto.receivedQty }),
        ...(dto.acceptedQty !== undefined && { acceptedQty: dto.acceptedQty }),
        ...(dto.rejectedQty !== undefined && { rejectedQty: dto.rejectedQty }),
        ...(dto.qcStatus !== undefined && { qcStatus: dto.qcStatus }),
        ...(dto.rejectionReason !== undefined && { rejectionReason: dto.rejectionReason }),
        ...(dto.unitCost !== undefined && { unitCost: dto.unitCost }),
      },
    });
  }

  async submitForQc(id: string) {
    const grn = await this.findOne(id);
    this.assertTransition(grn.status, 'qc_pending');
    return this.prisma.goodsReceipt.update({
      where: { id },
      data: { status: 'qc_pending' },
      include: { lines: true },
    });
  }

  async approve(id: string, dto: ApproveGoodsReceiptDto, userId: string) {
    const grn = await this.findOne(id);
    this.assertTransition(grn.status, 'approved');

    for (const line of grn.lines) {
      GoodsReceiptsService.assertQtyRules(
        Number(line.receivedQty),
        Number(line.acceptedQty),
        Number(line.rejectedQty),
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.goodsReceipt.update({
        where: { id },
        data: {
          status: 'approved',
          approvedBy: userId,
          approvedAt: new Date(),
        },
      });

      for (const line of grn.lines) {
        await tx.purchaseOrderLine.update({
          where: { id: line.poLineId },
          data: {
            receivedQty: {
              increment: Number(line.acceptedQty),
            },
          },
        });
      }

      const poLines = await tx.purchaseOrderLine.findMany({
        where: { poId: grn.poId },
      });
      const allReceived = poLines.every(
        (l) => Number(l.receivedQty) >= Number(l.orderedQty),
      );
      const anyReceived = poLines.some((l) => Number(l.receivedQty) > 0);

      await tx.purchaseOrder.update({
        where: { id: grn.poId },
        data: {
          status: allReceived ? 'received' : anyReceived ? 'partially_received' : 'approved',
        },
      });

      await this.vendors.recomputeRating(grn.purchaseOrder.vendorId, tx);
    });

    const event = new GrnApprovedEvent({
      grnId: id,
      approvedBy: userId,
      lines: grn.lines.map((l) => ({
        itemId: l.poLine.itemId,
        warehouseId: dto.warehouseId,
        acceptedQty: Number(l.acceptedQty),
        unitCost: Number(l.unitCost ?? l.poLine.unitPrice),
      })),
    });
    this.eventEmitter.emit('grn.approved', event);
    this.logger.log(`GRN ${grn.grnNumber} approved; GrnApprovedEvent emitted`);

    return this.findOne(id);
  }

  async reject(id: string, dto: RejectGoodsReceiptDto) {
    const grn = await this.findOne(id);
    this.assertTransition(grn.status, 'rejected');
    return this.prisma.goodsReceipt.update({
      where: { id },
      data: { status: 'rejected', notes: dto.reason },
      include: { lines: true },
    });
  }

  async uploadPhoto(
    grnId: string,
    lineId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string },
    userId: string,
  ) {
    await this.findOne(grnId);
    const line = await this.prisma.goodsReceiptLine.findFirst({
      where: { id: lineId, grnId },
    });
    if (!line) {
      throw new NotFoundException({ statusCode: 404, message: 'GRN line not found' });
    }

    const stored = await this.storage.putObject(
      `prc/grn/${grnId}/${lineId}`,
      file.originalname,
      file.buffer,
      file.mimetype,
    );

    return this.prisma.goodsReceiptLinePhoto.create({
      data: {
        grLineId: lineId,
        s3Key: stored.s3Key,
        contentType: stored.contentType,
        uploadedBy: userId,
      },
    });
  }

  private assertTransition(from: string, to: GoodsReceiptStatus) {
    if (!canTransitionGrn(from as GoodsReceiptStatus, to)) {
      throw new BadRequestException({
        statusCode: 422,
        message: 'Invalid status transition',
        detail: `Cannot transition GRN from '${from}' to '${to}'.`,
      });
    }
  }
}
