import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';

import { AppConfigModule } from '@shared/config/app-config.module';
import { DatabaseModule } from '@shared/database/database.module';
import { LoggerModule } from '@shared/logger/logger.module';
import { RedisModule } from '@infrastructure/redis';
import { QueueModule } from '@infrastructure/queue';
import { ThrottlerModule } from '@shared/throttler';

// ---------------------------------------------------------------------------
// Business feature modules — imported in dependency order
// ---------------------------------------------------------------------------
import { SystemModule } from '@modules/system/system.module';
import { OrdersModule } from '@modules/orders/orders.module';
import { ProcurementModule } from '@modules/procurement/procurement.module';
import { ManufacturingModule } from '@modules/manufacturing/manufacturing.module';
import { InventoryModule } from '@modules/inventory/inventory.module';
import { FinanceModule } from '@modules/finance/finance.module';
import { HrModule } from '@modules/hr/hr.module';
import { BoardModule } from '@modules/board/board.module';
import { SchedulerModule } from '@infrastructure/scheduler';

/**
 * Root application module.
 *
 * Import order matters:
 * 1. Config — loaded first so all modules can inject ConfigService.
 * 2. Database — PrismaService via PgBouncer (transaction mode, 20 conns).
 * 3. Redis — 3 ioredis clients (DB0=QUEUE, DB1=AUTH, DB2=CACHE); fail-fast.
 * 4. Queue — 5 BullMQ queues + DLQ + Bull Board /admin/queues (dev/staging).
 * 5. Logger — pino HTTP logger middleware (register before business modules).
 * 6. Throttler — Redis-backed sliding-window rate limiter (100 req/min, global guard).
 * 7. EventEmitter — global event bus for cross-module domain events.
 * 8. Business modules — in dependency order (system first as it provides auth/RBAC).
 */
@Module({
  imports: [
    // === Infrastructure / Cross-cutting ===

    // AppConfigModule registers ConfigModule.forRoot() globally with Joi validation
    AppConfigModule,

    // DatabaseModule provides PrismaService globally (PgBouncer transaction mode)
    DatabaseModule,

    // RedisModule provides 3 ioredis clients: REDIS_QUEUE, REDIS_AUTH, REDIS_CACHE
    // Blocks startup if Redis is unreachable (hard fail-fast via onModuleInit timeout)
    RedisModule,

    // QueueModule provides 5 BullMQ queues + DLQ + Bull Board
    QueueModule,

    // Bull Board admin UI — /admin/queues
    BullBoardModule.forRoot({
      route: '/admin/queues',
      adapter: ExpressAdapter,
    }),

    LoggerModule,

    // === Rate Limiting (Redis-backed sliding window) ===
    // ThrottlerModule: 100 req/min per IP, sliding window via Redis sorted sets.
    // Global ThrottlerGuard via APP_GUARD — applies to all routes.
    // Returns 429 with Retry-After header on limit exceeded.
    ThrottlerModule,

    // === Global Event Bus ===
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: true,
    }),

    // === Business Feature Modules ===
    SystemModule,
    OrdersModule,
    ProcurementModule,
    ManufacturingModule,
    InventoryModule,
    FinanceModule,
    HrModule,
    BoardModule,
    SchedulerModule,
  ],
})
export class AppModule {}
