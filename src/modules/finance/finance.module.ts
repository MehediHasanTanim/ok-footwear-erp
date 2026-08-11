import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { OrdersModule } from '@modules/orders/orders.module';
import { StorageModule } from '@infrastructure/storage/storage.module';

import { ChartOfAccountsController } from './controllers/chart-of-accounts.controller';
import {
  GlEntriesController,
  GlPeriodsController,
  GlReportsController,
} from './controllers/gl.controller';
import { BankAccountsController } from './controllers/bank-accounts.controller';
import { DeliveryChallansController } from './controllers/delivery-challans.controller';
import { BuyerInvoicesController } from './controllers/buyer-invoices.controller';

import { FinanceService } from './services/finance.service';
import { GlService } from './services/gl.service';
import { ChartOfAccountsService } from './services/chart-of-accounts.service';
import { BankAccountsService } from './services/bank-accounts.service';
import { DeliveryChallansService } from './services/delivery-challans.service';
import { BuyerInvoicesService } from './services/buyer-invoices.service';
import { PayrollDisbursedHandler } from './listeners/payroll-disbursed.handler';

/**
 * Finance module — Sprint 7: CoA, GL periods/journals, bank accounts,
 * delivery challans, buyer AR, payroll.disbursed → postJournal.
 *
 * Schema: `fin` — gl_entry_lines partitioned (raw SQL only).
 * Exports FinanceService for cross-module posting.
 */
@Module({
  imports: [
    OrdersModule,
    StorageModule,
    JwtModule.register({
      secret: process.env['JWT_SECRET'] ?? 'dev-secret-do-not-use-in-production',
      signOptions: {
        expiresIn: (process.env['JWT_ACCESS_TTL'] ?? '8h') as unknown as number,
      },
    }),
  ],
  controllers: [
    ChartOfAccountsController,
    GlEntriesController,
    GlReportsController,
    GlPeriodsController,
    BankAccountsController,
    DeliveryChallansController,
    BuyerInvoicesController,
  ],
  providers: [
    FinanceService,
    GlService,
    ChartOfAccountsService,
    BankAccountsService,
    BuyerInvoicesService,
    DeliveryChallansService,
    PayrollDisbursedHandler,
  ],
  exports: [FinanceService, GlService, ChartOfAccountsService],
})
export class FinanceModule {}
