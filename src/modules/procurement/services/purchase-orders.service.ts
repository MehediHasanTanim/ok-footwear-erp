import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DocNumberService } from '@modules/orders/services/doc-number.service';
import { AppConfigService } from '@shared/config/app-config.service';
import { EMAIL_QUEUE } from '@infrastructure/queue/queue.constants';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  PurchaseOrderQueryDto,
  RejectPurchaseOrderDto,
  PoLineDto,
} from '../dto/purchase-orders.dto';
import {
  canTransitionPo,
  resolveApproverRole,
  type PurchaseOrderStatus,
} from '../state/po-state-machine';

@Injectable()
export class PurchaseOrdersService {
  private readonly logger = new Logger(PurchaseOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly docNumber: DocNumberService,
    private readonly appConfig: AppConfigService,
    @InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue,
  ) {}

  static calcTotalAmount(lines: PoLineDto[]): number {
    return lines.reduce((sum, l) => sum + l.orderedQty * l.unitPrice, 0);
  }

  async findAll(query: PurchaseOrderQueryDto) {
    const { page, limit, status, vendorId } = query;
    const where: Prisma.PurchaseOrderWhereInput = {
      ...(status && { status: status as PurchaseOrderStatus }),
      ...(vendorId && { vendorId }),
    };
    const [data, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          vendor: { select: { id: true, name: true, vendorCode: true, status: true } },
          lines: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    return {
      data,
      meta: { page, limit, totalItems: total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        vendor: true,
        lines: true,
        goodsReceipts: { select: { id: true, grnNumber: true, status: true } },
      },
    });
    if (!po) {
      throw new NotFoundException({ statusCode: 404, message: 'Purchase order not found' });
    }
    return po;
  }

  async create(dto: CreatePurchaseOrderDto, userId: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id: dto.vendorId } });
    if (!vendor) {
      throw new NotFoundException({ statusCode: 404, message: 'Vendor not found' });
    }
    if (vendor.status === 'blacklisted') {
      throw new BadRequestException({
        statusCode: 422,
        message: 'Cannot create PO for blacklisted vendor',
        detail: `Vendor ${vendor.vendorCode} is blacklisted.`,
      });
    }
    if (vendor.status !== 'approved') {
      throw new BadRequestException({
        statusCode: 422,
        message: 'Vendor not approved',
        detail: `Vendor status is '${vendor.status}'. Only approved vendors can receive POs.`,
      });
    }

    const totalAmount = PurchaseOrdersService.calcTotalAmount(dto.lines);

    return this.prisma.$transaction(async (tx) => {
      const poNumber = await this.docNumber.generate(tx, 'PO');
      const po = await tx.purchaseOrder.create({
        data: {
          poNumber,
          vendorId: dto.vendorId,
          currency: dto.currency.toUpperCase(),
          deliveryDate: new Date(dto.deliveryDate),
          notes: dto.notes,
          totalAmount,
          createdBy: userId,
          lines: {
            create: dto.lines.map((l) => ({
              itemId: l.itemId,
              orderedQty: l.orderedQty,
              unitPrice: l.unitPrice,
              uom: l.uom,
              ...(l.deliveryDate && { deliveryDate: new Date(l.deliveryDate) }),
            })),
          },
        },
        include: { lines: true, vendor: true },
      });
      this.logger.log(`PO created: ${poNumber}, total=${totalAmount}`);
      return po;
    });
  }

  async update(id: string, dto: UpdatePurchaseOrderDto) {
    const po = await this.findOne(id);
    if (po.status !== 'draft') {
      throw new BadRequestException({
        statusCode: 422,
        message: 'Cannot edit purchase order',
        detail: `PO status is '${po.status}'. Only draft POs can be edited.`,
      });
    }

    const totalAmount = dto.lines
      ? PurchaseOrdersService.calcTotalAmount(dto.lines)
      : undefined;

    return this.prisma.$transaction(async (tx) => {
      if (dto.lines) {
        await tx.purchaseOrderLine.deleteMany({ where: { poId: id } });
        await tx.purchaseOrderLine.createMany({
          data: dto.lines.map((l) => ({
            poId: id,
            itemId: l.itemId,
            orderedQty: l.orderedQty,
            unitPrice: l.unitPrice,
            uom: l.uom,
            ...(l.deliveryDate && { deliveryDate: new Date(l.deliveryDate) }),
          })),
        });
      }

      return tx.purchaseOrder.update({
        where: { id },
        data: {
          ...(dto.deliveryDate && { deliveryDate: new Date(dto.deliveryDate) }),
          ...(dto.currency && { currency: dto.currency.toUpperCase() }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
          ...(totalAmount !== undefined && { totalAmount }),
        },
        include: { lines: true, vendor: true },
      });
    });
  }

  async submit(id: string) {
    const po = await this.findOne(id);
    this.assertTransition(po.status, 'pending_approval');

    if (!po.lines.length) {
      throw new BadRequestException({
        statusCode: 422,
        message: 'PO has no lines',
      });
    }

    const cfg = this.appConfig.procurement;
    const role = resolveApproverRole(Number(po.totalAmount), {
      lineMgr: cfg.poThresholdLineMgr,
      manager: cfg.poThresholdManager,
      finance: cfg.poThresholdFinance,
    });

    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'pending_approval', requiredApproverRole: role },
      include: { lines: true, vendor: true },
    });

    await this.emailQueue.add('po-approval-request', {
      toRole: role,
      subject: `PO ${po.poNumber} awaiting ${role} approval`,
      body: `Purchase order ${po.poNumber} (amount ${po.totalAmount} ${po.currency}) requires approval.`,
      poId: id,
      poNumber: po.poNumber,
      amount: Number(po.totalAmount),
    });

    this.logger.log(`PO ${po.poNumber} submitted; required role=${role}`);
    return updated;
  }

  async approve(id: string, userId: string) {
    const po = await this.findOne(id);
    this.assertTransition(po.status, 'approved');

    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: 'approved',
        approvedBy: userId,
        approvedAt: new Date(),
        rejectionReason: null,
      },
      include: { lines: true, vendor: true },
    });

    await this.emailQueue.add('po-approved', {
      subject: `PO ${po.poNumber} approved`,
      body: `Purchase order ${po.poNumber} was approved.`,
      poId: id,
      poNumber: po.poNumber,
    });

    return updated;
  }

  async reject(id: string, dto: RejectPurchaseOrderDto, userId: string) {
    const po = await this.findOne(id);
    if (po.status !== 'pending_approval') {
      throw new BadRequestException({
        statusCode: 422,
        message: 'Invalid status transition',
        detail: `Can only reject from pending_approval (current: ${po.status}).`,
      });
    }

    // Reject returns to draft for revision
    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: 'draft',
        rejectionReason: dto.reason,
        approvedBy: null,
        approvedAt: null,
        requiredApproverRole: null,
      },
      include: { lines: true, vendor: true },
    });

    await this.emailQueue.add('po-rejected', {
      subject: `PO ${po.poNumber} rejected`,
      body: `Purchase order ${po.poNumber} was rejected by ${userId}: ${dto.reason}`,
      poId: id,
      poNumber: po.poNumber,
    });

    return updated;
  }

  async cancel(id: string) {
    const po = await this.findOne(id);
    this.assertTransition(po.status, 'cancelled');
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'cancelled' },
      include: { lines: true, vendor: true },
    });
  }

  // Nested lines helpers
  async addLine(poId: string, line: PoLineDto) {
    const po = await this.findOne(poId);
    if (po.status !== 'draft') {
      throw new BadRequestException({
        statusCode: 422,
        message: 'Can only add lines to draft POs',
      });
    }
    await this.prisma.purchaseOrderLine.create({
      data: {
        poId,
        itemId: line.itemId,
        orderedQty: line.orderedQty,
        unitPrice: line.unitPrice,
        uom: line.uom,
        ...(line.deliveryDate && { deliveryDate: new Date(line.deliveryDate) }),
      },
    });
    return this.recalcTotal(poId);
  }

  async removeLine(poId: string, lineId: string) {
    const po = await this.findOne(poId);
    if (po.status !== 'draft') {
      throw new BadRequestException({
        statusCode: 422,
        message: 'Can only remove lines from draft POs',
      });
    }
    await this.prisma.purchaseOrderLine.delete({ where: { id: lineId } });
    return this.recalcTotal(poId);
  }

  private async recalcTotal(poId: string) {
    const lines = await this.prisma.purchaseOrderLine.findMany({ where: { poId } });
    const total = lines.reduce(
      (s, l) => s + Number(l.orderedQty) * Number(l.unitPrice),
      0,
    );
    return this.prisma.purchaseOrder.update({
      where: { id: poId },
      data: { totalAmount: total },
      include: { lines: true, vendor: true },
    });
  }

  private assertTransition(from: string, to: PurchaseOrderStatus) {
    if (!canTransitionPo(from as PurchaseOrderStatus, to)) {
      throw new BadRequestException({
        statusCode: 422,
        message: 'Invalid status transition',
        detail: `Cannot transition PO from '${from}' to '${to}'.`,
      });
    }
  }
}
