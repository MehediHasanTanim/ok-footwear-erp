import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { ParseUUIDPipe } from '@common/pipes/parse-uuid.pipe';
import { ChartOfAccountsService } from '../services/chart-of-accounts.service';
import {
  ChartOfAccountQueryDto,
  CreateChartOfAccountDto,
  UpdateChartOfAccountDto,
} from '../dto/chart-of-accounts.dto';

@ApiTags('Finance — Chart of Accounts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('finance/chart-of-accounts')
export class ChartOfAccountsController {
  constructor(private readonly coa: ChartOfAccountsService) {}

  @Get()
  @Permissions('finance:read')
  findAll(@Query() query: ChartOfAccountQueryDto) {
    return this.coa.findAll(query);
  }

  @Get(':id')
  @Permissions('finance:read')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.coa.findOne(id);
  }

  @Post()
  @Permissions('finance:create')
  create(@Body() dto: CreateChartOfAccountDto) {
    return this.coa.create(dto);
  }

  @Patch(':id')
  @Permissions('finance:update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateChartOfAccountDto) {
    return this.coa.update(id, dto);
  }

  @Delete(':id')
  @Permissions('finance:delete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Soft-deactivate account (blocked if has transactions)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.coa.remove(id);
  }
}
