// =============================================================================
// BuyersController — Buyer CRUD Endpoints
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
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { BuyersService } from '../services/buyers.service';
import {
  CreateBuyerDto,
  UpdateBuyerDto,
  BuyerQueryDto,
} from '../dto/buyers.dto';

@ApiTags('buyers')
@ApiBearerAuth()
@Controller('buyers')
@UseGuards(JwtAuthGuard, RbacGuard)
export class BuyersController {
  constructor(private readonly buyersService: BuyersService) {}

  // =========================================================================
  // GET /buyers
  // =========================================================================

  @Get()
  @Permissions('orders:read')
  @ApiOperation({ summary: 'List buyers (paginated, searchable, dropdown mode)' })
  @ApiResponse({ status: 200, description: 'Paginated buyer list or dropdown' })
  findAll(@Query() query: BuyerQueryDto) {
    return this.buyersService.findAll(query);
  }

  // =========================================================================
  // GET /buyers/:id
  // =========================================================================

  @Get(':id')
  @Permissions('orders:read')
  @ApiOperation({ summary: 'Get buyer by ID' })
  @ApiResponse({ status: 200, description: 'Buyer detail' })
  @ApiResponse({ status: 404, description: 'Buyer not found' })
  findOne(@Param('id') id: string) {
    return this.buyersService.findOne(id);
  }

  // =========================================================================
  // POST /buyers
  // =========================================================================

  @Post()
  @Permissions('orders:create')
  @ApiOperation({ summary: 'Create a new buyer' })
  @ApiResponse({ status: 201, description: 'Buyer created' })
  @HttpCode(201)
  create(@Body() dto: CreateBuyerDto) {
    return this.buyersService.create(dto);
  }

  // =========================================================================
  // PATCH /buyers/:id
  // =========================================================================

  @Patch(':id')
  @Permissions('orders:update')
  @ApiOperation({ summary: 'Update buyer fields (soft-delete via isActive=false)' })
  @ApiResponse({ status: 200, description: 'Buyer updated' })
  @ApiResponse({ status: 404, description: 'Buyer not found' })
  update(@Param('id') id: string, @Body() dto: UpdateBuyerDto) {
    return this.buyersService.update(id, dto);
  }

  // =========================================================================
  // DELETE /buyers/:id — soft-delete only
  // =========================================================================

  @Delete(':id')
  @Permissions('orders:delete')
  @ApiOperation({ summary: 'Soft-delete a buyer (sets isActive=false)' })
  @ApiResponse({ status: 200, description: 'Buyer soft-deleted' })
  @ApiResponse({ status: 404, description: 'Buyer not found' })
  @HttpCode(200)
  remove(@Param('id') id: string) {
    return this.buyersService.softDelete(id);
  }
}
