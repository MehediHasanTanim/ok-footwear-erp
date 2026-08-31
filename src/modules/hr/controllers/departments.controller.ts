import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { ParseUUIDPipe } from '@common/pipes/parse-uuid.pipe';
import { DepartmentsService } from '../services/departments.service';
import { CreateDepartmentDto, UpdateDepartmentDto } from '../dto/employees.dto';

@ApiTags('HR — Departments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('hr/departments')
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @Post()
  @HttpCode(201)
  @Permissions('hr:create')
  create(@Body() dto: CreateDepartmentDto) {
    return this.departments.create(dto);
  }

  @Get()
  @Permissions('hr:read')
  findAll(@Query('activeOnly') activeOnly?: string) {
    return this.departments.findAll(activeOnly !== 'false');
  }

  @Get(':id')
  @Permissions('hr:read')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.departments.findOne(id);
  }

  @Patch(':id')
  @Permissions('hr:update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDepartmentDto) {
    return this.departments.update(id, dto);
  }
}
