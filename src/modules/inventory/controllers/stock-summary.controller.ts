import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { StockSummaryService } from '../services/stock-summary.service';
import { StockSummaryQueryDto } from '../dto/stock-counts.dto';

@ApiTags('Inventory — Stock Summary')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('inventory/stock-summary')
export class StockSummaryController {
  constructor(private readonly summary: StockSummaryService) {}

  @Get()
  @Permissions('inventory:read')
  @ApiOperation({ summary: 'Aggregated stock from materialized view' })
  findAll(@Query() query: StockSummaryQueryDto) {
    return this.summary.findAll(query);
  }

  @Post('refresh')
  @Permissions('inventory:approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'REFRESH MATERIALIZED VIEW CONCURRENTLY (Redis-locked)' })
  refresh() {
    return this.summary.refresh();
  }
}
