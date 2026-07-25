import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { BuyersController } from './controllers/buyers.controller';
import { ArticlesController } from './controllers/articles.controller';
import { OrdersController } from './controllers/orders.controller';
import { BuyersService } from './services/buyers.service';
import { ArticlesService } from './services/articles.service';
import { OrdersService } from './services/orders.service';

/**
 * Orders module — Sprint 3: buyers, articles, orders, order lines, milestones.
 *
 * Schema: `ord` (5 tables)
 * Core domain: Order lifecycle draft → confirmed → in_production → qc → packed → delivered,
 *   with cancelled as terminal state from draft/confirmed.
 *
 * State machine: defined in order-state-machine.ts — the single source of truth
 * for all status transitions. No controller or service hardcodes transition logic.
 *
 * Events: OrderConfirmedEvent emitted post-commit after draft → confirmed.
 * Future subscribers: Procurement (material requirements), Manufacturing
 * (production order), Finance (proforma invoice).
 *
 * Spring 3 scope:
 *   - Buyers: full CRUD with soft-delete, trigram search, dropdown mode
 *   - Articles: full CRUD with soft-delete, trigram search, category/season filters
 *   - Orders: create with concurrency-safe doc number, state machine, milestones
 */
@Module({
  imports: [
    JwtModule.register({
      secret: process.env['JWT_SECRET'] ?? 'dev-secret-do-not-use-in-production',
      signOptions: {
        expiresIn: (process.env['JWT_ACCESS_TTL'] ?? '8h') as unknown as number,
      },
    }),
  ],
  controllers: [BuyersController, ArticlesController, OrdersController],
  providers: [BuyersService, ArticlesService, OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
