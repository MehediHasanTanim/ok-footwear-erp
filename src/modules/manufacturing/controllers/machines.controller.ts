import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { ParseUUIDPipe } from '@common/pipes/parse-uuid.pipe';
import { MachineService } from '../services/machines.service';
import {
  CloseMaintenanceDto,
  CreateMachineDto,
  CreateMaintenanceDto,
  UpdateMachineDto,
} from '../dto/production.dto';

@ApiTags('Manufacturing — Machines')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('manufacturing/machines')
export class MachinesController {
  constructor(private readonly machines: MachineService) {}

  @Post()
  @HttpCode(201)
  @Permissions('manufacturing:create')
  create(@Body() dto: CreateMachineDto) {
    return this.machines.create(dto);
  }

  @Get()
  @Permissions('manufacturing:read')
  findAll() {
    return this.machines.findAll();
  }

  @Get(':id')
  @Permissions('manufacturing:read')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.machines.findOne(id);
  }

  @Patch(':id')
  @Permissions('manufacturing:update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMachineDto) {
    return this.machines.update(id, dto);
  }

  @Post(':id/maintenance')
  @HttpCode(201)
  @Permissions('manufacturing:create')
  addMaintenance(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateMaintenanceDto,
  ) {
    return this.machines.addMaintenance(id, dto);
  }

  @Get(':id/maintenance')
  @Permissions('manufacturing:read')
  listMaintenance(@Param('id', ParseUUIDPipe) id: string) {
    return this.machines.listMaintenance(id);
  }

  @Patch(':id/maintenance/:maintId/close')
  @Permissions('manufacturing:update')
  closeMaintenance(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('maintId', ParseUUIDPipe) maintId: string,
    @Body() dto: CloseMaintenanceDto,
  ) {
    return this.machines.closeMaintenance(id, maintId, dto);
  }
}
