import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class EnrollPfDto {
  @ApiProperty() @IsUUID() employeeId!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() enrolledDate?: string;
}

export class PfContributionDto {
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(1) month!: number;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(2000) year!: number;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0) basicSalary!: number;
}

export class PfStatementQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() fromDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() toDate?: string;
}

export class GratuityEntitlementQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() exitDate?: string;
}

export class RunGratuityAccrualDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() asOfDate?: string;
}
