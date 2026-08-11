import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { ParseUUIDPipe } from '@common/pipes/parse-uuid.pipe';
import { BankAccountsService } from '../services/bank-accounts.service';
import {
  BankAccountQueryDto,
  BankTxnQueryDto,
  CreateBankAccountDto,
  ImportStatementDto,
  UpdateBankAccountDto,
} from '../dto/bank-accounts.dto';

@ApiTags('Finance — Bank Accounts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('finance/bank-accounts')
export class BankAccountsController {
  constructor(private readonly banks: BankAccountsService) {}

  @Get()
  @Permissions('finance:read')
  findAll(@Query() query: BankAccountQueryDto) {
    return this.banks.findAll(query);
  }

  @Get(':id')
  @Permissions('finance:read')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.banks.findOne(id);
  }

  @Post()
  @Permissions('finance:create')
  create(@Body() dto: CreateBankAccountDto) {
    return this.banks.create(dto);
  }

  @Patch(':id')
  @Permissions('finance:update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBankAccountDto) {
    return this.banks.update(id, dto);
  }

  @Delete(':id')
  @Permissions('finance:delete')
  @HttpCode(200)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.banks.remove(id);
  }

  @Get(':id/transactions')
  @Permissions('finance:read')
  listTransactions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: BankTxnQueryDto,
  ) {
    return this.banks.listTransactions(id, query);
  }

  @Post(':id/import')
  @Permissions('finance:create')
  @ApiOperation({ summary: 'Import CSV or OFX bank statement' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['csv', 'ofx'] },
        file: { type: 'string', format: 'binary' },
      },
      required: ['format', 'file'],
    },
  })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  importStatement(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ImportStatementDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException({ statusCode: 400, message: 'Statement file is required' });
    }
    return this.banks.importStatement(id, dto.format, file.buffer.toString('utf8'));
  }

  @Post('transactions/:txnId/reconcile')
  @Permissions('finance:update')
  @ApiOperation({ summary: 'Mark bank transaction reconciled' })
  reconcile(@Param('txnId', ParseUUIDPipe) txnId: string) {
    return this.banks.reconcile(txnId);
  }
}
