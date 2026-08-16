import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { ManufacturingModule } from '@modules/manufacturing/manufacturing.module';

import { BuyersController } from './controllers/buyers.controller';
import { ArticlesController } from './controllers/articles.controller';
import { OrdersController } from './controllers/orders.controller';
import { QuotationsController } from './controllers/quotations.controller';
import { SamplesController } from './controllers/samples.controller';
import { ComplaintsController } from './controllers/complaints.controller';
import { CapaActionsController } from './controllers/capa-actions.controller';
import { BuyersService } from './services/buyers.service';
import { ArticlesService } from './services/articles.service';
import { OrdersService } from './services/orders.service';
import { DocNumberService } from './services/doc-number.service';
import { QuotationsService } from './services/quotations.service';
import { SamplesService } from './services/samples.service';
import { ComplaintsService } from './services/complaints.service';
import { CapaActionsService } from './services/capa-actions.service';
import { ValidateOrderPipe } from './pipes/validate-order.pipe';
import { NotificationsService } from '@modules/system/services/notifications.service';
import { SSEService } from '@modules/system/services/sse.service';

/**
 * Orders module — Sprint 4: quotations, samples, complaints, CAPA actions.
 *
 * Schema: `ord` (9 tables)
 * Core domain: Order lifecycle + quotations (revised pricing, only one won),
 *   samples (PP/counter/size-set/TOP with approve → sample_approved),
 *   complaints (severity escalation), CAPA actions (auto-close on all done).
 *
 * Sprint 4 additions:
 *   - Quotations: draft → sent → won/lost with won-uniqueness enforcement
 *   - Samples: atomic approveSample (sets order.sample_approved in same tx)
 *   - Complaints: high/critical severity auto-notifies management
 *   - CAPA Actions: auto-close complaint when all CAPAs reach 'done'
 */
@Module({
  imports: [
    JwtModule.register({
      secret: process.env['JWT_SECRET'] ?? 'dev-secret-do-not-use-in-production',
      signOptions: {
        expiresIn: (process.env['JWT_ACCESS_TTL'] ?? '8h') as unknown as number,
      },
    }),
    ManufacturingModule,
  ],
  controllers: [
    BuyersController,
    ArticlesController,
    OrdersController,
    QuotationsController,
    SamplesController,
    ComplaintsController,
    CapaActionsController,
  ],
  providers: [
    BuyersService,
    ArticlesService,
    OrdersService,
    DocNumberService,
    QuotationsService,
    SamplesService,
    ComplaintsService,
    CapaActionsService,
    ValidateOrderPipe,
    NotificationsService,
    SSEService,
  ],
  exports: [OrdersService, DocNumberService],
})
export class OrdersModule {}
