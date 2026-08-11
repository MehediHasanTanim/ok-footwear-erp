import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { BullModule } from '@nestjs/bullmq';

import { OrdersModule } from '@modules/orders/orders.module';
import { EMAIL_QUEUE } from '@infrastructure/queue/queue.constants';
import { StorageModule } from '@infrastructure/storage/storage.module';

import { VendorsController } from './controllers/vendors.controller';
import { PurchaseOrdersController } from './controllers/purchase-orders.controller';
import { GoodsReceiptsController } from './controllers/goods-receipts.controller';
import { VendorInvoicesController } from './controllers/vendor-invoices.controller';
import { VendorsService } from './services/vendors.service';
import { PurchaseOrdersService } from './services/purchase-orders.service';
import { GoodsReceiptsService } from './services/goods-receipts.service';
import { VendorInvoicesService } from './services/vendor-invoices.service';

/**
 * Procurement module — Sprint 5: vendors, POs, GRN, vendor invoices.
 */
@Module({
  imports: [
    OrdersModule,
    StorageModule,
    BullModule.registerQueue({ name: EMAIL_QUEUE }),
    JwtModule.register({
      secret: process.env['JWT_SECRET'] ?? 'dev-secret-do-not-use-in-production',
      signOptions: {
        expiresIn: (process.env['JWT_ACCESS_TTL'] ?? '8h') as unknown as number,
      },
    }),
  ],
  controllers: [
    VendorsController,
    PurchaseOrdersController,
    GoodsReceiptsController,
    VendorInvoicesController,
  ],
  providers: [
    VendorsService,
    PurchaseOrdersService,
    GoodsReceiptsService,
    VendorInvoicesService,
  ],
  exports: [VendorsService, PurchaseOrdersService, GoodsReceiptsService, VendorInvoicesService],
})
export class ProcurementModule {}
