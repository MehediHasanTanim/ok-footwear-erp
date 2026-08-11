import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { AppConfigService } from '@shared/config/app-config.service';
import {
  CreateVendorInvoiceDto,
  RecordPaymentDto,
  VendorInvoiceQueryDto,
} from '../dto/vendor-invoices.dto';

@Injectable()
export class VendorInvoicesService {
  private readonly logger = new Logger(VendorInvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly appConfig: AppConfigService,
  ) {}

  async findAll(query: VendorInvoiceQueryDto) {
    const { page, limit, vendorId, status } = query;
    const where: Prisma.VendorInvoiceWhereInput = {
      ...(vendorId && { vendorId }),
      ...(status && { status: status as never }),
    };
    const [data, total] = await Promise.all([
      this.prisma.vendorInvoice.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          vendor: { select: { id: true, name: true, vendorCode: true } },
          goodsReceipt: { select: { id: true, grnNumber: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.vendorInvoice.count({ where }),
    ]);
    return {
      data,
      meta: { page, limit, totalItems: total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const inv = await this.prisma.vendorInvoice.findUnique({
      where: { id },
      include: {
        vendor: true,
        goodsReceipt: { include: { lines: { include: { poLine: true } }, purchaseOrder: true } },
      },
    });
    if (!inv) {
      throw new NotFoundException({ statusCode: 404, message: 'Vendor invoice not found' });
    }
    return inv;
  }

  /**
   * Three-way match: invoice gross must be within tolerance of GRN accepted value
   * (and implicitly ≤ related PO value). TC-PRC-U-003.
   */
  static assertThreeWayMatch(
    invoiceGross: number,
    grnAcceptedValue: number,
    poTotal: number,
    tolerancePct: number,
  ): void {
    if (invoiceGross > poTotal * (1 + tolerancePct / 100)) {
      throw new BadRequestException({
        statusCode: 422,
        message: 'Three-way match failed',
        detail: `Invoice gross ${invoiceGross} exceeds PO total ${poTotal} beyond tolerance ${tolerancePct}%.`,
      });
    }
    const maxAllowed = grnAcceptedValue * (1 + tolerancePct / 100);
    if (invoiceGross > maxAllowed) {
      throw new BadRequestException({
        statusCode: 422,
        message: 'Three-way match failed',
        detail: `Invoice gross ${invoiceGross} exceeds GRN accepted value ${grnAcceptedValue} beyond tolerance ${tolerancePct}%.`,
      });
    }
  }

  async create(dto: CreateVendorInvoiceDto, userId: string) {
    const grn = await this.prisma.goodsReceipt.findUnique({
      where: { id: dto.grnId },
      include: {
        lines: { include: { poLine: true } },
        purchaseOrder: true,
      },
    });
    if (!grn) {
      throw new NotFoundException({ statusCode: 404, message: 'GRN not found' });
    }
    if (grn.status !== 'approved') {
      throw new BadRequestException({
        statusCode: 422,
        message: 'GRN not approved',
        detail: 'Invoices can only be created against approved GRNs.',
      });
    }
    if (grn.purchaseOrder.vendorId !== dto.vendorId) {
      throw new BadRequestException({
        statusCode: 422,
        message: 'Vendor mismatch',
        detail: 'Invoice vendor must match the PO vendor for this GRN.',
      });
    }

    const grnAcceptedValue = grn.lines.reduce(
      (sum, l) =>
        sum + Number(l.acceptedQty) * Number(l.unitCost ?? l.poLine.unitPrice),
      0,
    );
    const poTotal = Number(grn.purchaseOrder.totalAmount);
    const cfg = this.appConfig.procurement;

    VendorInvoicesService.assertThreeWayMatch(
      dto.grossAmount,
      grnAcceptedValue,
      poTotal,
      cfg.invoiceMatchTolerancePct,
    );

    const tdsAmount = Math.round(dto.grossAmount * (cfg.tdsRatePct / 100) * 100) / 100;
    const netPayable = Math.round((dto.grossAmount - tdsAmount) * 100) / 100;

    const invoice = await this.prisma.vendorInvoice.create({
      data: {
        vendorId: dto.vendorId,
        grnId: dto.grnId,
        invoiceNo: dto.invoiceNo,
        invoiceDate: new Date(dto.invoiceDate),
        dueDate: new Date(dto.dueDate),
        currency: (dto.currency ?? 'BDT').toUpperCase(),
        grossAmount: dto.grossAmount,
        tdsAmount,
        netPayable,
        createdBy: userId,
        // gl_entry_id intentionally null — Finance sprint posts AP journal
        glEntryId: null,
      },
      include: { vendor: true, goodsReceipt: true },
    });

    this.logger.log(
      `Vendor invoice created: ${invoice.invoiceNo}, net=${netPayable}, gl_entry stubbed`,
    );
    return invoice;
  }

  async recordPayment(id: string, dto: RecordPaymentDto) {
    const inv = await this.findOne(id);
    if (inv.status === 'cancelled' || inv.status === 'paid') {
      throw new BadRequestException({
        statusCode: 422,
        message: 'Cannot record payment',
        detail: `Invoice status is '${inv.status}'.`,
      });
    }

    const newPaid = Number(inv.paidAmount) + dto.amount;
    if (newPaid > Number(inv.netPayable) + 0.001) {
      throw new BadRequestException({
        statusCode: 422,
        message: 'Payment exceeds net payable',
        detail: `Paid ${newPaid} would exceed net payable ${inv.netPayable}.`,
      });
    }

    const status =
      newPaid >= Number(inv.netPayable) - 0.001
        ? 'paid'
        : newPaid > 0
          ? 'partial'
          : 'pending';

    return this.prisma.vendorInvoice.update({
      where: { id },
      data: { paidAmount: newPaid, status },
    });
  }
}
