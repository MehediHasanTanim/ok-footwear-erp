import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { ParseUUIDPipe } from '@common/pipes/parse-uuid.pipe';
import { WarehousesService } from '../services/warehouses.service';
import {
  CreateWarehouseDto,
  UpdateWarehouseDto,
  WarehouseQueryDto,
} from '../dto/warehouses.dto';

@ApiTags('Inventory — Warehouses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('inventory/warehouses')
export class WarehousesController {
  constructor(private readonly warehouses: WarehousesService) {}

  @Get()
  @Permissions('inventory:read')
  @ApiOperation({ summary: 'List warehouses' })
  findAll(@Query() query: WarehouseQueryDto) {
    return this.warehouses.findAll(query);
  }

  @Get(':id')
  @Permissions('inventory:read')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.warehouses.findOne(id);
  }

  @Post()
  @Permissions('inventory:create')
  create(@Body() dto: CreateWarehouseDto) {
    return this.warehouses.create(dto);
  }

  @Patch(':id')
  @Permissions('inventory:update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWarehouseDto) {
    return this.warehouses.update(id, dto);
  }

  @Delete(':id')
  @Permissions('inventory:delete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Soft-deactivate warehouse' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.warehouses.remove(id);
  }
}
