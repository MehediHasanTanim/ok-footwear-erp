import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { ParseUUIDPipe } from '@common/pipes/parse-uuid.pipe';
import { DesignationsService } from '../services/designations.service';
import { CreateDesignationDto, UpdateDesignationDto } from '../dto/employees.dto';

@ApiTags('HR — Designations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('hr/designations')
export class DesignationsController {
  constructor(private readonly designations: DesignationsService) {}

  @Post()
  @HttpCode(201)
  @Permissions('hr:create')
  create(@Body() dto: CreateDesignationDto) {
    return this.designations.create(dto);
  }

  @Get()
  @Permissions('hr:read')
  findAll() {
    return this.designations.findAll();
  }

  @Get(':id')
  @Permissions('hr:read')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.designations.findOne(id);
  }

  @Patch(':id')
  @Permissions('hr:update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDesignationDto) {
    return this.designations.update(id, dto);
  }
}
