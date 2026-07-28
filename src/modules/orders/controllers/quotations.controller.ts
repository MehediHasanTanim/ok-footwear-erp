// =============================================================================
// QuotationsController — Nested under /api/orders/:orderId/quotations
// =============================================================================
// OK Footwear ERP — Sprint 4, Orders Module
// =============================================================================

import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { AuditTable } from '@common/decorators/audit.decorator';
import { ValidateOrderPipe } from '../pipes/validate-order.pipe';
import { QuotationsService } from '../services/quotations.service';
import { CreateQuotationDto, UpdateQuotationDto, CloseQuotationDto } from '../dto/quotations.dto';

@ApiTags('Quotations')
@ApiBearerAuth()
@Controller('orders/:orderId/quotations')
@UseGuards(JwtAuthGuard, RbacGuard)
export class QuotationsController {
  constructor(private readonly quotationsService: QuotationsService) {}

  @Get()
  @Permissions('orders:read')
  @ApiOperation({ summary: 'List quotations for an order' })
  findAll(@Param('orderId', ValidateOrderPipe) order: { id: string }) {
    return this.quotationsService.findByOrder(order.id);
  }

  @Post()
  @Permissions('orders:create')
  @ApiOperation({ summary: 'Create a new quotation' })
  create(
    @Param('orderId', ValidateOrderPipe) order: { id: string },
    @Body() dto: CreateQuotationDto,
  ) {
    return this.quotationsService.create(order.id, dto);
  }

  @Get(':quotationId')
  @Permissions('orders:read')
  @ApiOperation({ summary: 'Get quotation detail' })
  findOne(@Param('quotationId') quotationId: string) {
    return this.quotationsService.findOne(quotationId);
  }

  @Patch(':quotationId')
  @Permissions('orders:update')
  @ApiOperation({ summary: 'Update draft quotation' })
  update(
    @Param('quotationId') quotationId: string,
    @Body() dto: UpdateQuotationDto,
  ) {
    return this.quotationsService.update(quotationId, dto);
  }

  @Post(':quotationId/send')
  @Permissions('orders:update')
  @ApiOperation({ summary: 'Send quotation (draft → sent)' })
  send(@Param('quotationId') quotationId: string) {
    return this.quotationsService.send(quotationId);
  }

  @Post(':quotationId/close')
  @Permissions('orders:update')
  @ApiOperation({ summary: 'Close quotation (sent → won | lost)' })
  close(
    @Param('quotationId') quotationId: string,
    @Body() dto: CloseQuotationDto,
  ) {
    return this.quotationsService.close(quotationId, dto);
  }

  @Get('conversion-rate')
  @Permissions('orders:read')
  @AuditTable('ord.quotations')
  @ApiOperation({ summary: 'Quotation conversion-rate KPI (sensitive commercial data)' })
  getConversionRate() {
    return this.quotationsService.getConversionRate();
  }
}
