import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard, type JwtPayload } from '@common/guards/jwt-auth.guard';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { CurrentUser } from '@common/decorators/auth.decorator';
import { StockTransactionsService } from '../services/stock-transactions.service';
import {
  RecordMovementDto,
  StockTransactionQueryDto,
} from '../dto/stock-transactions.dto';

@ApiTags('Inventory — Transactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('inventory/transactions')
export class StockTransactionsController {
  constructor(private readonly stockTx: StockTransactionsService) {}

  @Get()
  @Permissions('inventory:read')
  @ApiOperation({ summary: 'Paginated stock transaction history' })
  findAll(@Query() query: StockTransactionQueryDto) {
    return this.stockTx.findAll(query);
  }

  @Post()
  @Permissions('inventory:create')
  @ApiOperation({ summary: 'Record stock movement (INSERT only)' })
  record(@Body() dto: RecordMovementDto, @CurrentUser() user: JwtPayload) {
    if (!user?.sub) {
      throw new UnauthorizedException({ statusCode: 401, message: 'Authentication required' });
    }
    return this.stockTx.recordMovement(dto, user.sub);
  }
}
