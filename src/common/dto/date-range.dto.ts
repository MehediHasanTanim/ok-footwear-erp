import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsDateString } from 'class-validator';

/**
 * Reusable date range query DTO for filtering lists by date range.
 *
 * Usage: @Query() dateRange: DateRangeDto
 */
export class DateRangeDto {
  @ApiPropertyOptional({ description: 'Start date (ISO 8601, inclusive)' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'End date (ISO 8601, inclusive)' })
  @IsOptional()
  @IsDateString()
  toDate?: string;
}
