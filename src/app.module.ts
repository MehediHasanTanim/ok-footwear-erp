import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';

import { AppConfigModule } from '@shared/config/app-config.module';
import { LoggerModule } from '@shared/logger/logger.module';

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

/**
 * Root application module.
 *
 * Import order matters:
 * 1. Config — loaded first so all modules can inject ConfigService.
 * 2. Logger — pino HTTP logger middleware (register before business modules).
 * 3. EventEmitter — global event bus for cross-module domain events.
 * 4. Throttler — rate limiting at the HTTP layer.
 * 5. Business modules — in dependency order (system first as it provides auth/RBAC).
 */
@Module({
  imports: [
    // === Infrastructure / Cross-cutting ===
    // AppConfigModule registers ConfigModule.forRoot() globally with Joi validation
    AppConfigModule,
    LoggerModule,

    // === Global Event Bus ===
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: true,
    }),

    // === Rate Limiting ===
    // DEVIATION: ThrottlerModule is registered here but the guard is not applied
    // globally yet. We'll bind it selectively in Sprint 3 (Auth module) after
    // Redis is configured so we can use RedisStorage instead of in-memory.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),

    // === Business Feature Modules ===
    SystemModule,
    OrdersModule,
    ProcurementModule,
    ManufacturingModule,
    InventoryModule,
    FinanceModule,
    HrModule,
    BoardModule,
  ],
})
export class AppModule {}
