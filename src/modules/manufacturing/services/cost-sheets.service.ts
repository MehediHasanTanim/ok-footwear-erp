import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { GenerateCostSheetDto } from '../dto/bom.dto';
import { TRIM_COMPONENT_TYPES } from '../interfaces/bom-status.enum';

export function computeSellingPrice(totalCost: number, marginPct: number): number {
  return Number((totalCost * (1 + marginPct / 100)).toFixed(4));
}

@Injectable()
export class CostSheetsService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(bomId: string, dto: GenerateCostSheetDto, userId: string) {
    const bom = await this.prisma.bomHeader.findUnique({
      where: { id: bomId },
      include: { lines: true },
    });
    if (!bom) {
      throw new NotFoundException({ statusCode: 404, message: 'BOM not found' });
    }

    let materialCost = 0;
    let trimsCost = 0;
    const breakdown: Array<{
      itemId: string;
      componentType: string;
      qty: number;
      unitRate: number;
      amount: number;
      rateSource: 'po' | 'avg_cost' | 'none';
    }> = [];

    for (const line of bom.lines) {
      const qty = Number(line.quantityPerPair) * (1 + Number(line.wastagePct) / 100);
      const { unitRate, rateSource } = await this.latestRate(line.itemId);
      const amount = Number((qty * unitRate).toFixed(4));
      if (TRIM_COMPONENT_TYPES.has(line.componentType)) {
        trimsCost += amount;
      } else {
        materialCost += amount;
      }
      breakdown.push({
        itemId: line.itemId,
        componentType: line.componentType,
        qty,
        unitRate,
        amount,
        rateSource,
      });
    }

    materialCost = Number(materialCost.toFixed(4));
    trimsCost = Number(trimsCost.toFixed(4));
    const totalCost = Number(
      (materialCost + trimsCost + dto.labourCost + dto.overheadCost).toFixed(4),
    );
    const sellingPrice = computeSellingPrice(totalCost, dto.targetMarginPct);

    const data = {
      materialCost,
      trimsCost,
      labourCost: dto.labourCost,
      overheadCost: dto.overheadCost,
      totalCost,
      marginPct: dto.targetMarginPct,
      sellingPrice,
      status: 'draft',
    };

    const existing = await this.prisma.costSheet.findFirst({
      where: { bomId, orderId: null },
    });

    const sheet = existing
      ? await this.prisma.costSheet.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.costSheet.create({
          data: { ...data, bomId, createdBy: userId },
        });

    return { ...this.toDto(sheet), breakdown };
  }

  async findByBom(bomId: string) {
    const sheet = await this.prisma.costSheet.findFirst({
      where: { bomId, orderId: null },
    });
    if (!sheet) {
      throw new NotFoundException({ statusCode: 404, message: 'Cost sheet not found' });
    }
    return this.toDto(sheet);
  }

  async updateMargin(id: string, targetMarginPct: number) {
    const sheet = await this.prisma.costSheet.findUnique({ where: { id } });
    if (!sheet) {
      throw new NotFoundException({ statusCode: 404, message: 'Cost sheet not found' });
    }
    if (sheet.status !== 'draft') {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: `Cannot update a ${sheet.status} cost sheet`,
      });
    }
    const sellingPrice = computeSellingPrice(Number(sheet.totalCost), targetMarginPct);
    const updated = await this.prisma.costSheet.update({
      where: { id },
      data: { marginPct: targetMarginPct, sellingPrice },
    });
    return this.toDto(updated);
  }

  private async latestRate(itemId: string): Promise<{
    unitRate: number;
    rateSource: 'po' | 'avg_cost' | 'none';
  }> {
    const poLine = await this.prisma.purchaseOrderLine.findFirst({
      where: {
        itemId,
        purchaseOrder: { status: { not: 'cancelled' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (poLine) {
      return { unitRate: Number(poLine.unitPrice), rateSource: 'po' };
    }

    const agg = await this.prisma.stockBalance.aggregate({
      where: { itemId },
      _max: { avgCost: true },
    });
    const avg = agg._max.avgCost;
    if (avg != null && Number(avg) > 0) {
      return { unitRate: Number(avg), rateSource: 'avg_cost' };
    }
    return { unitRate: 0, rateSource: 'none' };
  }

  private toDto(sheet: {
    id: string;
    bomId: string;
    orderId: string | null;
    status: string;
    materialCost: Prisma.Decimal;
    trimsCost: Prisma.Decimal;
    labourCost: Prisma.Decimal;
    overheadCost: Prisma.Decimal;
    totalCost: Prisma.Decimal;
    marginPct: Prisma.Decimal;
    sellingPrice: Prisma.Decimal;
    actualCost: Prisma.Decimal | null;
    variance: Prisma.Decimal | null;
  }) {
    return {
      id: sheet.id,
      bomId: sheet.bomId,
      orderId: sheet.orderId,
      status: sheet.status,
      materialCost: Number(sheet.materialCost),
      trimsCost: Number(sheet.trimsCost),
      labourCost: Number(sheet.labourCost),
      overheadCost: Number(sheet.overheadCost),
      totalCost: Number(sheet.totalCost),
      targetMarginPct: Number(sheet.marginPct),
      sellingPrice: Number(sheet.sellingPrice),
      actualCost: sheet.actualCost === null ? null : Number(sheet.actualCost),
      variance: sheet.variance === null ? null : Number(sheet.variance),
    };
  }
}
