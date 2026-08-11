import {
  Controller,
  Get,
  Post,
  Patch,
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
import { ParseUUIDPipe } from '@common/pipes/parse-uuid.pipe';
import { StockCountsService } from '../services/stock-counts.service';
import {
  CreateStockCountDto,
  StockCountQueryDto,
  UpdateStockCountLineDto,
} from '../dto/stock-counts.dto';

@ApiTags('Inventory — Stock Counts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('inventory/stock-counts')
export class StockCountsController {
  constructor(private readonly counts: StockCountsService) {}

  @Get()
  @Permissions('inventory:read')
  findAll(@Query() query: StockCountQueryDto) {
    return this.counts.findAll(query);
  }

  @Get(':id')
  @Permissions('inventory:read')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.counts.findOne(id);
  }

  @Post()
  @Permissions('inventory:create')
  create(@Body() dto: CreateStockCountDto, @CurrentUser() user: JwtPayload) {
    if (!user?.sub) {
      throw new UnauthorizedException({ statusCode: 401, message: 'Authentication required' });
    }
    return this.counts.create(dto, user.sub);
  }

  @Patch(':id/lines/:lineId')
  @Permissions('inventory:update')
  updateLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() dto: UpdateStockCountLineDto,
  ) {
    return this.counts.updateLine(id, lineId, dto);
  }

  @Post(':id/submit')
  @Permissions('inventory:update')
  @HttpCode(200)
  @ApiOperation({ summary: 'Submit count for variance review' })
  submit(@Param('id', ParseUUIDPipe) id: string) {
    return this.counts.submit(id);
  }

  @Post(':id/approve')
  @Permissions('inventory:approve')
  @HttpCode(200)
  @AuditTable('inv.stock_counts')
  @ApiOperation({ summary: 'Approve count and post adjustment movements' })
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    if (!user?.sub) {
      throw new UnauthorizedException({ statusCode: 401, message: 'Authentication required' });
    }
    return this.counts.approve(id, user.sub);
  }

  @Post(':id/cancel')
  @Permissions('inventory:update')
  @HttpCode(200)
  @AuditTable('inv.stock_counts')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.counts.cancel(id);
  }
}
