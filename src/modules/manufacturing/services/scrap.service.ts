import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { AuthorizeDisposalDto, CreateScrapDto } from '../dto/production.dto';

@Injectable()
export class ScrapService {
  constructor(private readonly prisma: PrismaService) {}

  async create(productionOrderId: string, dto: CreateScrapDto, userId: string) {
    const po = await this.prisma.productionOrder.findUnique({ where: { id: productionOrderId } });
    if (!po) {
      throw new NotFoundException({ statusCode: 404, message: 'Production order not found' });
    }

    const record = await this.prisma.scrapRecord.create({
      data: {
        productionOrderId,
        scrapDate: dto.scrapDate ? new Date(dto.scrapDate) : new Date(),
        scrapType: dto.scrapType,
        section: dto.section,
        quantity: dto.quantity,
        uom: dto.uom,
        unitValue: dto.unitValue,
        notes: dto.notes,
        createdBy: userId,
      },
    });

    return this.toDto(record);
  }

  async list(productionOrderId: string) {
    const po = await this.prisma.productionOrder.findUnique({ where: { id: productionOrderId } });
    if (!po) {
      throw new NotFoundException({ statusCode: 404, message: 'Production order not found' });
    }

    const rows = await this.prisma.scrapRecord.findMany({
      where: { productionOrderId },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((r) => this.toDto(r));
  }

  async authorizeDisposal(id: string, dto: AuthorizeDisposalDto, approverId: string) {
    const record = await this.prisma.scrapRecord.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundException({ statusCode: 404, message: 'Scrap record not found' });
    }
    if (record.disposalAuthorisedBy) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'Disposal already authorised',
      });
    }

    if (dto.disposalMethod === 'sale' && dto.saleAmount == null) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'saleAmount is required when disposal method is sale',
      });
    }

    const updated = await this.prisma.scrapRecord.update({
      where: { id },
      data: {
        disposalMethod: dto.disposalMethod,
        disposalAuthorisedBy: approverId,
        saleAmount: dto.saleAmount,
      },
    });

    return this.toDto(updated);
  }

  private toDto(record: {
    id: string;
    productionOrderId: string;
    scrapDate: Date;
    scrapType: string;
    section: string;
    quantity: { toNumber?: () => number } | number;
    uom: string;
    unitValue: { toNumber?: () => number } | number | null;
    disposalMethod: string | null;
    disposalAuthorisedBy: string | null;
    saleAmount: { toNumber?: () => number } | number | null;
    notes: string | null;
    createdAt: Date;
    createdBy: string;
  }) {
    return {
      id: record.id,
      productionOrderId: record.productionOrderId,
      scrapDate: record.scrapDate,
      scrapType: record.scrapType,
      section: record.section,
      quantity: Number(record.quantity),
      uom: record.uom,
      unitValue: record.unitValue != null ? Number(record.unitValue) : null,
      disposalMethod: record.disposalMethod,
      disposalAuthorisedBy: record.disposalAuthorisedBy,
      saleAmount: record.saleAmount != null ? Number(record.saleAmount) : null,
      notes: record.notes,
      createdAt: record.createdAt,
      createdBy: record.createdBy,
    };
  }
}
