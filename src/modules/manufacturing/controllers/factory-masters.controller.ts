import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { FactoryMastersService } from '../services/factory-masters.service';

@ApiTags('Manufacturing — Masters')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('manufacturing')
export class FactoryMastersController {
  constructor(private readonly masters: FactoryMastersService) {}

  @Get('factory-lines')
  @Permissions('manufacturing:read')
  factoryLines() {
    return this.masters.listFactoryLines();
  }

  @Get('operations')
  @Permissions('manufacturing:read')
  operations() {
    return this.masters.listOperations();
  }
}
