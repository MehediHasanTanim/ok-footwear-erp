import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, type JwtPayload } from '@common/guards/jwt-auth.guard';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { CurrentUser } from '@common/decorators/auth.decorator';
import { ParseUUIDPipe } from '@common/pipes/parse-uuid.pipe';
import { ProductionBlockGuard } from '../guards/production-block.guard';
import { ProductionOrdersService } from '../services/production-orders.service';
import {
  CreateProductionOrderDto,
  ProductionOrderQueryDto,
  UpdateProductionOrderDto,
} from '../dto/production.dto';

@ApiTags('Manufacturing — Production Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('manufacturing/production-orders')
export class ProductionOrdersController {
  constructor(private readonly productionOrders: ProductionOrdersService) {}

  @Post()
  @HttpCode(201)
  @UseGuards(ProductionBlockGuard)
  @Permissions('manufacturing:create')
  @ApiOperation({ summary: 'Create a production order from a sales order + BOM' })
  create(@Body() dto: CreateProductionOrderDto, @CurrentUser() user: JwtPayload) {
    if (!user?.sub) {
      throw new UnauthorizedException({ statusCode: 401, message: 'Authentication required' });
    }
    return this.productionOrders.create(dto, user.sub);
  }

  @Get()
  @Permissions('manufacturing:read')
  findAll(@Query() query: ProductionOrderQueryDto) {
    return this.productionOrders.findAll(query);
  }

  @Get(':id')
  @Permissions('manufacturing:read')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.productionOrders.findOne(id);
  }

  @Patch(':id')
  @Permissions('manufacturing:update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductionOrderDto) {
    return this.productionOrders.update(id, dto);
  }

  @Post(':id/start')
  @HttpCode(200)
  @Permissions('manufacturing:update')
  start(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    if (!user?.sub) {
      throw new UnauthorizedException({ statusCode: 401, message: 'Authentication required' });
    }
    return this.productionOrders.start(id, user.sub);
  }

  @Post(':id/hold')
  @HttpCode(200)
  @Permissions('manufacturing:update')
  hold(@Param('id', ParseUUIDPipe) id: string) {
    return this.productionOrders.hold(id);
  }
}
