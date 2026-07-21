// =============================================================================
// Audit DTOs — Query filters for audit log retrieval
// =============================================================================
// OK Footwear ERP — Sprint 2, System Module
// =============================================================================

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, IsDateString, IsIn } from 'class-validator';
import { PaginationDto } from '@common/dto/pagination.dto';

// ---------------------------------------------------------------------------
// AuditQueryDto — Filterable audit log query
// ---------------------------------------------------------------------------

export type AuditActionFilter = 'INSERT' | 'UPDATE' | 'DELETE' | 'SELECT';

export class AuditQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filter by schema-qualified table name (e.g., sys.users)',
    example: 'sys.users',
  })
  @IsOptional()
  @IsString()
  tableName?: string;

  @ApiPropertyOptional({
    description: 'Filter by affected record ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsString()
  recordId?: string;

  @ApiPropertyOptional({
    description: 'Filter by DML action type',
    enum: ['INSERT', 'UPDATE', 'DELETE', 'SELECT'],
  })
  @IsOptional()
  @IsIn(['INSERT', 'UPDATE', 'DELETE', 'SELECT'])
  action?: AuditActionFilter;

  @ApiPropertyOptional({
    description: 'Filter by the UUID of the user who performed the action',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  changedBy?: string;

  @ApiPropertyOptional({
    description: 'Filter audit logs created after this date (ISO 8601, inclusive)',
    example: '2026-07-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({
    description: 'Filter audit logs created before this date (ISO 8601, inclusive)',
    example: '2026-07-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({
    description: 'Filter by correlation ID (for tracing a request chain)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  correlationId?: string;
}

// ---------------------------------------------------------------------------
// AuditLogEntry — Shape of a returned audit log row
// ---------------------------------------------------------------------------

export class AuditLogEntryDto {
  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiPropertyOptional({ example: 'sys.users' })
  tableName!: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440000' })
  recordId!: string;

  @ApiPropertyOptional({ example: 'UPDATE' })
  action!: string;

  @ApiPropertyOptional({ example: { name: 'Old' } })
  oldValue?: Record<string, unknown> | null;

  @ApiPropertyOptional({ example: { name: 'New' } })
  newValue?: Record<string, unknown> | null;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440000' })
  changedBy?: string | null;

  @ApiPropertyOptional({ example: '192.168.1.100' })
  ipAddress?: string | null;

  @ApiPropertyOptional({ example: 'Mozilla/5.0 ...' })
  userAgent?: string | null;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440000' })
  correlationId?: string | null;

  @ApiPropertyOptional({ example: '2026-07-20T12:34:56.789Z' })
  createdAt!: string;
}
