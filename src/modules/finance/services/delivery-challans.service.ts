import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DocNumberService } from '@modules/orders/services/doc-number.service';
import { StorageService } from '@infrastructure/storage/storage.service';
import { BuyerInvoicesService } from './buyer-invoices.service';
import {
  ConfirmDeliveryDto,
  CreateDeliveryChallanDto,
  DeliveryChallanQueryDto,
  RecordPodDto,
} from '../dto/delivery-ar.dto';

@Injectable()
export class DeliveryChallansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly docNumber: DocNumberService,
    private readonly storage: StorageService,
    private readonly buyerInvoices: BuyerInvoicesService,
  ) {}

  async findAll(query: DeliveryChallanQueryDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;
    const where: Prisma.DeliveryChallanWhereInput = {};
    if (query.orderId) where.orderId = query.orderId;
    if (query.status) where.status = query.status;

    const [data, total] = await Promise.all([
      this.prisma.deliveryChallan.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { lines: true },
      }),
      this.prisma.deliveryChallan.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, totalItems: total, totalPages: Math.ceil(total / limit) || 0 },
    };
  }

  async findOne(id: string) {
    const dc = await this.prisma.deliveryChallan.findUnique({
      where: { id },
      include: { lines: true, buyerInvoices: true },
    });
    if (!dc) {
      throw new NotFoundException({ statusCode: 404, message: 'Delivery challan not found' });
    }
    return dc;
  }

  async createFromOrder(dto: CreateDeliveryChallanDto, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { orderLines: true },
    });
    if (!order) {
      throw new NotFoundException({ statusCode: 404, message: 'Order not found' });
    }
    if (order.status === 'draft' || order.status === 'cancelled') {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'Order must be confirmed (or later) to create a delivery challan',
      });
    }
    if (!order.orderLines.length) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'Order has no lines',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const dcNumber = await this.docNumber.generate(tx, 'DC');
      return tx.deliveryChallan.create({
        data: {
          dcNumber,
          orderId: order.id,
          dcDate: dto.dcDate ? new Date(dto.dcDate) : new Date(),
          vehicleNo: dto.vehicleNo,
          carrier: dto.carrier,
          status: 'draft',
          createdBy: userId,
          lines: {
            create: order.orderLines.map((l) => ({
              orderLineId: l.id,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
            })),
          },
        },
        include: { lines: true },
      });
    });
  }

  async dispatch(id: string, userId: string) {
    const dc = await this.findOne(id);
    if (dc.status !== 'draft') {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: `Cannot dispatch challan in status ${dc.status}`,
      });
    }
    return this.prisma.deliveryChallan.update({
      where: { id },
      data: { status: 'dispatched', dispatchBy: userId },
      include: { lines: true },
    });
  }

  async recordPod(
    id: string,
    dto: RecordPodDto,
    file?: { buffer: Buffer; originalname: string; mimetype: string },
  ) {
    const dc = await this.findOne(id);
    if (dc.status !== 'dispatched' && dc.status !== 'delivered') {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'POD can only be recorded for dispatched (or delivered) challans',
      });
    }

    let podPhotoKey = dc.podPhotoKey;
    if (file) {
      const stored = await this.storage.putObject(
        'finance/pod',
        file.originalname,
        file.buffer,
        file.mimetype,
      );
      podPhotoKey = stored.s3Key;
    }

    return this.prisma.deliveryChallan.update({
      where: { id },
      data: {
        podDate: new Date(dto.podDate),
        podReceiver: dto.podReceiver,
        podNotes: dto.podNotes,
        podPhotoKey,
      },
      include: { lines: true },
    });
  }

  /**
   * Mark delivered (requires POD date) and generate AR invoice + GL post.
   */
  async confirmDelivery(id: string, dto: ConfirmDeliveryDto, userId: string) {
    const dc = await this.findOne(id);
    if (dc.status !== 'dispatched') {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: `Cannot confirm delivery from status ${dc.status}`,
      });
    }
    if (!dc.podDate) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'POD date is required before confirming delivery',
      });
    }

    const updated = await this.prisma.deliveryChallan.update({
      where: { id },
      data: { status: 'delivered' },
      include: { lines: true },
    });

    const entryDate =
      dto.entryDate ??
      (dc.podDate instanceof Date
        ? dc.podDate.toISOString().slice(0, 10)
        : String(dc.podDate).slice(0, 10));

    const dueDate =
      dto.dueDate ??
      (() => {
        const d = new Date(entryDate);
        d.setDate(d.getDate() + 30);
        return d.toISOString().slice(0, 10);
      })();

    const ar = await this.buyerInvoices.createFromChallan({
      dcId: id,
      periodId: dto.periodId,
      entryDate,
      dueDate,
      userId,
    });

    return { challan: updated, ...ar };
  }
}
