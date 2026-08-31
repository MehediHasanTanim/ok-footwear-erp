import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateLeaveTypeDto {
  @ApiProperty() @IsString() code!: string;
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPaid?: boolean;
  @ApiPropertyOptional({ enum: ['annual', 'monthly', 'none'] })
  @IsOptional()
  @IsIn(['annual', 'monthly', 'none'])
  accrualType?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) annualEntitlement?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) carryForwardLimit?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() halfDayAllowed?: boolean;
}

export class UpdateLeaveTypeDto extends PartialType(CreateLeaveTypeDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ApplyLeaveDto {
  @ApiProperty() @IsUUID() employeeId!: string;
  @ApiProperty() @IsUUID() leaveTypeId!: string;
  @ApiProperty() @IsDateString() startDate!: string;
  @ApiProperty() @IsDateString() endDate!: string;
  @ApiPropertyOptional({ enum: ['morning', 'afternoon'] })
  @IsOptional()
  @IsIn(['morning', 'afternoon'])
  halfDay?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

export class ApproveLeaveDto {
  @ApiProperty({ enum: ['manager', 'hr'] })
  @IsIn(['manager', 'hr'])
  stage!: 'manager' | 'hr';
}

export class RejectLeaveDto {
  @ApiProperty() @IsString() reason!: string;
}

export class CarryForwardDto {
  @ApiProperty() @Type(() => Number) @IsNumber() fromYear!: number;
  @ApiProperty() @Type(() => Number) @IsNumber() toYear!: number;
}

export class LeaveBalanceQueryDto {
  @ApiProperty() @IsUUID() employeeId!: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() year?: number;
}
