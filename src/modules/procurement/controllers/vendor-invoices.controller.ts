import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard, type JwtPayload } from '@common/guards/jwt-auth.guard';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { CurrentUser } from '@common/decorators/auth.decorator';
import { AuditTable } from '@common/decorators/audit.decorator';
import { VendorInvoicesService } from '../services/vendor-invoices.service';
import {
  CreateVendorInvoiceDto,
  RecordPaymentDto,
  VendorInvoiceQueryDto,
} from '../dto/vendor-invoices.dto';

@ApiTags('Procurement — Vendor Invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('procurement/vendor-invoices')
export class VendorInvoicesController {
  constructor(private readonly invoices: VendorInvoicesService) {}

  @Get()
  @Permissions('procurement:read')
  findAll(@Query() query: VendorInvoiceQueryDto) {
    return this.invoices.findAll(query);
  }

  @Post()
  @Permissions('procurement:create')
  @AuditTable('prc.vendor_invoices')
  @ApiOperation({ summary: 'Create vendor invoice (three-way match + TDS)' })
  create(@Body() dto: CreateVendorInvoiceDto, @CurrentUser() user: JwtPayload) {
    if (!user?.sub) {
      throw new UnauthorizedException({ statusCode: 401, message: 'Authentication required' });
    }
    return this.invoices.create(dto, user.sub);
  }

  @Get(':id')
  @Permissions('procurement:read')
  findOne(@Param('id') id: string) {
    return this.invoices.findOne(id);
  }

  @Post(':id/payments')
  @Permissions('procurement:update')
  @AuditTable('prc.vendor_invoices')
  @ApiOperation({ summary: 'Record partial/full payment' })
  recordPayment(@Param('id') id: string, @Body() dto: RecordPaymentDto) {
    return this.invoices.recordPayment(id, dto);
  }
}
