import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { ParseUUIDPipe } from '@common/pipes/parse-uuid.pipe';
import { BuyerInvoicesService } from '../services/buyer-invoices.service';
import { BuyerInvoiceQueryDto, RecordCollectionDto } from '../dto/delivery-ar.dto';

@ApiTags('Finance — Buyer Invoices (AR)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('finance/buyer-invoices')
export class BuyerInvoicesController {
  constructor(private readonly invoices: BuyerInvoicesService) {}

  @Get()
  @Permissions('finance:read')
  findAll(@Query() query: BuyerInvoiceQueryDto) {
    return this.invoices.findAll(query);
  }

  @Get('ageing')
  @Permissions('finance:read')
  @ApiOperation({ summary: 'AR ageing buckets 0-30 / 31-60 / 61-90 / 90+' })
  ageing() {
    return this.invoices.ageing();
  }

  @Get(':id')
  @Permissions('finance:read')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoices.findOne(id);
  }

  @Post(':id/collect')
  @Permissions('finance:update')
  collect(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordCollectionDto) {
    return this.invoices.recordCollection(id, dto);
  }

  @Post(':id/dispute')
  @Permissions('finance:update')
  dispute(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoices.dispute(id);
  }

  @Post(':id/clear-dispute')
  @Permissions('finance:update')
  clearDispute(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoices.clearDispute(id);
  }
}
