// =============================================================================
// Orders DTOs
// =============================================================================
// OK Footwear ERP — Sprint 3, Orders Module
// =============================================================================

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsInt,
  Min,
  IsArray,
  ArrayMinSize,
  ValidateNested,
  IsDateString,
  IsNumber,
  IsEnum,
} from 'class-validator';
import { Type, Exclude, Expose, Transform } from 'class-transformer';
import { PaginationDto } from '@common/dto/pagination.dto';
import { IsIso4217Currency } from '../validators/iso4217.validator';
import { ValidateOrderLinesSum } from '../validators/order-lines-sum.validator';
import { IsFutureDate } from '../validators/future-date.validator';
import type { OrderStatus } from '../services/order-state-machine';
import { nextAllowedStates } from '../services/order-state-machine';

// ---------------------------------------------------------------------------
// OrderQueryDto — filtering + pagination for GET /orders
// ---------------------------------------------------------------------------

export class OrderQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filter by order status',
    enum: ['draft', 'confirmed', 'in_production', 'qc', 'packed', 'delivered', 'cancelled'],
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by buyer ID' })
  @IsOptional()
  @IsUUID('4')
  buyerId?: string;

  @ApiPropertyOptional({ description: 'Delivery date from (ISO date)', example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  deliveryDateFrom?: string;

  @ApiPropertyOptional({ description: 'Delivery date to (ISO date)', example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  deliveryDateTo?: string;
}

// ---------------------------------------------------------------------------
// OrderLineDto — used inside CreateOrderDto
// ---------------------------------------------------------------------------

export class OrderLineDto {
  @ApiProperty({ example: '38', description: 'Size label (e.g. "38", "UK6")' })
  @IsString()
  sizeLabel!: string;

  @ApiProperty({ example: 500, description: 'Quantity for this size' })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({ example: 12.5, description: 'Unit price in order currency' })
  @IsNumber()
  @Min(0.01)
  unitPrice!: number;
}

// ---------------------------------------------------------------------------
// CreateOrderDto
// ---------------------------------------------------------------------------

export class CreateOrderDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'Buyer ID' })
  @IsUUID('4')
  buyerId!: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001', description: 'Article ID' })
  @IsUUID('4')
  articleId!: string;

  @ApiProperty({ example: 1000, description: 'Total quantity across all sizes' })
  @IsInt()
  @Min(1)
  totalQuantity!: number;

  @ApiProperty({ example: '2026-12-31', description: 'Delivery date (must be future)' })
  @IsDateString()
  @IsFutureDate()
  deliveryDate!: string;

  @ApiProperty({ example: 'USD', description: 'ISO 4217 currency code' })
  @IsIso4217Currency()
  currency!: string;

  @ApiProperty({
    type: [OrderLineDto],
    description: 'Per-size quantities. Sum of quantities must equal totalQuantity.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  @ValidateOrderLinesSum()
  orderLines!: OrderLineDto[];
}

// ---------------------------------------------------------------------------
// UpdateOrderDto — mutable fields only (while status = draft)
// ---------------------------------------------------------------------------

export class UpdateOrderDto {
  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440001' })
  @IsOptional()
  @IsUUID('4')
  articleId?: string;

  @ApiPropertyOptional({ example: 1200 })
  @IsOptional()
  @IsInt()
  @Min(1)
  totalQuantity?: number;

  @ApiPropertyOptional({ example: '2027-01-15' })
  @IsOptional()
  @IsDateString()
  @IsFutureDate()
  deliveryDate?: string;

  @ApiPropertyOptional({ example: 'EUR' })
  @IsOptional()
  @IsIso4217Currency()
  currency?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  sampleApproved?: boolean;
}

// ---------------------------------------------------------------------------
// StatusTransitionDto — dedicated endpoint body
// ---------------------------------------------------------------------------

export class StatusTransitionDto {
  @ApiProperty({
    enum: ['draft', 'confirmed', 'in_production', 'qc', 'packed', 'delivered', 'cancelled'],
    description: 'Target status for the transition',
  })
  @IsString()
  toStatus!: string;

  @ApiPropertyOptional({
    description: 'Required when transitioning to cancelled',
    example: 'Buyer requested cancellation due to changed delivery schedule',
  })
  @IsOptional()
  @IsString()
  cancellationReason?: string;
}

// ---------------------------------------------------------------------------
// OrderResponseDto — serialized response shape
// ---------------------------------------------------------------------------

@Exclude()
export class OrderLineResponseDto {
  @Expose()
  id!: string;

  @Expose()
  sizeLabel!: string;

  @Expose()
  quantity!: number;

  @Expose()
  @Transform(({ value }) => (value ? Number(value) : null))
  unitPrice!: number;
}

@Exclude()
export class OrderResponseDto {
  @Expose()
  id!: string;

  @Expose()
  orderNumber!: string;

  @Expose()
  buyerId!: string;

  @Expose()
  articleId!: string;

  @Expose()
  status!: string;

  @Expose()
  sampleApproved!: boolean;

  @Expose()
  totalQuantity!: number;

  @Expose()
  @Transform(({ value }) => {
    if (!value) return null;
    if (typeof value === 'string') return value.split('T')[0];
    return (value as Date).toISOString().split('T')[0];
  })
  deliveryDate!: Date;

  @Expose()
  currency!: string;

  @Expose()
  confirmedAt!: Date | null;

  @Expose()
  confirmedBy!: string | null;

  @Expose()
  cancelledAt!: Date | null;

  @Expose()
  cancellationReason!: string | null;

  @Expose()
  createdAt!: Date;

  @Expose()
  updatedAt!: Date;

  // Embedded relations
  @Expose()
  buyer!: { name: string; currency: string } | null;

  @Expose()
  article!: { code: string; description: string } | null;

  @Expose()
  @Type(() => OrderLineResponseDto)
  orderLines!: OrderLineResponseDto[];

  /**
   * Computed field: valid next states derived from STATUS_TRANSITIONS.
   * The frontend uses this to render available action buttons without
   * duplicating the state machine.
   */
  @Expose()
  get nextAllowedStates(): OrderStatus[] {
    return nextAllowedStates(this.status as OrderStatus);
  }
}
