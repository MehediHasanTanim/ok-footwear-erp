// =============================================================================
// SamplesController — Nested under /api/orders/:orderId/samples
// =============================================================================
// OK Footwear ERP — Sprint 4, Orders Module
// =============================================================================

import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { ValidateOrderPipe } from '../pipes/validate-order.pipe';
import { SamplesService } from '../services/samples.service';
import { CreateSampleDto, UpdateSampleDto, RejectSampleDto } from '../dto/samples.dto';
import { CorrelationStore } from '@shared/logger/correlation-store';

@ApiTags('Samples')
@ApiBearerAuth()
@Controller('orders/:orderId/samples')
@UseGuards(JwtAuthGuard, RbacGuard)
export class SamplesController {
  constructor(private readonly samplesService: SamplesService) {}

  @Get()
  @Permissions('orders:read')
  @ApiOperation({ summary: 'List all sample rounds for an order' })
  findAll(@Param('orderId', ValidateOrderPipe) order: { id: string }) {
    return this.samplesService.findByOrder(order.id);
  }

  @Post()
  @Permissions('orders:create')
  @ApiOperation({ summary: 'Create a new sample round' })
  create(
    @Param('orderId', ValidateOrderPipe) order: { id: string },
    @Body() dto: CreateSampleDto,
  ) {
    return this.samplesService.create(order.id, dto);
  }

  @Get(':sampleId')
  @Permissions('orders:read')
  @ApiOperation({ summary: 'Get sample detail' })
  findOne(@Param('sampleId') sampleId: string) {
    return this.samplesService.findOne(sampleId);
  }

  @Patch(':sampleId')
  @Permissions('orders:update')
  @ApiOperation({ summary: 'Update pending sample' })
  update(
    @Param('sampleId') sampleId: string,
    @Body() dto: UpdateSampleDto,
  ) {
    return this.samplesService.update(sampleId, dto);
  }

  @Post(':sampleId/approve')
  @Permissions('orders:update')
  @ApiOperation({ summary: 'Approve sample (sets order.sample_approved = true atomically)' })
  approveSample(@Param('sampleId') sampleId: string) {
    const userId = CorrelationStore.getStore()?.userId ?? 'system';
    return this.samplesService.approveSample(sampleId, userId);
  }

  @Post(':sampleId/reject')
  @Permissions('orders:update')
  @ApiOperation({ summary: 'Reject sample (does NOT change order.sample_approved)' })
  rejectSample(
    @Param('sampleId') sampleId: string,
    @Body() dto: RejectSampleDto,
  ) {
    return this.samplesService.rejectSample(sampleId, dto.remarks);
  }
}
