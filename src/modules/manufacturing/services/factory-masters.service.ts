import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';

@Injectable()
export class FactoryMastersService {
  constructor(private readonly prisma: PrismaService) {}

  listFactoryLines() {
    return this.prisma.factoryLine.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
    });
  }

  listOperations() {
    return this.prisma.operation.findMany({
      orderBy: { sequence: 'asc' },
    });
  }
}
