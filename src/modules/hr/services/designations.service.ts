import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { CreateDesignationDto, UpdateDesignationDto } from '../dto/employees.dto';

@Injectable()
export class DesignationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateDesignationDto) {
    return this.prisma.designation.create({ data: dto });
  }

  async findAll() {
    return this.prisma.designation.findMany({ orderBy: { code: 'asc' } });
  }

  async findOne(id: string) {
    const row = await this.prisma.designation.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({ statusCode: 404, message: 'Designation not found' });
    }
    return row;
  }

  async update(id: string, dto: UpdateDesignationDto) {
    await this.findOne(id);
    return this.prisma.designation.update({ where: { id }, data: dto });
  }
}
