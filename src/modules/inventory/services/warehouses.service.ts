import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  CreateWarehouseDto,
  UpdateWarehouseDto,
  WarehouseQueryDto,
} from '../dto/warehouses.dto';

@Injectable()
export class WarehousesService {
  private readonly logger = new Logger(WarehousesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: WarehouseQueryDto) {
    const { page, limit, type, isActive } = query;
    const skip = (page - 1) * limit;
    const where: Prisma.WarehouseWhereInput = {};
    if (type) where.type = type;
    if (isActive !== undefined) where.isActive = isActive;

    const [data, total] = await Promise.all([
      this.prisma.warehouse.findMany({
        where,
        skip,
        take: limit,
        orderBy: { code: 'asc' },
      }),
      this.prisma.warehouse.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, totalItems: total, totalPages: Math.ceil(total / limit) || 0 },
    };
  }

  async findOne(id: string) {
    const wh = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!wh) {
      throw new NotFoundException({ statusCode: 404, message: 'Warehouse not found' });
    }
    return wh;
  }

  async create(dto: CreateWarehouseDto) {
    try {
      return await this.prisma.warehouse.create({
        data: {
          code: dto.code.toUpperCase(),
          name: dto.name,
          location: dto.location,
          type: dto.type ?? 'general',
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          statusCode: 409,
          message: 'Warehouse code already exists',
        });
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateWarehouseDto) {
    await this.findOne(id);
    try {
      return await this.prisma.warehouse.update({
        where: { id },
        data: {
          ...(dto.code !== undefined && { code: dto.code.toUpperCase() }),
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.location !== undefined && { location: dto.location }),
          ...(dto.type !== undefined && { type: dto.type }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          statusCode: 409,
          message: 'Warehouse code already exists',
        });
      }
      throw err;
    }
  }

  /** Soft-deactivate — preferred over hard delete. */
  async remove(id: string) {
    await this.findOne(id);
    const updated = await this.prisma.warehouse.update({
      where: { id },
      data: { isActive: false },
    });
    this.logger.log(`Warehouse deactivated: ${id}`);
    return updated;
  }
}
