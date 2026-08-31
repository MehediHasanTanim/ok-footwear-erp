import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { CreateDepartmentDto, UpdateDepartmentDto } from '../dto/employees.dto';

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateDepartmentDto) {
    return this.prisma.department.create({ data: dto });
  }

  async findAll(activeOnly = true) {
    return this.prisma.department.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { code: 'asc' },
    });
  }

  async findOne(id: string) {
    const dept = await this.prisma.department.findUnique({ where: { id } });
    if (!dept) {
      throw new NotFoundException({ statusCode: 404, message: 'Department not found' });
    }
    return dept;
  }

  async update(id: string, dto: UpdateDepartmentDto) {
    await this.findOne(id);
    return this.prisma.department.update({ where: { id }, data: dto });
  }
}
