import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BiometricRecordDto {
  @ApiProperty() @IsUUID() employeeId!: string;
  @ApiProperty() @IsDateString() checkDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() clockIn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() clockOut?: string;
  @ApiPropertyOptional({ enum: ['present', 'absent', 'late', 'half_day'] })
  @IsOptional()
  @IsIn(['present', 'absent', 'late', 'half_day'])
  status?: string;
}

export class BiometricSyncDto {
  @ApiPropertyOptional() @IsOptional() @IsString() deviceId?: string;
  @ApiProperty({ type: [BiometricRecordDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BiometricRecordDto)
  records!: BiometricRecordDto[];
}

export class ManualCorrectionDto {
  @ApiProperty() @IsUUID() employeeId!: string;
  @ApiProperty() @IsDateString() checkDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() clockIn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() clockOut?: string;
  @ApiProperty() @IsString() reason!: string;
}

export class AttendanceQueryDto {
  @ApiProperty() @IsUUID() employeeId!: string;
  @ApiProperty() @IsDateString() fromDate!: string;
  @ApiProperty() @IsDateString() toDate!: string;
}

export class LopQueryDto {
  @ApiProperty() @IsUUID() employeeId!: string;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(1) month!: number;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(2000) year!: number;
}
