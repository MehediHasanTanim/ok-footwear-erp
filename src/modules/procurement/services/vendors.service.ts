import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { Prisma } from '@prisma/client';
import {
  CreateVendorCategoryDto,
  UpdateVendorCategoryDto,
  CreateVendorDto,
  UpdateVendorDto,
  VendorQueryDto,
} from '../dto/vendors.dto';

const TRIGRAM_THRESHOLD = 0.15;

@Injectable()
export class VendorsService {
  private readonly logger = new Logger(VendorsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---- Categories ----

  findAllCategories() {
    return this.prisma.vendorCategory.findMany({ orderBy: { name: 'asc' } });
  }

  async createCategory(dto: CreateVendorCategoryDto) {
    try {
      return await this.prisma.vendorCategory.create({
        data: { name: dto.name, code: dto.code.toUpperCase() },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          statusCode: 409,
          message: 'Category already exists',
          detail: 'A vendor category with this name or code already exists.',
        });
      }
      throw err;
    }
  }

  async findOneCategory(id: string) {
    const category = await this.prisma.vendorCategory.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException({ statusCode: 404, message: 'Vendor category not found' });
    }
    return category;
  }

  async updateCategory(id: string, dto: UpdateVendorCategoryDto) {
    await this.findOneCategory(id);
    try {
      return await this.prisma.vendorCategory.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.code !== undefined && { code: dto.code.toUpperCase() }),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          statusCode: 409,
          message: 'Category already exists',
          detail: 'A vendor category with this name or code already exists.',
        });
      }
      throw err;
    }
  }

  async deleteCategory(id: string) {
    await this.findOneCategory(id);
    const vendorCount = await this.prisma.vendor.count({ where: { categoryId: id } });
    if (vendorCount > 0) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Category in use',
        detail: `Cannot delete category: ${vendorCount} vendor(s) still assigned. Reassign them first.`,
      });
    }
    await this.prisma.vendorCategory.delete({ where: { id } });
    this.logger.log(`Vendor category deleted: ${id}`);
    return { id, deleted: true };
  }

  // ---- Vendors ----

  async findAll(query: VendorQueryDto) {
    const { page, limit, search, status, dropdown } = query;
    const skip = (page - 1) * limit;

    if (search) {
      return this.findByTrigram(search, skip, limit, page, status, dropdown);
    }

    const where: Prisma.VendorWhereInput = {
      ...(status && { status }),
    };

    const [data, total] = await Promise.all([
      dropdown
        ? this.prisma.vendor.findMany({
            where,
            skip,
            take: limit,
            select: { id: true, name: true, vendorCode: true, status: true },
            orderBy: { createdAt: 'desc' },
          })
        : this.prisma.vendor.findMany({
            where,
            skip,
            take: limit,
            include: { category: { select: { id: true, name: true, code: true } } },
            orderBy: { createdAt: 'desc' },
          }),
      this.prisma.vendor.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        totalItems: total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async findByTrigram(
    search: string,
    skip: number,
    limit: number,
    page: number,
    status?: string,
    dropdown?: boolean,
  ) {
    const rows = status
      ? await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id::text AS id
           FROM prc.vendors
           WHERE similarity(name, $1) > $2
             AND status = $3::prc."VendorStatus"
           ORDER BY similarity(name, $1) DESC
           LIMIT $4 OFFSET $5`,
          search,
          TRIGRAM_THRESHOLD,
          status,
          limit,
          skip,
        )
      : await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id::text AS id
           FROM prc.vendors
           WHERE similarity(name, $1) > $2
           ORDER BY similarity(name, $1) DESC
           LIMIT $3 OFFSET $4`,
          search,
          TRIGRAM_THRESHOLD,
          limit,
          skip,
        );

    const ids = rows.map((r) => r.id);
    const data = ids.length
      ? dropdown
        ? await this.prisma.vendor.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true, vendorCode: true, status: true },
          })
        : await this.prisma.vendor.findMany({
            where: { id: { in: ids } },
            include: { category: { select: { id: true, name: true, code: true } } },
          })
      : [];
    const byId = new Map(data.map((v) => [v.id, v]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean);

    const countRows = status
      ? await this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
          `SELECT COUNT(*)::bigint AS count
           FROM prc.vendors
           WHERE similarity(name, $1) > $2 AND status = $3::prc."VendorStatus"`,
          search,
          TRIGRAM_THRESHOLD,
          status,
        )
      : await this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
          `SELECT COUNT(*)::bigint AS count
           FROM prc.vendors
           WHERE similarity(name, $1) > $2`,
          search,
          TRIGRAM_THRESHOLD,
        );

    const total = Number(countRows[0]?.count ?? 0);

    return {
      data: ordered,
      meta: {
        page,
        limit,
        totalItems: total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!vendor) {
      throw new NotFoundException({ statusCode: 404, message: 'Vendor not found' });
    }
    return vendor;
  }

  async create(dto: CreateVendorDto, userId: string) {
    try {
      const vendor = await this.prisma.vendor.create({
        data: {
          vendorCode: dto.vendorCode.toUpperCase(),
          name: dto.name,
          type: dto.type,
          categoryId: dto.categoryId,
          contactName: dto.contactName,
          email: dto.email,
          phone: dto.phone,
          address: dto.address,
          tradeLicense: dto.tradeLicense,
          tinNumber: dto.tinNumber,
          bankName: dto.bankName,
          bankAccount: dto.bankAccount,
          paymentTerms: dto.paymentTerms ?? 30,
          creditLimit: dto.creditLimit ?? 0,
          status: dto.status ?? 'approved',
          notes: dto.notes,
          createdBy: userId,
        },
      });
      this.logger.log(`Vendor created: ${vendor.vendorCode}`);
      return vendor;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          statusCode: 409,
          message: 'Vendor code already exists',
        });
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateVendorDto) {
    await this.findOne(id);
    try {
      return await this.prisma.vendor.update({
        where: { id },
        data: {
          ...(dto.vendorCode !== undefined && { vendorCode: dto.vendorCode.toUpperCase() }),
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.type !== undefined && { type: dto.type }),
          ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
          ...(dto.contactName !== undefined && { contactName: dto.contactName }),
          ...(dto.email !== undefined && { email: dto.email }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
          ...(dto.address !== undefined && { address: dto.address }),
          ...(dto.tradeLicense !== undefined && { tradeLicense: dto.tradeLicense }),
          ...(dto.tinNumber !== undefined && { tinNumber: dto.tinNumber }),
          ...(dto.bankName !== undefined && { bankName: dto.bankName }),
          ...(dto.bankAccount !== undefined && { bankAccount: dto.bankAccount }),
          ...(dto.paymentTerms !== undefined && { paymentTerms: dto.paymentTerms }),
          ...(dto.creditLimit !== undefined && { creditLimit: dto.creditLimit }),
          ...(dto.status !== undefined && { status: dto.status }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          statusCode: 409,
          message: 'Vendor code already exists',
        });
      }
      throw err;
    }
  }

  async remove(id: string) {
    const vendor = await this.findOne(id);
    const [poCount, invoiceCount] = await Promise.all([
      this.prisma.purchaseOrder.count({ where: { vendorId: id } }),
      this.prisma.vendorInvoice.count({ where: { vendorId: id } }),
    ]);
    if (poCount > 0 || invoiceCount > 0) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Vendor in use',
        detail:
          `Cannot delete vendor ${vendor.vendorCode}: linked to ${poCount} PO(s) and ` +
          `${invoiceCount} invoice(s). Blacklist the vendor instead.`,
      });
    }
    await this.prisma.vendor.delete({ where: { id } });
    this.logger.log(`Vendor deleted: ${vendor.vendorCode}`);
    return { id, deleted: true };
  }

  /**
   * Recompute vendor.rating as average accepted ratio across all GRN lines
   * for this vendor: avg(accepted_qty / received_qty) * 5 (0–5 scale).
   */
  async recomputeRating(vendorId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const rows = await client.$queryRawUnsafe<Array<{ ratio: number }>>(
      `SELECT CASE WHEN gl.received_qty > 0
              THEN (gl.accepted_qty / gl.received_qty)::float
              ELSE 0 END AS ratio
       FROM prc.gr_lines gl
       JOIN prc.goods_receipts gr ON gr.id = gl.grn_id
       JOIN prc.purchase_orders po ON po.id = gr.po_id
       WHERE po.vendor_id = $1::uuid AND gr.status = 'approved'`,
      vendorId,
    );

    if (rows.length === 0) return;

    const avgRatio = rows.reduce((s, r) => s + Number(r.ratio), 0) / rows.length;
    const rating = Math.round(avgRatio * 5 * 10) / 10;

    await client.vendor.update({
      where: { id: vendorId },
      data: { rating },
    });
  }
}
