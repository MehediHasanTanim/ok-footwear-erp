import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DocNumberService } from '@modules/orders/services/doc-number.service';
import { FinanceService } from './finance.service';
import { SYSTEM_COA } from './finance.types';
import {
  BuyerInvoiceQueryDto,
  RecordCollectionDto,
} from '../dto/delivery-ar.dto';

@Injectable()
export class BuyerInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly docNumber: DocNumberService,
    private readonly finance: FinanceService,
  ) {}

  async findAll(query: BuyerInvoiceQueryDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;
    const where: Prisma.BuyerInvoiceWhereInput = {};
    if (query.buyerId) where.buyerId = query.buyerId;
    if (query.status) where.status = query.status;

    const [data, total] = await Promise.all([
      this.prisma.buyerInvoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { dueDate: 'asc' },
        include: { challan: { select: { id: true, dcNumber: true, orderId: true } } },
      }),
      this.prisma.buyerInvoice.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, totalItems: total, totalPages: Math.ceil(total / limit) || 0 },
    };
  }

  async findOne(id: string) {
    const inv = await this.prisma.buyerInvoice.findUnique({
      where: { id },
      include: { challan: { include: { lines: true } } },
    });
    if (!inv) {
      throw new NotFoundException({ statusCode: 404, message: 'Buyer invoice not found' });
    }
    return inv;
  }

  /**
   * Create AR invoice from a delivered challan and post Dr AR / Cr Revenue.
   */
  async createFromChallan(params: {
    dcId: string;
    periodId: string;
    entryDate: string;
    dueDate: string;
    userId: string;
  }) {
    const existing = await this.prisma.buyerInvoice.findFirst({
      where: { dcId: params.dcId },
    });
    if (existing) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Buyer invoice already exists for this delivery challan',
      });
    }

    const challan = await this.prisma.deliveryChallan.findUnique({
      where: { id: params.dcId },
      include: { lines: true },
    });
    if (!challan) {
      throw new NotFoundException({ statusCode: 404, message: 'Delivery challan not found' });
    }
    if (challan.status !== 'delivered') {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'Challan must be delivered before AR invoice',
      });
    }

    const order = await this.prisma.order.findUnique({ where: { id: challan.orderId } });
    if (!order) {
      throw new NotFoundException({ statusCode: 404, message: 'Order not found' });
    }

    const grossAmount = challan.lines.reduce(
      (sum, l) => sum + Number(l.quantity) * Number(l.unitPrice),
      0,
    );
    if (grossAmount <= 0) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'Challan has zero amount',
      });
    }

    const [ar, revenue] = await Promise.all([
      this.prisma.chartOfAccount.findUnique({ where: { accountCode: SYSTEM_COA.TRADE_RECEIVABLES } }),
      this.prisma.chartOfAccount.findUnique({ where: { accountCode: SYSTEM_COA.SALES_REVENUE } }),
    ]);
    if (!ar || !revenue) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'System CoA accounts 1200/4100 missing — run Sprint 7 migration',
      });
    }

    const journal = await this.finance.postJournal({
      periodId: params.periodId,
      entryDate: params.entryDate,
      narration: `AR invoice for delivery ${challan.dcNumber}`,
      entryType: 'system',
      sourceModule: 'delivery',
      sourceId: challan.id,
      lines: [
        { accountId: ar.id, debit: grossAmount, credit: 0, currency: order.currency },
        { accountId: revenue.id, debit: 0, credit: grossAmount, currency: order.currency },
      ],
      postedBy: params.userId,
    });

    const invoice = await this.prisma.$transaction(async (tx) => {
      const invoiceNo = await this.docNumber.generate(tx, 'BINV');
      return tx.buyerInvoice.create({
        data: {
          invoiceNo,
          buyerId: order.buyerId,
          dcId: challan.id,
          invoiceDate: new Date(params.entryDate),
          dueDate: new Date(params.dueDate),
          currency: order.currency,
          grossAmount,
          collectedAmount: 0,
          status: 'unpaid',
          glEntryId: journal.id,
          createdBy: params.userId,
        },
      });
    });

    return { invoice, journal };
  }

  async ageing() {
    const rows = await this.prisma.$queryRaw<
      {
        bucket: string;
        invoice_count: bigint;
        total_outstanding: number | string;
      }[]
    >`
      SELECT
        CASE
          WHEN CURRENT_DATE - due_date <= 30 THEN '0-30'
          WHEN CURRENT_DATE - due_date <= 60 THEN '31-60'
          WHEN CURRENT_DATE - due_date <= 90 THEN '61-90'
          ELSE '90+'
        END AS bucket,
        COUNT(*)::bigint AS invoice_count,
        COALESCE(SUM(gross_amount - collected_amount), 0) AS total_outstanding
      FROM fin.buyer_invoices
      WHERE status IN ('unpaid', 'partial', 'disputed')
      GROUP BY 1
      ORDER BY 1
    `;

    const buckets = {
      '0-30': { count: 0, outstanding: 0 },
      '31-60': { count: 0, outstanding: 0 },
      '61-90': { count: 0, outstanding: 0 },
      '90+': { count: 0, outstanding: 0 },
    } as Record<string, { count: number; outstanding: number }>;

    for (const r of rows) {
      buckets[r.bucket] = {
        count: Number(r.invoice_count),
        outstanding: Number(r.total_outstanding),
      };
    }
    return buckets;
  }

  async recordCollection(id: string, dto: RecordCollectionDto) {
    const inv = await this.findOne(id);
    if (inv.status === 'disputed') {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'Cannot collect on a disputed invoice',
      });
    }
    if (inv.status === 'paid') {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'Invoice is already paid',
      });
    }

    const collected = Number(inv.collectedAmount) + dto.amount;
    const gross = Number(inv.grossAmount);
    if (collected > gross) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'Collection exceeds outstanding balance',
      });
    }

    const status = collected >= gross ? 'paid' : 'partial';
    return this.prisma.buyerInvoice.update({
      where: { id },
      data: { collectedAmount: collected, status },
    });
  }

  async dispute(id: string) {
    const inv = await this.findOne(id);
    if (inv.status === 'paid') {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'Cannot dispute a paid invoice',
      });
    }
    return this.prisma.buyerInvoice.update({
      where: { id },
      data: { status: 'disputed' },
    });
  }

  async clearDispute(id: string) {
    const inv = await this.findOne(id);
    if (inv.status !== 'disputed') {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'Invoice is not disputed',
      });
    }
    const collected = Number(inv.collectedAmount);
    const gross = Number(inv.grossAmount);
    const status = collected <= 0 ? 'unpaid' : collected >= gross ? 'paid' : 'partial';
    return this.prisma.buyerInvoice.update({
      where: { id },
      data: { status },
    });
  }
}
