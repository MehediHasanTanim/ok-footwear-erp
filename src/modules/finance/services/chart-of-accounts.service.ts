import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  ChartOfAccountQueryDto,
  CreateChartOfAccountDto,
  UpdateChartOfAccountDto,
} from '../dto/chart-of-accounts.dto';

@Injectable()
export class ChartOfAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ChartOfAccountQueryDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;
    const where: Prisma.ChartOfAccountWhereInput = {};
    if (query.accountType) where.accountType = query.accountType;
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { accountCode: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.chartOfAccount.findMany({
        where,
        skip,
        take: limit,
        orderBy: { accountCode: 'asc' },
        include: { children: { select: { id: true, accountCode: true, name: true } } },
      }),
      this.prisma.chartOfAccount.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, totalItems: total, totalPages: Math.ceil(total / limit) || 0 },
    };
  }

  async findOne(id: string) {
    const row = await this.prisma.chartOfAccount.findUnique({
      where: { id },
      include: {
        parent: true,
        children: true,
      },
    });
    if (!row) {
      throw new NotFoundException({ statusCode: 404, message: 'Account not found' });
    }
    return row;
  }

  async create(dto: CreateChartOfAccountDto) {
    if (dto.parentId) {
      await this.requireAccount(dto.parentId);
    }
    try {
      return await this.prisma.chartOfAccount.create({
        data: {
          accountCode: dto.accountCode,
          name: dto.name,
          accountType: dto.accountType,
          accountClass: dto.accountClass ?? 'general',
          parentId: dto.parentId,
          isControl: dto.isControl ?? false,
          currency: dto.currency ?? 'BDT',
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          statusCode: 409,
          message: 'Account code already exists',
        });
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateChartOfAccountDto) {
    await this.requireAccount(id);
    if (dto.parentId) {
      if (dto.parentId === id) {
        throw new UnprocessableEntityException({
          statusCode: 422,
          message: 'Account cannot be its own parent',
        });
      }
      await this.assertNoCycle(id, dto.parentId);
    }
    try {
      return await this.prisma.chartOfAccount.update({
        where: { id },
        data: {
          accountCode: dto.accountCode,
          name: dto.name,
          accountType: dto.accountType,
          accountClass: dto.accountClass,
          parentId: dto.parentId,
          isControl: dto.isControl,
          currency: dto.currency,
          isActive: dto.isActive,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          statusCode: 409,
          message: 'Account code already exists',
        });
      }
      throw err;
    }
  }

  async remove(id: string) {
    await this.requireAccount(id);
    const countRows = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM fin.gl_entry_lines
      WHERE account_id = ${id}::uuid
    `;
    if (Number(countRows[0]?.count ?? 0) > 0) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'Cannot delete account with GL transactions; deactivate instead',
      });
    }
    const children = await this.prisma.chartOfAccount.count({ where: { parentId: id } });
    if (children > 0) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'Cannot delete account with child accounts',
      });
    }
    return this.prisma.chartOfAccount.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private async requireAccount(id: string) {
    const row = await this.prisma.chartOfAccount.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({ statusCode: 404, message: 'Account not found' });
    }
    return row;
  }

  private async assertNoCycle(accountId: string, newParentId: string) {
    let cursor: string | null = newParentId;
    const seen = new Set<string>([accountId]);
    while (cursor) {
      if (seen.has(cursor)) {
        throw new UnprocessableEntityException({
          statusCode: 422,
          message: 'Parent assignment would create a cycle',
        });
      }
      seen.add(cursor);
      const parent: { parentId: string | null } | null =
        await this.prisma.chartOfAccount.findUnique({
          where: { id: cursor },
          select: { parentId: true },
        });
      cursor = parent?.parentId ?? null;
    }
  }
}
