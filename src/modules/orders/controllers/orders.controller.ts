// =============================================================================
// OrdersController — Order CRUD + Status Transitions
// =============================================================================
// OK Footwear ERP — Sprint 3, Orders Module
// =============================================================================

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, type JwtPayload } from '@common/guards/jwt-auth.guard';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { CurrentUser } from '@common/decorators/auth.decorator';
import { OrdersService } from '../services/orders.service';
import {
  CreateOrderDto,
  UpdateOrderDto,
  OrderQueryDto,
  StatusTransitionDto,
} from '../dto/orders.dto';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
@UseGuards(JwtAuthGuard, RbacGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // =========================================================================
  // GET /orders
  // =========================================================================

  @Get()
  @Permissions('orders:read')
  @ApiOperation({ summary: 'List orders (paginated, filterable by status, buyer, delivery range)' })
  @ApiResponse({ status: 200, description: 'Paginated order list' })
  findAll(@Query() query: OrderQueryDto) {
    return this.ordersService.findAll(query);
  }

  // =========================================================================
  // GET /orders/:id
  // =========================================================================

  @Get(':id')
  @Permissions('orders:read')
  @ApiOperation({ summary: 'Get order by ID (full detail with order lines + milestones)' })
  @ApiResponse({ status: 200, description: 'Order detail' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  // =========================================================================
  // POST /orders
  // =========================================================================

  @Post()
  @Permissions('orders:create')
  @ApiOperation({ summary: 'Create a new order (draft status)' })
  @ApiResponse({ status: 201, description: 'Order created' })
  @ApiResponse({ status: 422, description: 'Validation failed (e.g., orderLines sum mismatch)' })
  @HttpCode(201)
  create(@Body() dto: CreateOrderDto) {
    return this.ordersService.create(dto);
  }

  // =========================================================================
  // PATCH /orders/:id — mutable fields (draft only)
  // =========================================================================

  @Patch(':id')
  @Permissions('orders:update')
  @ApiOperation({ summary: 'Update mutable fields on a draft order' })
  @ApiResponse({ status: 200, description: 'Order updated' })
  @ApiResponse({ status: 400, description: 'Cannot edit confirmed+ orders' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  update(@Param('id') id: string, @Body() dto: UpdateOrderDto) {
    return this.ordersService.update(id, dto);
  }

  // =========================================================================
  // PATCH /orders/:id/status — dedicated status transition endpoint
  // =========================================================================

  @Patch(':id/status')
  @Permissions('orders:update')
  @ApiOperation({ summary: 'Transition order to a new status' })
  @ApiResponse({ status: 200, description: 'Status transitioned successfully' })
  @ApiResponse({ status: 400, description: 'Invalid transition (e.g., sample not approved, terminal state)' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  transitionStatus(
    @Param('id') id: string,
    @Body() dto: StatusTransitionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ordersService.transitionStatus(id, dto, user.sub);
  }

  // =========================================================================
  // DELETE /orders/:id — cancel (not hard delete)
  // =========================================================================

  @Delete(':id')
  @Permissions('orders:delete')
  @ApiOperation({ summary: 'Cancel an order (not a hard delete)' })
  @ApiResponse({ status: 200, description: 'Order cancelled' })
  @ApiResponse({ status: 400, description: 'Cannot cancel (terminal state or missing reason)' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @HttpCode(200)
  remove(@Param('id') id: string) {
    return this.ordersService.cancel(id);
  }
}
