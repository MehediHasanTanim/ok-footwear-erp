import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { OrdersModule } from '@modules/orders/orders.module';
import { RedisModule } from '@infrastructure/redis';

import { WarehousesController } from './controllers/warehouses.controller';
import { StockItemsController } from './controllers/stock-items.controller';
import { StockTransactionsController } from './controllers/stock-transactions.controller';
import { StockCountsController } from './controllers/stock-counts.controller';
import { StockSummaryController } from './controllers/stock-summary.controller';
import { WarehousesService } from './services/warehouses.service';
import { StockItemsService } from './services/stock-items.service';
import { StockTransactionsService } from './services/stock-transactions.service';
import { StockCountsService } from './services/stock-counts.service';
import { StockSummaryService } from './services/stock-summary.service';
import { GrnApprovedHandler } from './listeners/grn-approved.handler';

/**
 * Inventory module — Sprint 6: warehouses, stock items, ledger, counts, summary MV.
 */
@Module({
  imports: [
    OrdersModule,
    RedisModule,
    JwtModule.register({
      secret: process.env['JWT_SECRET'] ?? 'dev-secret-do-not-use-in-production',
      signOptions: {
        expiresIn: (process.env['JWT_ACCESS_TTL'] ?? '8h') as unknown as number,
      },
    }),
  ],
  controllers: [
    WarehousesController,
    StockItemsController,
    StockTransactionsController,
    StockCountsController,
    StockSummaryController,
  ],
  providers: [
    WarehousesService,
    StockItemsService,
    StockTransactionsService,
    StockCountsService,
    StockSummaryService,
    GrnApprovedHandler,
  ],
  exports: [
    WarehousesService,
    StockItemsService,
    StockTransactionsService,
    StockCountsService,
    StockSummaryService,
  ],
})
export class InventoryModule {}
