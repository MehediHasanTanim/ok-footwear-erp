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
import { ParseUUIDPipe } from '@common/pipes/parse-uuid.pipe';
import { StockItemsService } from '../services/stock-items.service';
import {
  CreateStockItemDto,
  UpdateStockItemDto,
  StockItemQueryDto,
} from '../dto/stock-items.dto';

@ApiTags('Inventory — Stock Items')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('inventory/stock-items')
export class StockItemsController {
  constructor(private readonly items: StockItemsService) {}

  @Get()
  @Permissions('inventory:read')
  @ApiOperation({ summary: 'List stock items (trigram search, category, below-reorder)' })
  findAll(@Query() query: StockItemQueryDto) {
    return this.items.findAll(query);
  }

  @Get(':id')
  @Permissions('inventory:read')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.items.findOne(id);
  }

  @Post()
  @Permissions('inventory:create')
  create(@Body() dto: CreateStockItemDto, @CurrentUser() user: JwtPayload) {
    if (!user?.sub) {
      throw new UnauthorizedException({ statusCode: 401, message: 'Authentication required' });
    }
    return this.items.create(dto, user.sub);
  }

  @Patch(':id')
  @Permissions('inventory:update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStockItemDto) {
    return this.items.update(id, dto);
  }

  @Delete(':id')
  @Permissions('inventory:delete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Soft-deactivate stock item' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.items.remove(id);
  }
}
