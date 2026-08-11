// =============================================================================
// ComplaintsController — Nested under /api/orders/:orderId/complaints
// =============================================================================
// OK Footwear ERP — Sprint 4, Orders Module
// =============================================================================

import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, type JwtPayload } from '@common/guards/jwt-auth.guard';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { CurrentUser } from '@common/decorators/auth.decorator';
import { AuditTable } from '@common/decorators/audit.decorator';
import { ValidateOrderPipe } from '../pipes/validate-order.pipe';
import { ComplaintsService } from '../services/complaints.service';
import {
  CreateComplaintDto,
  UpdateRootCauseDto,
  UpdateComplaintStatusDto,
} from '../dto/complaints.dto';

@ApiTags('Complaints')
@ApiBearerAuth()
@Controller('orders/:orderId/complaints')
@UseGuards(JwtAuthGuard, RbacGuard)
export class ComplaintsController {
  constructor(private readonly complaintsService: ComplaintsService) {}

  @Get()
  @Permissions('orders:read')
  @ApiOperation({ summary: 'List complaints for an order' })
  findAll(@Param('orderId', ValidateOrderPipe) order: { id: string }) {
    return this.complaintsService.findByOrder(order.id);
  }

  @Post()
  @Permissions('orders:create')
  @ApiOperation({ summary: 'Create a new complaint' })
  create(
    @Param('orderId', ValidateOrderPipe) order: { id: string },
    @Body() dto: CreateComplaintDto,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user?.sub) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Authentication required',
        detail: 'A valid user identity is required to raise a complaint.',
      });
    }
    return this.complaintsService.create(order.id, dto, user.sub);
  }

  @Get(':complaintId')
  @Permissions('orders:read')
  @AuditTable('ord.complaints')
  @ApiOperation({ summary: 'Get complaint detail (sensitive operational data)' })
  findOne(@Param('complaintId') complaintId: string) {
    return this.complaintsService.findOne(complaintId);
  }

  @Patch(':complaintId/root-cause')
  @Permissions('orders:update')
  @AuditTable('ord.complaints')
  @ApiOperation({ summary: 'Update root cause (sensitive operational data)' })
  updateRootCause(
    @Param('complaintId') complaintId: string,
    @Body() dto: UpdateRootCauseDto,
  ) {
    return this.complaintsService.updateRootCause(complaintId, dto);
  }

  @Patch(':complaintId/status')
  @Permissions('orders:update')
  @AuditTable('ord.complaints')
  @ApiOperation({ summary: 'Transition complaint status (including manual resolve)' })
  updateStatus(
    @Param('complaintId') complaintId: string,
    @Body() dto: UpdateComplaintStatusDto,
  ) {
    return this.complaintsService.updateStatus(complaintId, dto);
  }
}
