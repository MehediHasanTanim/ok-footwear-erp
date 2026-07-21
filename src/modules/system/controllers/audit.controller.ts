// =============================================================================
// AuditController — Query endpoints for the sys.audit_logs partitioned table
// =============================================================================
// OK Footwear ERP — Sprint 2, System Module
//
// Provides paginated, filterable access to the append-only audit trail.
// All endpoints require authentication + system:read permission.
//
// Endpoints:
//   GET /api/v1/audit-logs       — Paginated list (with filters)
//   GET /api/v1/audit-logs/:id   — Single audit log entry
// =============================================================================

import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { PaginatedResult } from '@common/dto/pagination.dto';
import { AuditService } from '../services/audit.service';
import { AuditQueryDto, AuditLogEntryDto } from '../dto/audit.dto';
import type { AuditLogRow } from '../services/audit.service';

// ---------------------------------------------------------------------------
// Helper — map raw DB row (snake_case) to API DTO (camelCase)
// ---------------------------------------------------------------------------

function mapRow(row: AuditLogRow): AuditLogEntryDto {
  return {
    id: row.id,
    tableName: row.table_name,
    recordId: row.record_id,
    action: row.action,
    oldValue: row.old_value,
    newValue: row.new_value,
    changedBy: row.changed_by,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    correlationId: row.correlation_id,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

@ApiTags('audit-logs')
@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth()
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  // =========================================================================
  // GET /audit-logs — Paginated list with filters
  // =========================================================================

  @Get()
  @Permissions('system:read')
  @ApiOperation({
    summary: 'List audit log entries (paginated, filterable)',
    description:
      'Returns a paginated list of audit log entries in reverse chronological order. ' +
      'Supports filtering by table name, record ID, action type, user, date range, and correlation ID.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated audit log entries',
  })
  async findAll(
    @Query() query: AuditQueryDto,
  ): Promise<PaginatedResult<AuditLogEntryDto>> {
    const rows = await this.auditService.query({
      tableName: query.tableName,
      recordId: query.recordId,
      action: query.action,
      changedBy: query.changedBy,
      fromDate: query.fromDate,
      toDate: query.toDate,
      correlationId: query.correlationId,
      page: query.page,
      limit: query.limit,
    });

    const totalItems = await this.auditService.count({
      tableName: query.tableName,
      recordId: query.recordId,
      action: query.action,
      changedBy: query.changedBy,
      fromDate: query.fromDate,
      toDate: query.toDate,
      correlationId: query.correlationId,
    });

    return {
      data: rows.map(mapRow),
      meta: {
        page: query.page,
        limit: query.limit,
        totalItems,
        totalPages: Math.ceil(totalItems / query.limit),
      },
    };
  }

  // =========================================================================
  // GET /audit-logs/:id — Single audit log entry
  // =========================================================================

  @Get(':id')
  @Permissions('system:read')
  @ApiOperation({
    summary: 'Get a single audit log entry by ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Audit log entry',
  })
  @ApiResponse({ status: 404, description: 'Audit log entry not found' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AuditLogEntryDto> {
    const row = await this.auditService.findById(id);

    if (!row) {
      throw new NotFoundException({
        statusCode: 404,
        message: `Audit log entry with ID "${id}" not found`,
      });
    }

    return mapRow(row);
  }
}
