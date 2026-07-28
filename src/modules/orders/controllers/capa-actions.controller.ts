// =============================================================================
// CapaActionsController — Nested under /api/orders/:orderId/complaints/:complaintId/capa
// =============================================================================
// OK Footwear ERP — Sprint 4, Orders Module
// =============================================================================

import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { ValidateOrderPipe } from '../pipes/validate-order.pipe';
import { CapaActionsService } from '../services/capa-actions.service';
import { CreateCapaActionDto, UpdateCapaActionDto, UpdateCapaStatusDto } from '../dto/capa-actions.dto';

@ApiTags('CAPA Actions')
@ApiBearerAuth()
@Controller('orders/:orderId/complaints/:complaintId/capa')
@UseGuards(JwtAuthGuard, RbacGuard)
export class CapaActionsController {
  constructor(private readonly capaActionsService: CapaActionsService) {}

  @Get()
  @Permissions('orders:read')
  @ApiOperation({ summary: 'List CAPA actions for a complaint' })
  findAll(@Param('complaintId') complaintId: string) {
    return this.capaActionsService.findByComplaint(complaintId);
  }

  @Post()
  @Permissions('orders:create')
  @ApiOperation({ summary: 'Create a new CAPA action' })
  create(
    @Param('complaintId') complaintId: string,
    @Body() dto: CreateCapaActionDto,
  ) {
    return this.capaActionsService.create(complaintId, dto);
  }

  @Patch(':capaId')
  @Permissions('orders:update')
  @ApiOperation({ summary: 'Update CAPA action (if not done)' })
  update(
    @Param('capaId') capaId: string,
    @Body() dto: UpdateCapaActionDto,
  ) {
    return this.capaActionsService.update(capaId, dto);
  }

  @Patch(':capaId/status')
  @Permissions('orders:update')
  @ApiOperation({ summary: 'Update CAPA status (triggers auto-close if all done)' })
  updateStatus(
    @Param('capaId') capaId: string,
    @Body() dto: UpdateCapaStatusDto,
  ) {
    return this.capaActionsService.updateStatus(capaId, dto);
  }
}
