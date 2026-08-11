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
  UnauthorizedException,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard, type JwtPayload } from '@common/guards/jwt-auth.guard';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { CurrentUser } from '@common/decorators/auth.decorator';
import { AuditTable } from '@common/decorators/audit.decorator';
import { PurchaseOrdersService } from '../services/purchase-orders.service';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  PurchaseOrderQueryDto,
  RejectPurchaseOrderDto,
  PoLineDto,
} from '../dto/purchase-orders.dto';

@ApiTags('Procurement — Purchase Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('procurement/purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly pos: PurchaseOrdersService) {}

  @Get()
  @Permissions('procurement:read')
  findAll(@Query() query: PurchaseOrderQueryDto) {
    return this.pos.findAll(query);
  }

  @Post()
  @Permissions('procurement:create')
  create(@Body() dto: CreatePurchaseOrderDto, @CurrentUser() user: JwtPayload) {
    if (!user?.sub) {
      throw new UnauthorizedException({ statusCode: 401, message: 'Authentication required' });
    }
    return this.pos.create(dto, user.sub);
  }

  @Get(':id')
  @Permissions('procurement:read')
  findOne(@Param('id') id: string) {
    return this.pos.findOne(id);
  }

  @Patch(':id')
  @Permissions('procurement:update')
  update(@Param('id') id: string, @Body() dto: UpdatePurchaseOrderDto) {
    return this.pos.update(id, dto);
  }

  @Post(':id/submit')
  @Permissions('procurement:update')
  @AuditTable('prc.purchase_orders')
  @ApiOperation({ summary: 'Submit PO for approval' })
  submit(@Param('id') id: string) {
    return this.pos.submit(id);
  }

  @Post(':id/approve')
  @Permissions('procurement:approve')
  @AuditTable('prc.purchase_orders')
  approve(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    if (!user?.sub) {
      throw new UnauthorizedException({ statusCode: 401, message: 'Authentication required' });
    }
    return this.pos.approve(id, user.sub);
  }

  @Post(':id/reject')
  @Permissions('procurement:approve')
  @AuditTable('prc.purchase_orders')
  reject(
    @Param('id') id: string,
    @Body() dto: RejectPurchaseOrderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user?.sub) {
      throw new UnauthorizedException({ statusCode: 401, message: 'Authentication required' });
    }
    return this.pos.reject(id, dto, user.sub);
  }

  @Delete(':id')
  @Permissions('procurement:delete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel PO' })
  cancel(@Param('id') id: string) {
    return this.pos.cancel(id);
  }

  @Post(':poId/lines')
  @Permissions('procurement:update')
  addLine(@Param('poId') poId: string, @Body() dto: PoLineDto) {
    return this.pos.addLine(poId, dto);
  }

  @Delete(':poId/lines/:lineId')
  @Permissions('procurement:update')
  @HttpCode(200)
  removeLine(@Param('poId') poId: string, @Param('lineId') lineId: string) {
    return this.pos.removeLine(poId, lineId);
  }
}
