// =============================================================================
// ComplianceController — CRUD + Nightly Check Trigger
// =============================================================================
// OK Footwear ERP — Sprint 2, System Module
//
// Endpoints:
//   GET    /api/v1/compliance-items              — List all
//   GET    /api/v1/compliance-items/:id          — Get by ID
//   POST   /api/v1/compliance-items              — Create
//   PATCH  /api/v1/compliance-items/:id          — Partial update
//   POST   /api/v1/compliance-items/nightly-check — Trigger nightly cron
// =============================================================================

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  UseGuards,
  ParseUUIDPipe,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { ComplianceService } from '../services/compliance.service';
import {
  CreateComplianceDto,
  UpdateComplianceDto,
  ComplianceItemDto,
} from '../dto/compliance.dto';

// ---------------------------------------------------------------------------
// Helper — map raw DB row (snake_case) to API DTO (camelCase)
// ---------------------------------------------------------------------------

interface ComplianceRow {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  expiry_date: string;
  responsible_user_id: string | null;
  alert_days: number;
  status: string;
  document_url: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: ComplianceRow): ComplianceItemDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    expiryDate: row.expiry_date,
    responsibleUserId: row.responsible_user_id,
    alertDays: row.alert_days,
    status: row.status,
    documentUrl: row.document_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

@ApiTags('compliance')
@Controller('compliance-items')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth()
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  // =========================================================================
  // GET /compliance-items — List all
  // =========================================================================

  @Get()
  @Permissions('compliance:read')
  @ApiOperation({ summary: 'List all compliance items' })
  @ApiResponse({ status: 200, description: 'List of compliance items', type: [ComplianceItemDto] })
  async findAll(): Promise<ComplianceItemDto[]> {
    const rows = await this.complianceService.findAll();
    return rows.map(mapRow);
  }

  // =========================================================================
  // GET /compliance-items/:id — Get by ID
  // =========================================================================

  @Get(':id')
  @Permissions('compliance:read')
  @ApiOperation({ summary: 'Get a compliance item by ID' })
  @ApiResponse({ status: 200, description: 'Compliance item', type: ComplianceItemDto })
  @ApiResponse({ status: 404, description: 'Compliance item not found' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ComplianceItemDto> {
    const row = await this.complianceService.findOne(id);

    if (!row) {
      throw new NotFoundException({
        statusCode: 404,
        message: `Compliance item with ID "${id}" not found`,
      });
    }

    return mapRow(row);
  }

  // =========================================================================
  // POST /compliance-items — Create
  // =========================================================================

  @Post()
  @Permissions('compliance:create')
  @ApiOperation({ summary: 'Create a new compliance item' })
  @ApiResponse({ status: 201, description: 'Created compliance item', type: ComplianceItemDto })
  async create(
    @Body() dto: CreateComplianceDto,
  ): Promise<ComplianceItemDto> {
    const row = await this.complianceService.create({
      name: dto.name,
      description: dto.description,
      category: dto.category,
      expiryDate: new Date(dto.expiryDate),
      responsibleUserId: dto.responsibleUserId,
      alertDays: dto.alertDays,
      documentUrl: dto.documentUrl,
    });

    if (!row) {
      throw new NotFoundException({
        statusCode: 500,
        message: 'Failed to create compliance item',
      });
    }

    return mapRow(row);
  }

  // =========================================================================
  // PATCH /compliance-items/:id — Partial update
  // =========================================================================

  @Patch(':id')
  @Permissions('compliance:update')
  @ApiOperation({ summary: 'Update a compliance item (partial)' })
  @ApiResponse({ status: 200, description: 'Updated compliance item', type: ComplianceItemDto })
  @ApiResponse({ status: 404, description: 'Compliance item not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateComplianceDto,
  ): Promise<ComplianceItemDto> {
    const row = await this.complianceService.update(id, {
      name: dto.name,
      description: dto.description,
      category: dto.category,
      expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
      responsibleUserId: dto.responsibleUserId,
      alertDays: dto.alertDays,
      status: dto.status,
      documentUrl: dto.documentUrl,
    });

    if (!row) {
      throw new NotFoundException({
        statusCode: 404,
        message: `Compliance item with ID "${id}" not found`,
      });
    }

    return mapRow(row);
  }

  // =========================================================================
  // POST /compliance-items/nightly-check — Trigger nightly cron manually
  // =========================================================================

  @Post('nightly-check')
  @Permissions('compliance:update')
  @ApiOperation({
    summary: 'Manually trigger the compliance nightly check',
    description:
      'Runs the same logic as the scheduled 02:00 cron: checks for expired ' +
      'and expiring compliance items, updates statuses, sends email alerts, ' +
      'and writes audit logs.',
  })
  @ApiResponse({ status: 200, description: 'Nightly check completed' })
  @ApiResponse({ status: 409, description: 'Another instance is already running' })
  async triggerNightlyCheck(): Promise<{ message: string }> {
    await this.complianceService.nightlyCheck();
    return { message: 'Nightly compliance check completed' };
  }

  // =========================================================================
  // DELETE /compliance-items/:id — Delete
  // =========================================================================

  @Delete(':id')
  @Permissions('compliance:delete')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a compliance item' })
  @ApiResponse({ status: 204, description: 'Compliance item deleted' })
  @ApiResponse({ status: 404, description: 'Compliance item not found' })
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const existing = await this.complianceService.findOne(id);

    if (!existing) {
      throw new NotFoundException({
        statusCode: 404,
        message: `Compliance item with ID "${id}" not found`,
      });
    }

    await this.complianceService.delete(id);
  }
}
