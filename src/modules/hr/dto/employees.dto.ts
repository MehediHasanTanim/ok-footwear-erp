import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '@common/dto/pagination.dto';

export class CreateDepartmentDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(50) code!: string;
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() parentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() costCenter?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
}

export class UpdateDepartmentDto extends PartialType(CreateDepartmentDto) {
  @ApiPropertyOptional() @IsOptional() isActive?: boolean;
}

export class CreateDesignationDto {
  @ApiProperty() @IsString() code!: string;
  @ApiProperty() @IsString() title!: string;
  @ApiProperty({ enum: ['junior', 'mid', 'senior', 'lead', 'manager', 'director'] })
  @IsIn(['junior', 'mid', 'senior', 'lead', 'manager', 'director'])
  level!: string;
}

export class UpdateDesignationDto extends PartialType(CreateDesignationDto) {}

export class EmployeeSecretsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() nid?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() passport?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankAccount?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankBranch?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() routingNumber?: string;
  @ApiPropertyOptional() @IsOptional() emergencyContact?: Record<string, unknown>;
}

export class CreateEmployeeDto {
  @ApiProperty() @IsString() employeeCode!: string;
  @ApiProperty() @IsString() fullName!: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiProperty() @IsDateString() dateOfBirth!: string;
  @ApiProperty({ enum: ['M', 'F', 'O'] }) @IsIn(['M', 'F', 'O']) gender!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nationality?: string;
  @ApiProperty() @IsDateString() joinDate!: string;
  @ApiProperty() @IsUUID() departmentId!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() designationId?: string;
  @ApiProperty() @IsString() designation!: string;
  @ApiProperty({ enum: ['full_time', 'contractor', 'intern', 'part_time'] })
  @IsIn(['full_time', 'contractor', 'intern', 'part_time'])
  employmentType!: string;
  @ApiProperty({ enum: ['office', 'factory'] })
  @IsIn(['office', 'factory'])
  employeeCategory!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['operator', 'helper', 'qc_inspector', 'supervisor', 'floor_incharge'])
  factoryCategory?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() reportingManagerId?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) basicSalary?: number;
  @ApiPropertyOptional() @IsOptional() secrets?: EmployeeSecretsDto;
}

export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['active', 'probation', 'notice_period', 'terminated', 'resigned'])
  status?: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString() lastWorkingDate?: string;
}

export class EmployeeQueryDto extends PaginationDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() departmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}

export class TerminateEmployeeDto {
  @ApiProperty() @IsDateString() lastWorkingDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}
