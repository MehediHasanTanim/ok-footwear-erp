import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { CreateBomDto, UpdateBomDto, BomLineDto, BomSizeOverrideDto } from '../dto/bom.dto';

const BOM_INCLUDE = {
  lines: { orderBy: { createdAt: 'asc' as const } },
  sizeOverrides: true,
} satisfies Prisma.BomHeaderInclude;

@Injectable()
export class BomService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateBomDto, userId: string) {
    const article = await this.prisma.article.findUnique({ where: { id: dto.articleId } });
    if (!article) {
      throw new NotFoundException({ statusCode: 404, message: 'Article not found' });
    }

    let lines = dto.lines ?? [];
    let sizeOverrides = dto.sizeOverrides ?? [];

    if (dto.duplicateFromId) {
      const source = await this.prisma.bomHeader.findUnique({
        where: { id: dto.duplicateFromId },
        include: BOM_INCLUDE,
      });
      if (!source) {
        throw new NotFoundException({ statusCode: 404, message: 'Source BOM not found' });
      }
      if (source.articleId !== dto.articleId) {
        throw new UnprocessableEntityException({
          statusCode: 422,
          message: 'Cannot duplicate a BOM from a different article',
        });
      }
      if (lines.length === 0) {
        lines = source.lines.map((l) => ({
          itemId: l.itemId,
          componentType: l.componentType,
          qtyPerUnit: Number(l.quantityPerPair),
          uom: l.uom,
          sizeSpecific: l.sizeSpecific,
          sizeLabel: l.sizeLabel ?? undefined,
          wastagePct: Number(l.wastagePct),
          notes: l.notes ?? undefined,
        }));
      }
      if (sizeOverrides.length === 0) {
        sizeOverrides = source.sizeOverrides.map((o) => ({
          itemId: o.itemId,
          sizeLabel: o.sizeLabel,
          qtyPerUnit: Number(o.qtyPerUnit),
        }));
      }
    }

    const version = dto.version ?? (await this.nextVersion(dto.articleId));
    const existing = await this.prisma.bomHeader.findUnique({
      where: { articleId_version: { articleId: dto.articleId, version } },
    });
    if (existing) {
      throw new ConflictException({
        statusCode: 409,
        message: `BOM version ${version} already exists for this article`,
      });
    }

    await this.assertItemsExist([
      ...lines.map((l) => l.itemId),
      ...sizeOverrides.map((o) => o.itemId),
    ]);

    const header = await this.prisma.bomHeader.create({
      data: {
        articleId: dto.articleId,
        version,
        status: 'draft',
        notes: dto.notes,
        createdBy: userId,
        lines: { create: lines.map((l) => this.toLineCreate(l)) },
        sizeOverrides: { create: sizeOverrides.map((o) => this.toOverrideCreate(o)) },
      },
      include: BOM_INCLUDE,
    });
    return this.toDto(header);
  }

  async findOne(id: string) {
    const bom = await this.prisma.bomHeader.findUnique({
      where: { id },
      include: BOM_INCLUDE,
    });
    if (!bom) {
      throw new NotFoundException({ statusCode: 404, message: 'BOM not found' });
    }
    return this.toDto(bom);
  }

  async findByArticle(articleId: string) {
    const rows = await this.prisma.bomHeader.findMany({
      where: { articleId },
      include: BOM_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async findActive(articleId: string) {
    const bom = await this.prisma.bomHeader.findFirst({
      where: { articleId, status: 'approved' },
      include: BOM_INCLUDE,
    });
    if (!bom) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'No approved BOM for this article',
      });
    }
    return this.toDto(bom);
  }

  async assertApprovedBom(articleId: string): Promise<void> {
    const count = await this.prisma.bomHeader.count({
      where: { articleId, status: 'approved' },
    });
    if (count === 0) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'Production is blocked: no approved BOM for this article',
      });
    }
  }

  async update(id: string, dto: UpdateBomDto) {
    const existing = await this.prisma.bomHeader.findUnique({
      where: { id },
      include: BOM_INCLUDE,
    });
    if (!existing) {
      throw new NotFoundException({ statusCode: 404, message: 'BOM not found' });
    }
    this.assertDraft(existing.status);

    if (dto.lines) {
      await this.assertItemsExist(dto.lines.map((l) => l.itemId));
    }
    if (dto.sizeOverrides) {
      await this.assertItemsExist(dto.sizeOverrides.map((o) => o.itemId));
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.bomHeader.update({
        where: { id },
        data: { notes: dto.notes ?? existing.notes },
      });
      if (dto.lines) {
        await tx.bomLine.deleteMany({ where: { bomId: id } });
        await tx.bomLine.createMany({
          data: dto.lines.map((l) => ({ bomId: id, ...this.toLineCreate(l) })),
        });
      }
      if (dto.sizeOverrides) {
        await tx.bomSizeOverride.deleteMany({ where: { bomId: id } });
        if (dto.sizeOverrides.length > 0) {
          await tx.bomSizeOverride.createMany({
            data: dto.sizeOverrides.map((o) => ({ bomId: id, ...this.toOverrideCreate(o) })),
          });
        }
      }
    });

    return this.findOne(id);
  }

  async approve(id: string, userId: string) {
    const existing = await this.prisma.bomHeader.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({ statusCode: 404, message: 'BOM not found' });
    }
    if (existing.status === 'approved') {
      return this.findOne(id);
    }
    this.assertDraft(existing.status);

    await this.prisma.$transaction(async (tx) => {
      await tx.bomHeader.updateMany({
        where: { articleId: existing.articleId, status: 'approved', id: { not: id } },
        data: { status: 'superseded' },
      });
      await tx.bomHeader.update({
        where: { id },
        data: { status: 'approved', approvedBy: userId, approvedAt: new Date() },
      });
    });

    return this.findOne(id);
  }

  async deleteDraft(id: string) {
    const existing = await this.prisma.bomHeader.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({ statusCode: 404, message: 'BOM not found' });
    }
    this.assertDraft(existing.status);
    await this.prisma.bomHeader.delete({ where: { id } });
    return { id, deleted: true };
  }

  private assertDraft(status: string) {
    if (status !== 'draft') {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: `Cannot modify a ${status} BOM`,
      });
    }
  }

  private async nextVersion(articleId: string): Promise<string> {
    const latest = await this.prisma.bomHeader.findFirst({
      where: { articleId },
      orderBy: { createdAt: 'desc' },
      select: { version: true },
    });
    if (!latest) return '1.0';
    const match = /^(\d+)\.(\d+)$/.exec(latest.version);
    if (!match) return `${latest.version}.1`;
    return `${match[1]}.${Number(match[2]) + 1}`;
  }

  private async assertItemsExist(ids: string[]) {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return;
    const found = await this.prisma.stockItem.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      throw new NotFoundException({ statusCode: 404, message: 'Stock item not found' });
    }
  }

  private toLineCreate(l: BomLineDto) {
    return {
      itemId: l.itemId,
      componentType: l.componentType,
      quantityPerPair: l.qtyPerUnit,
      uom: l.uom,
      sizeSpecific: l.sizeSpecific ?? false,
      sizeLabel: l.sizeLabel,
      wastagePct: l.wastagePct ?? 0,
      notes: l.notes,
    };
  }

  private toOverrideCreate(o: BomSizeOverrideDto) {
    return {
      itemId: o.itemId,
      sizeLabel: o.sizeLabel,
      qtyPerUnit: o.qtyPerUnit,
    };
  }

  private toDto(bom: Prisma.BomHeaderGetPayload<{ include: typeof BOM_INCLUDE }>) {
    return {
      id: bom.id,
      articleId: bom.articleId,
      version: bom.version,
      status: bom.status,
      approvedBy: bom.approvedBy,
      approvedAt: bom.approvedAt,
      notes: bom.notes,
      createdAt: bom.createdAt,
      createdBy: bom.createdBy,
      lines: bom.lines.map((l) => ({
        id: l.id,
        itemId: l.itemId,
        componentType: l.componentType,
        qtyPerUnit: Number(l.quantityPerPair),
        uom: l.uom,
        sizeSpecific: l.sizeSpecific,
        sizeLabel: l.sizeLabel,
        wastagePct: Number(l.wastagePct),
        notes: l.notes,
      })),
      sizeOverrides: bom.sizeOverrides.map((o) => ({
        id: o.id,
        itemId: o.itemId,
        sizeLabel: o.sizeLabel,
        qtyPerUnit: Number(o.qtyPerUnit),
      })),
    };
  }
}
