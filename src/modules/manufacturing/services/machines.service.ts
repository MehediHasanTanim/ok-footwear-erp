import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  CloseMaintenanceDto,
  CreateMachineDto,
  CreateMaintenanceDto,
  UpdateMachineDto,
} from '../dto/production.dto';

@Injectable()
export class MachineService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateMachineDto) {
    const existing = await this.prisma.machine.findUnique({
      where: { machineCode: dto.machineCode },
    });
    if (existing) {
      throw new ConflictException({
        statusCode: 409,
        message: `Machine code ${dto.machineCode} already exists`,
      });
    }

    if (dto.factoryLineId) {
      await this.assertFactoryLine(dto.factoryLineId);
    }

    const machine = await this.prisma.machine.create({
      data: {
        machineCode: dto.machineCode,
        name: dto.name,
        type: dto.type,
        model: dto.model,
        manufacturer: dto.manufacturer,
        factoryLineId: dto.factoryLineId,
        purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : undefined,
        assetId: dto.assetId,
      },
    });

    return this.toDto(machine, 0);
  }

  async findAll() {
    const machines = await this.prisma.machine.findMany({
      orderBy: { machineCode: 'asc' },
    });
    return Promise.all(machines.map((m) => this.toDetail(m.id)));
  }

  async findOne(id: string) {
    return this.toDetail(id);
  }

  async update(id: string, dto: UpdateMachineDto) {
    const existing = await this.prisma.machine.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({ statusCode: 404, message: 'Machine not found' });
    }

    if (dto.factoryLineId) {
      await this.assertFactoryLine(dto.factoryLineId);
    }

    const updated = await this.prisma.machine.update({
      where: { id },
      data: {
        name: dto.name,
        type: dto.type,
        model: dto.model,
        manufacturer: dto.manufacturer,
        factoryLineId: dto.factoryLineId,
        status: dto.status,
      },
    });

    return this.toDetail(updated.id);
  }

  async addMaintenance(machineId: string, dto: CreateMaintenanceDto) {
    await this.assertMachine(machineId);

    const row = await this.prisma.machineMaintenance.create({
      data: {
        machineId,
        maintType: dto.maintType,
        startTime: new Date(dto.startTime),
        description: dto.description,
        cost: dto.cost,
        performedBy: dto.performedBy,
      },
    });

    await this.prisma.machine.update({
      where: { id: machineId },
      data: { status: 'under_maintenance' },
    });

    return row;
  }

  async listMaintenance(machineId: string) {
    await this.assertMachine(machineId);
    return this.prisma.machineMaintenance.findMany({
      where: { machineId },
      orderBy: { startTime: 'desc' },
    });
  }

  async closeMaintenance(machineId: string, maintenanceId: string, dto: CloseMaintenanceDto) {
    await this.assertMachine(machineId);

    const maint = await this.prisma.machineMaintenance.findFirst({
      where: { id: maintenanceId, machineId },
    });
    if (!maint) {
      throw new NotFoundException({ statusCode: 404, message: 'Maintenance record not found' });
    }
    if (maint.endTime) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'Maintenance already closed',
      });
    }

    const updated = await this.prisma.$queryRaw<
      { id: string; downtime_hrs: Prisma.Decimal | null }[]
    >`
      UPDATE mfg.machine_maintenance
      SET end_time = ${dto.endTime}::timestamptz
      WHERE id = ${maintenanceId}::uuid
      RETURNING id, downtime_hrs
    `;

    const openCount = await this.prisma.machineMaintenance.count({
      where: { machineId, endTime: null },
    });
    if (openCount === 0) {
      await this.prisma.machine.update({
        where: { id: machineId },
        data: { status: 'active' },
      });
    }

    return updated[0];
  }

  private async toDetail(id: string) {
    const machine = await this.prisma.machine.findUnique({ where: { id } });
    if (!machine) {
      throw new NotFoundException({ statusCode: 404, message: 'Machine not found' });
    }

    const agg = await this.prisma.$queryRaw<{ total: Prisma.Decimal | null }[]>`
      SELECT COALESCE(SUM(downtime_hrs), 0) AS total
      FROM mfg.machine_maintenance
      WHERE machine_id = ${id}::uuid AND end_time IS NOT NULL
    `;

    return this.toDto(machine, Number(agg[0]?.total ?? 0));
  }

  private toDto(
    machine: {
      id: string;
      machineCode: string;
      name: string;
      type: string;
      model: string | null;
      manufacturer: string | null;
      factoryLineId: string | null;
      purchaseDate: Date | null;
      status: string;
      assetId: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
    totalDowntimeHours: number,
  ) {
    return {
      id: machine.id,
      machineCode: machine.machineCode,
      name: machine.name,
      type: machine.type,
      model: machine.model,
      manufacturer: machine.manufacturer,
      factoryLineId: machine.factoryLineId,
      purchaseDate: machine.purchaseDate,
      status: machine.status,
      assetId: machine.assetId,
      totalDowntimeHours,
      createdAt: machine.createdAt,
      updatedAt: machine.updatedAt,
    };
  }

  private async assertMachine(id: string) {
    const m = await this.prisma.machine.findUnique({ where: { id } });
    if (!m) {
      throw new NotFoundException({ statusCode: 404, message: 'Machine not found' });
    }
    return m;
  }

  private async assertFactoryLine(id: string) {
    const line = await this.prisma.factoryLine.findUnique({ where: { id } });
    if (!line?.isActive) {
      throw new NotFoundException({ statusCode: 404, message: 'Factory line not found' });
    }
  }
}
