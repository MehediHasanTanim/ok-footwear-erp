# OK Footwear ERP — NestJS Folder Structure & Module Architecture

---

## 1. Root Project Structure

```
ok-footwear-erp/
├── src/
│   ├── main.ts                        ← Bootstrap, Swagger, global pipes/filters
│   ├── app.module.ts                  ← Root module, imports all feature modules
│   │
│   ├── modules/                       ← 8 business feature modules
│   │   ├── orders/
│   │   ├── procurement/
│   │   ├── manufacturing/
│   │   ├── inventory/
│   │   ├── finance/
│   │   ├── hr/
│   │   ├── board/
│   │   └── system/
│   │
│   ├── shared/                        ← Cross-module shared services (DI-injected)
│   │   ├── auth/                      ← JWT, Argon2, TOTP, RBAC
│   │   ├── config/                    ← @nestjs/config namespaced configs
│   │   ├── database/                  ← PrismaService, PrismaModule
│   │   ├── events/                    ← @nestjs/event-emitter typed events
│   │   └── logger/                    ← nestjs-pino, correlation-id middleware
│   │
│   ├── infrastructure/                ← Technical adapters (not business logic)
│   │   ├── queue/                     ← BullMQ queues, job processors
│   │   ├── storage/                   ← S3/MinIO client, file operations
│   │   ├── mailer/                    ← AWS SES email dispatch
│   │   ├── sms/                       ← SSL Wireless SMS dispatch
│   │   └── scheduler/                 ← @nestjs/schedule cron jobs
│   │
│   └── common/                        ← Reusable NestJS building blocks
│       ├── decorators/                ← @CurrentUser, @Roles, @Permissions
│       ├── filters/                   ← HttpExceptionFilter (RFC 7807)
│       ├── guards/                    ← JwtAuthGuard, RbacGuard
│       ├── interceptors/              ← ResponseInterceptor, AuditInterceptor
│       ├── pipes/                     ← ParseUUIDPipe, TrimPipe
│       ├── dto/                       ← PaginationDto, DateRangeDto
│       └── types/                     ← Global TypeScript types and interfaces
│
├── prisma/
│   ├── schema.prisma                  ← Multi-schema Prisma schema
│   └── migrations/                    ← Auto-generated migration files
│
├── test/
│   ├── helpers/                       ← Test utilities, factories, seeds
│   │   ├── app.factory.ts             ← createTestApp() helper
│   │   ├── token.factory.ts           ← getTestToken() helper
│   │   └── seed/                      ← Per-entity seed factories
│   ├── integration/                   ← Supertest integration specs
│   └── e2e/                           ← Playwright E2E specs
│
├── k6/                                ← Performance test scripts
│
├── .env.example
├── .env.local
├── docker-compose.yml
├── Dockerfile
├── jest.config.ts
├── tsconfig.json
└── package.json
```

---

## 2. Internal Structure of Every Module

Every module follows the same internal layout. Using **Orders** as the canonical example:

```
src/modules/orders/
├── orders.module.ts                   ← NestJS module definition
├── index.ts                           ← Public barrel export
│
├── controllers/                       ← HTTP layer — thin, delegates to services
│   ├── orders.controller.ts
│   ├── buyers.controller.ts
│   ├── articles.controller.ts
│   ├── quotations.controller.ts
│   ├── samples.controller.ts
│   └── complaints.controller.ts
│
├── services/                          ← Business logic layer
│   ├── orders.service.ts
│   ├── buyers.service.ts
│   ├── articles.service.ts
│   ├── quotations.service.ts
│   ├── samples.service.ts
│   └── complaints.service.ts
│
├── repositories/                      ← Data access layer (Prisma wrappers)
│   ├── orders.repository.ts
│   └── buyers.repository.ts
│
├── dto/                               ← Request/Response DTOs
│   ├── orders/
│   │   ├── create-order.dto.ts
│   │   ├── update-order.dto.ts
│   │   ├── transition-status.dto.ts
│   │   └── order-response.dto.ts
│   ├── buyers/
│   │   ├── create-buyer.dto.ts
│   │   ├── update-buyer.dto.ts
│   │   └── buyer-response.dto.ts
│   └── quotations/
│       ├── create-quotation.dto.ts
│       └── quotation-response.dto.ts
│
├── events/                            ← Domain events (published by this module)
│   ├── order-confirmed.event.ts
│   └── handlers/                      ← Handlers for events from OTHER modules
│       └── grn-approved.handler.ts
│
├── interfaces/                        ← TypeScript interfaces, enums, constants
│   ├── order-state-machine.interface.ts
│   └── order-status.enum.ts
│
└── __tests__/
    ├── services/
    │   ├── orders.service.spec.ts
    │   └── buyers.service.spec.ts
    └── controllers/
        └── orders.controller.spec.ts
```

---

## 3. All 8 Module Structures

### `src/modules/orders/`
```
orders.module.ts
controllers/  → orders, buyers, articles, quotations, samples, complaints
services/     → orders, buyers, articles, quotations, samples, complaints, capa
repositories/ → orders, buyers
dto/          → orders/, buyers/, articles/, quotations/, samples/, complaints/
events/       → order-confirmed.event.ts | handlers/grn-approved.handler.ts
interfaces/   → order-status.enum.ts, order-state-machine.interface.ts
```

### `src/modules/procurement/`
```
procurement.module.ts
controllers/  → vendors, purchase-orders, goods-receipts, vendor-invoices, tenders
services/     → vendors, purchase-orders, goods-receipts, vendor-invoices, tenders
repositories/ → vendors, purchase-orders, goods-receipts
dto/          → vendors/, purchase-orders/, goods-receipts/, vendor-invoices/
events/       → grn-approved.event.ts | handlers/order-confirmed.handler.ts
interfaces/   → po-status.enum.ts, vendor-status.enum.ts
```

### `src/modules/manufacturing/`
```
manufacturing.module.ts
controllers/  → bom, cost-sheets, production-orders, daily-productions,
                qc-results, machines, lasts-moulds, scrap
services/     → bom, cost-sheets, production-orders, daily-productions,
                qc-results, machines, lasts-moulds, scrap
repositories/ → bom, production-orders
dto/          → bom/, cost-sheets/, production-orders/, qc-results/, machines/
events/       → production-completed.event.ts
interfaces/   → production-status.enum.ts, bom-status.enum.ts
```

### `src/modules/inventory/`
```
inventory.module.ts
controllers/  → stock-items, warehouses, stock-transactions, stock-counts
services/     → stock-items, warehouses, stock-transactions, stock-counts
repositories/ → stock-items, stock-transactions
dto/          → stock-items/, stock-transactions/, stock-counts/
events/       → stock-below-reorder.event.ts | handlers/grn-approved.handler.ts
interfaces/   → transaction-type.enum.ts
```

### `src/modules/finance/`
```
finance.module.ts
controllers/  → gl-entries, gl-periods, chart-of-accounts, bank-accounts,
                fixed-assets, budgets, import-lcs, export-lcs,
                delivery-challans, buyer-invoices
services/     → gl, gl-periods, chart-of-accounts, bank, fixed-assets,
                depreciation, budgets, import-lcs, export-lcs,
                delivery-challans, buyer-invoices
repositories/ → gl-entries, fixed-assets
dto/          → gl/, bank/, fixed-assets/, budgets/, lcs/, challans/
events/       → handlers/ → payroll-disbursed.handler.ts, grn-approved.handler.ts
interfaces/   → entry-type.enum.ts, account-type.enum.ts
```

### `src/modules/hr/`
```
hr.module.ts
controllers/  → employees, employment-events, departments, payroll-runs,
                payroll-entries, leave-types, leave-requests, leave-balances,
                attendance, salary-structures, salary-components,
                employee-salaries, pf-accounts, gratuity, expenses,
                salary-advances
services/     → employees, employment-events, payroll, leave, attendance,
                salary-structures, pf, gratuity, expenses, salary-advances
repositories/ → employees, payroll-runs, leave-requests, attendance
dto/          → employees/, payroll/, leave/, attendance/, salary/,
                expenses/, advances/
events/       → payroll-disbursed.event.ts
interfaces/   → employment-status.enum.ts, leave-status.enum.ts
```

### `src/modules/board/`
```
board.module.ts
controllers/  → directors, shareholders, share-transactions, board-meetings,
                meeting-agenda, meeting-attendees, resolutions, agms,
                dividends, related-parties
services/     → directors, shareholders, share-transactions, board-meetings,
                resolutions, agms, dividends, related-parties
repositories/ → directors, board-meetings, resolutions
dto/          → directors/, shareholders/, meetings/, resolutions/,
                dividends/, agms/
events/       → resolution-signed.event.ts
interfaces/   → meeting-status.enum.ts, resolution-type.enum.ts
```

### `src/modules/system/`
```
system.module.ts
controllers/  → auth, users, roles, permissions, audit-logs,
                notifications, compliance
services/     → auth, users, roles, permissions, audit, notifications,
                compliance, totp
repositories/ → users, audit-logs
dto/          → auth/, users/, roles/, notifications/, compliance/
events/       → (system module listens to all other module events for audit)
interfaces/   → user-status.enum.ts
```

---

## 4. Key File Implementations

### `src/main.ts`

```typescript
import { NestFactory }        from '@nestjs/core';
import { ValidationPipe }     from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger }             from 'nestjs-pino';
import { AppModule }          from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Structured logging via Pino
  app.useLogger(app.get(Logger));

  // Global validation pipe — strips unknown fields, validates all DTOs
  app.useGlobalPipes(new ValidationPipe({
    whitelist:            true,   // strip unknown properties
    forbidNonWhitelisted: false,  // don't throw on unknown (strip silently)
    transform:            true,   // auto-transform to DTO types
    transformOptions: { enableImplicitConversion: true },
  }));

  // API prefix
  app.setGlobalPrefix('api');

  // CORS — only allow configured origins
  app.enableCors({
    origin:      process.env.ALLOWED_ORIGINS?.split(',') ?? [],
    credentials: true,
  });

  // OpenAPI / Swagger
  const config = new DocumentBuilder()
    .setTitle('OK Footwear ERP API')
    .setDescription('REST API for OK Footwear ERP system')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
```

---

### `src/app.module.ts`

```typescript
import { Module }         from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule }     from '@nestjs/schedule';
import { BullModule }         from '@nestjs/bull';
import { LoggerModule }       from 'nestjs-pino';

// Shared infrastructure
import { DatabaseModule }   from './shared/database/database.module';
import { AuthSharedModule } from './shared/auth/auth-shared.module';
import { ConfigModule }     from './shared/config/config.module';

// Infrastructure adapters
import { QueueModule }     from './infrastructure/queue/queue.module';
import { StorageModule }   from './infrastructure/storage/storage.module';
import { MailerModule }    from './infrastructure/mailer/mailer.module';
import { SmsModule }       from './infrastructure/sms/sms.module';
import { SchedulerModule } from './infrastructure/scheduler/scheduler.module';

// Business modules
import { SystemModule }        from './modules/system/system.module';
import { OrdersModule }        from './modules/orders/orders.module';
import { ProcurementModule }   from './modules/procurement/procurement.module';
import { ManufacturingModule } from './modules/manufacturing/manufacturing.module';
import { InventoryModule }     from './modules/inventory/inventory.module';
import { FinanceModule }       from './modules/finance/finance.module';
import { HrModule }            from './modules/hr/hr.module';
import { BoardModule }         from './modules/board/board.module';

@Module({
  imports: [
    // Config must be first
    ConfigModule,

    // Logging
    LoggerModule.forRoot({ pinoHttp: { level: process.env.LOG_LEVEL ?? 'info' } }),

    // Database
    DatabaseModule,

    // In-process event bus
    EventEmitterModule.forRoot({ wildcard: false, delimiter: '.', maxListeners: 20 }),

    // Cron scheduler
    ScheduleModule.forRoot(),

    // BullMQ — configured via QueueModule
    QueueModule,

    // Shared auth (AuthService, JwtModule, PassportModule)
    AuthSharedModule,

    // External adapters
    StorageModule,
    MailerModule,
    SmsModule,
    SchedulerModule,

    // Business modules (order matters: system first as it provides auth guards)
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
```

---

### `src/modules/orders/orders.module.ts`

```typescript
import { Module }       from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/database.module';

// Controllers
import { OrdersController }     from './controllers/orders.controller';
import { BuyersController }     from './controllers/buyers.controller';
import { ArticlesController }   from './controllers/articles.controller';
import { QuotationsController } from './controllers/quotations.controller';
import { SamplesController }    from './controllers/samples.controller';
import { ComplaintsController } from './controllers/complaints.controller';

// Services
import { OrdersService }     from './services/orders.service';
import { BuyersService }     from './services/buyers.service';
import { ArticlesService }   from './services/articles.service';
import { QuotationsService } from './services/quotations.service';
import { SamplesService }    from './services/samples.service';
import { ComplaintsService } from './services/complaints.service';

// Repositories
import { OrdersRepository } from './repositories/orders.repository';
import { BuyersRepository } from './repositories/buyers.repository';

// Event handlers (events FROM other modules that orders cares about)
import { GrnApprovedHandler } from './events/handlers/grn-approved.handler';

@Module({
  imports: [DatabaseModule],
  controllers: [
    OrdersController,
    BuyersController,
    ArticlesController,
    QuotationsController,
    SamplesController,
    ComplaintsController,
  ],
  providers: [
    // Services
    OrdersService,
    BuyersService,
    ArticlesService,
    QuotationsService,
    SamplesService,
    ComplaintsService,
    // Repositories
    OrdersRepository,
    BuyersRepository,
    // Event handlers
    GrnApprovedHandler,
  ],
  exports: [
    // Only export what OTHER modules need to call
    OrdersService,
    ArticlesService,
  ],
})
export class OrdersModule {}
```

---

### `src/modules/orders/controllers/orders.controller.ts`

```typescript
import {
  Controller, Get, Post, Patch, Delete, Param, Body,
  Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

import { JwtAuthGuard }    from '../../../common/guards/jwt-auth.guard';
import { RbacGuard }       from '../../../common/guards/rbac.guard';
import { Permissions }     from '../../../common/decorators/permissions.decorator';
import { CurrentUser }     from '../../../common/decorators/current-user.decorator';
import { ParseUUIDPipe }   from '../../../common/pipes/parse-uuid.pipe';
import { PaginationDto }   from '../../../common/dto/pagination.dto';
import { AuthUser }        from '../../../common/types/auth-user.type';

import { OrdersService }        from '../services/orders.service';
import { CreateOrderDto }       from '../dto/orders/create-order.dto';
import { UpdateOrderDto }       from '../dto/orders/update-order.dto';
import { TransitionStatusDto }  from '../dto/orders/transition-status.dto';

@ApiTags('Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @Permissions('orders', 'read')
  @ApiOperation({ summary: 'List all orders with pagination and filters' })
  findAll(@Query() pagination: PaginationDto, @CurrentUser() user: AuthUser) {
    return this.ordersService.findAll(pagination, user);
  }

  @Get(':id')
  @Permissions('orders', 'read')
  @ApiOperation({ summary: 'Get order detail by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.findOne(id);
  }

  @Post()
  @Permissions('orders', 'create')
  @ApiOperation({ summary: 'Create a new draft order' })
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: AuthUser) {
    return this.ordersService.create(dto, user.id);
  }

  @Patch(':id')
  @Permissions('orders', 'update')
  @ApiOperation({ summary: 'Update order details (draft only)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ordersService.update(id, dto, user.id);
  }

  @Patch(':id/status')
  @Permissions('orders', 'update')
  @ApiOperation({ summary: 'Transition order to next status' })
  transitionStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ordersService.transitionStatus(id, dto.status, user.id);
  }

  @Delete(':id')
  @Permissions('orders', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel an order (draft only)' })
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.ordersService.cancel(id, user.id);
  }
}
```

---

### `src/modules/orders/services/orders.service.ts`

```typescript
import {
  Injectable, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { OrdersRepository }    from '../repositories/orders.repository';
import { CreateOrderDto }      from '../dto/orders/create-order.dto';
import { UpdateOrderDto }      from '../dto/orders/update-order.dto';
import { OrderStatus }         from '../interfaces/order-status.enum';
import { OrderConfirmedEvent } from '../events/order-confirmed.event';
import { PaginationDto }       from '../../../common/dto/pagination.dto';
import { AuthUser }            from '../../../common/types/auth-user.type';

// Valid status transitions — each key can move to its listed values
const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft:         ['confirmed', 'cancelled'],
  confirmed:     ['in_production', 'cancelled'],
  in_production: ['qc'],
  qc:            ['packed'],
  packed:        ['delivered'],
  delivered:     [],
  cancelled:     [],
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly ordersRepo: OrdersRepository,
    private readonly events:     EventEmitter2,
  ) {}

  async findAll(pagination: PaginationDto, user: AuthUser) {
    return this.ordersRepo.findMany({
      page:  pagination.page,
      limit: pagination.limit,
    });
  }

  async findOne(id: string) {
    const order = await this.ordersRepo.findById(id);
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    return order;
  }

  async create(dto: CreateOrderDto, userId: string) {
    // Validate line quantities sum to totalQuantity
    const lineSum = dto.orderLines.reduce((sum, l) => sum + l.quantity, 0);
    if (lineSum !== dto.totalQuantity) {
      throw new UnprocessableEntityException(
        'Sum of order line quantities must equal totalQuantity',
        'orderLines',
      );
    }
    return this.ordersRepo.create({ ...dto, createdBy: userId });
  }

  async update(id: string, dto: UpdateOrderDto, userId: string) {
    const order = await this.findOne(id);
    if (order.status !== OrderStatus.DRAFT) {
      throw new UnprocessableEntityException('Only draft orders can be updated');
    }
    return this.ordersRepo.update(id, { ...dto, updatedBy: userId });
  }

  async transitionStatus(id: string, nextStatus: OrderStatus, userId: string) {
    const order = await this.findOne(id);
    const allowed = STATUS_TRANSITIONS[order.status as OrderStatus];

    if (!allowed.includes(nextStatus)) {
      throw new UnprocessableEntityException(
        `Invalid status transition: ${order.status} → ${nextStatus}`,
      );
    }

    // Business rule: sample must be approved before entering production
    if (nextStatus === OrderStatus.IN_PRODUCTION && !order.sampleApproved) {
      throw new UnprocessableEntityException(
        'Sample must be approved before production can begin',
      );
    }

    const updated = await this.ordersRepo.update(id, { status: nextStatus, updatedBy: userId });

    // Fire domain event after successful persistence
    if (nextStatus === OrderStatus.CONFIRMED) {
      this.events.emit('order.confirmed', new OrderConfirmedEvent({
        orderId:      id,
        deliveryDate: order.deliveryDate,
        buyerId:      order.buyerId,
        confirmedBy:  userId,
      }));
    }

    return updated;
  }

  async cancel(id: string, userId: string) {
    return this.transitionStatus(id, OrderStatus.CANCELLED, userId);
  }
}
```

---

### `src/modules/orders/repositories/orders.repository.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { CreateOrderDto } from '../dto/orders/create-order.dto';

@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.ord_orders.findUnique({
      where: { id },
      include: {
        buyer:      { select: { id: true, name: true, currency: true } },
        article:    { select: { id: true, articleCode: true, description: true } },
        orderLines: true,
        milestones: { orderBy: { plannedDate: 'asc' } },
      },
    });
  }

  async findMany({ page, limit }: { page: number; limit: number }) {
    const skip = (page - 1) * limit;
    const [data, totalCount] = await this.prisma.$transaction([
      this.prisma.ord_orders.findMany({
        skip, take: limit,
        where:   { deletedAt: null },
        include: { buyer: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.ord_orders.count({ where: { deletedAt: null } }),
    ]);
    return { data, meta: { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit) } };
  }

  async create(data: CreateOrderDto & { createdBy: string }) {
    return this.prisma.ord_orders.create({
      data: {
        buyerId:       data.buyerId,
        articleId:     data.articleId,
        unitPrice:     data.unitPrice,
        totalQuantity: data.totalQuantity,
        deliveryDate:  new Date(data.deliveryDate),
        currency:      data.currency,
        orderType:     data.orderType,
        createdBy:     data.createdBy,
        orderLines: {
          createMany: { data: data.orderLines.map(l => ({ sizeLabel: l.sizeLabel, quantity: l.quantity })) },
        },
      },
      include: { orderLines: true },
    });
  }

  async update(id: string, data: Partial<any> & { updatedBy: string }) {
    return this.prisma.ord_orders.update({ where: { id }, data });
  }
}
```

---

### `src/modules/orders/dto/orders/create-order.dto.ts`

```typescript
import {
  IsUUID, IsPositive, IsDateString, IsEnum,
  IsISO4217CurrencyCode, ValidateNested, ArrayMinSize, IsInt, IsString,
} from 'class-validator';
import { Type }       from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class OrderLineDto {
  @ApiProperty({ example: '38' })
  @IsString()
  sizeLabel: string;

  @ApiProperty({ example: 100 })
  @IsInt()
  @IsPositive()
  quantity: number;
}

export class CreateOrderDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  buyerId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  articleId: string;

  @ApiProperty({ example: 'bulk', enum: ['bulk', 'sample', 'repeat', 'trial'] })
  @IsEnum(['bulk', 'sample', 'repeat', 'trial'])
  orderType: string;

  @ApiProperty({ example: 12.50 })
  @IsPositive()
  unitPrice: number;

  @ApiProperty({ example: 500 })
  @IsInt()
  @IsPositive()
  totalQuantity: number;

  @ApiProperty({ example: '2026-09-01' })
  @IsDateString()
  deliveryDate: string;

  @ApiProperty({ example: 'USD' })
  @IsISO4217CurrencyCode()
  currency: string;

  @ApiProperty({ type: [OrderLineDto] })
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  @ArrayMinSize(1, { message: 'At least one size line is required' })
  orderLines: OrderLineDto[];
}
```

---

### `src/modules/orders/dto/orders/order-response.dto.ts`

```typescript
import { Exclude, Expose, Type } from 'class-transformer';
import { ApiProperty }           from '@nestjs/swagger';

@Exclude()
export class OrderResponseDto {
  @Expose() @ApiProperty() id:            string;
  @Expose() @ApiProperty() orderNumber:   string;
  @Expose() @ApiProperty() status:        string;
  @Expose() @ApiProperty() unitPrice:     number;
  @Expose() @ApiProperty() totalQuantity: number;
  @Expose() @ApiProperty() deliveryDate:  Date;
  @Expose() @ApiProperty() currency:      string;
  @Expose() @ApiProperty() sampleApproved: boolean;
  @Expose() @ApiProperty() createdAt:     Date;

  @Expose()
  @Type(() => BuyerEmbedDto)
  buyer: BuyerEmbedDto;

  @Expose()
  @Type(() => OrderLineEmbedDto)
  orderLines: OrderLineEmbedDto[];
}
```

---

### `src/modules/orders/events/order-confirmed.event.ts`

```typescript
export class OrderConfirmedEvent {
  readonly orderId:      string;
  readonly deliveryDate: Date;
  readonly buyerId:      string;
  readonly confirmedBy:  string;
  readonly occurredAt:   Date;

  constructor(params: Omit<OrderConfirmedEvent, 'occurredAt'>) {
    Object.assign(this, params);
    this.occurredAt = new Date();
  }
}
```

---

### `src/modules/orders/events/handlers/grn-approved.handler.ts`

```typescript
import { Injectable }     from '@nestjs/common';
import { OnEvent }        from '@nestjs/event-emitter';
import { GrnApprovedEvent } from '../../../procurement/events/grn-approved.event';

@Injectable()
export class GrnApprovedHandler {
  @OnEvent('grn.approved', { async: false })
  async handle(event: GrnApprovedEvent): Promise<void> {
    // When a GRN is approved, update the linked order's material readiness flag
    // This is an example of in-process cross-module side effect
  }
}
```

---

## 5. Shared Module — `src/shared/`

### `src/shared/database/prisma.service.ts`

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@InjectPinoLogger(PrismaService.name) private readonly logger: PinoLogger) {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
      ],
    });
  }

  async onModuleInit() {
    this.$on('error', (e: any) => this.logger.error({ err: e }, 'Prisma error'));
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

---

### `src/shared/auth/auth.service.ts`

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService }     from '@nestjs/jwt';
import { ConfigService }  from '@nestjs/config';
import * as argon2        from 'argon2';
import { authenticator }  from 'otplib';
import { Redis }          from 'ioredis';
import { InjectRedis }    from '@nestjs-modules/ioredis';
import { PrismaService }  from '../database/prisma.service';
import { AuthConfig }     from '../config/auth.config';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma:        PrismaService,
    private readonly jwt:           JwtService,
    private readonly config:        ConfigService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.sys_users.findUnique({ where: { email: email.toLowerCase() } });

    if (!user || user.deletedAt) throw new UnauthorizedException('Invalid credentials');

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException(`Account locked until ${user.lockedUntil.toISOString()}`);
    }

    const passwordValid = await argon2.verify(user.passwordHash, password);

    if (!passwordValid) {
      await this.incrementFailedAttempts(user.id, user.failedAttempts);
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.resetFailedAttempts(user.id);
    return this.generateTokens(user.id, user.email);
  }

  async generateTokens(userId: string, email: string) {
    const authConfig = this.config.get<AuthConfig>('auth');
    const accessToken = this.jwt.sign(
      { sub: userId, email },
      { expiresIn: authConfig!.accessTokenTtl },
    );
    return { accessToken };
  }

  async getPermissions(userId: string): Promise<string[]> {
    const cacheKey = `permissions:${userId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const permissions = await this.prisma.sys_user_roles.findMany({
      where: { userId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });

    const permissionList = permissions.flatMap(ur =>
      ur.role.permissions.map(rp => `${rp.permission.module}:${rp.permission.action}`)
    );

    await this.redis.setex(cacheKey, 300, JSON.stringify(permissionList));
    return permissionList;
  }

  private async incrementFailedAttempts(userId: string, current: number) {
    const newCount = current + 1;
    const data: any = { failedAttempts: newCount };
    if (newCount >= 5) {
      data.lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 min
    }
    await this.prisma.sys_users.update({ where: { id: userId }, data });
  }

  private async resetFailedAttempts(userId: string) {
    await this.prisma.sys_users.update({
      where: { id: userId },
      data: { failedAttempts: 0, lastLoginAt: new Date(), lockedUntil: null },
    });
  }
}
```

---

## 6. Common — Guards, Interceptors, Filters

### `src/common/guards/jwt-auth.guard.ts`

```typescript
import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Skip auth for routes decorated with @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
```

---

### `src/common/guards/rbac.guard.ts`

```typescript
import {
  Injectable, CanActivate, ExecutionContext, ForbiddenException,
} from '@nestjs/common';
import { Reflector }   from '@nestjs/core';
import { AuthService } from '../../shared/auth/auth.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth:      AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<[string, string]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true; // no permission required

    const [module, action] = required;
    const { user } = context.switchToHttp().getRequest();

    const permissions = await this.auth.getPermissions(user.id);

    if (!permissions.includes(`${module}:${action}`)) {
      throw new ForbiddenException(`Permission denied: ${module}:${action}`);
    }
    return true;
  }
}
```

---

### `src/common/interceptors/response.interceptor.ts`

```typescript
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map }        from 'rxjs/operators';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, { data: T; timestamp: string }> {
  intercept(_: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map(data => ({
        data,
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
```

---

### `src/common/filters/http-exception.filter.ts`

```typescript
import {
  ExceptionFilter, Catch, ArgumentsHost,
  HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx    = host.switchToHttp();
    const req    = ctx.getRequest<Request>();
    const res    = ctx.getResponse<Response>();
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const correlationId = req.headers['x-correlation-id'] as string;

    const body = {
      type:           `/errors/${this.getErrorType(status)}`,
      title:          this.getTitle(status),
      status,
      detail:         this.getDetail(exception),
      instance:       req.path,
      correlationId,
      timestamp:      new Date().toISOString(),
      ...(status === 422 ? { errors: this.getValidationErrors(exception) } : {}),
    };

    if (status >= 500) {
      this.logger.error({ err: exception, correlationId, path: req.path }, 'Unhandled error');
    }

    res.status(status).json(body);
  }

  private getErrorType(status: number): string {
    const map: Record<number, string> = {
      400: 'bad-request', 401: 'unauthorized', 403: 'forbidden',
      404: 'not-found', 409: 'conflict', 422: 'validation', 429: 'too-many-requests',
    };
    return map[status] ?? 'internal-server-error';
  }

  private getTitle(status: number): string {
    const map: Record<number, string> = {
      400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
      404: 'Not Found', 409: 'Conflict', 422: 'Validation Failed',
      429: 'Too Many Requests', 500: 'Internal Server Error',
    };
    return map[status] ?? 'Error';
  }

  private getDetail(exception: unknown): string {
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      return typeof res === 'string' ? res : (res as any).message ?? 'An error occurred';
    }
    return 'An unexpected error occurred';
  }

  private getValidationErrors(exception: unknown): { field: string; message: string }[] {
    if (exception instanceof HttpException) {
      const res = exception.getResponse() as any;
      if (Array.isArray(res.message)) {
        return res.message.map((m: any) => ({ field: m.property, message: Object.values(m.constraints ?? {}).join(', ') }));
      }
    }
    return [];
  }
}
```

---

### `src/common/decorators/permissions.decorator.ts`

```typescript
import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

export const Permissions = (module: string, action: string) =>
  SetMetadata(PERMISSIONS_KEY, [module, action]);
```

---

### `src/common/decorators/current-user.decorator.ts`

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from '../types/auth-user.type';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest().user,
);
```

---

## 7. Infrastructure — Queue, Storage, Scheduler

### `src/infrastructure/queue/queue.module.ts`

```typescript
import { Module }         from '@nestjs/common';
import { BullModule }     from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { PayrollProcessor  } from './processors/payroll.processor';
import { PdfProcessor      } from './processors/pdf.processor';
import { EmailProcessor    } from './processors/email.processor';
import { SmsProcessor      } from './processors/sms.processor';
import { ReportProcessor   } from './processors/report.processor';

const QUEUES = ['payroll', 'pdf', 'email', 'sms', 'report'];

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject:  [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: { host: config.get('REDIS_HOST'), port: config.get('REDIS_PORT') },
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail:     50,
          attempts:         3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      }),
    }),
    ...QUEUES.map(name => BullModule.registerQueue({ name })),
  ],
  providers: [PayrollProcessor, PdfProcessor, EmailProcessor, SmsProcessor, ReportProcessor],
  exports:   QUEUES.map(name => BullModule.registerQueue({ name })),
})
export class QueueModule {}
```

---

### `src/infrastructure/queue/processors/payroll.processor.ts`

```typescript
import { Process, Processor, OnQueueFailed } from '@nestjs/bull';
import { Job }          from 'bull';
import { Injectable }   from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { HrModule }     from '../../../modules/hr/hr.module';
import { PayrollService } from '../../../modules/hr/services/payroll.service';

export interface PayrollJobData {
  payrollRunId: string;
  month:        number;
  year:         number;
  triggeredBy:  string;
}

@Processor('payroll')
@Injectable()
export class PayrollProcessor {
  constructor(
    private readonly payrollService: PayrollService,
    @InjectPinoLogger(PayrollProcessor.name) private readonly logger: PinoLogger,
  ) {}

  @Process({ name: 'compute', concurrency: 1 }) // never run two payrolls simultaneously
  async processPayroll(job: Job<PayrollJobData>) {
    this.logger.info({ jobId: job.id, runId: job.data.payrollRunId }, 'Starting payroll computation');
    await job.progress(0);
    await this.payrollService.compute(job.data.payrollRunId, (pct) => job.progress(pct));
    this.logger.info({ jobId: job.id }, 'Payroll computation complete');
  }

  @OnQueueFailed()
  async onFailed(job: Job, err: Error) {
    this.logger.error({ jobId: job.id, err }, 'Payroll job failed');
    await this.payrollService.markFailed(job.data.payrollRunId, err.message);
  }
}
```

---

### `src/infrastructure/scheduler/scheduler.module.ts`

```typescript
import { Module }          from '@nestjs/common';
import { DailyScheduler }  from './jobs/daily.scheduler';
import { MonthlyScheduler } from './jobs/monthly.scheduler';

@Module({
  providers: [DailyScheduler, MonthlyScheduler],
})
export class SchedulerModule {}
```

---

### `src/infrastructure/scheduler/jobs/daily.scheduler.ts`

```typescript
import { Injectable }       from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PrismaService }    from '../../../shared/database/prisma.service';
import { InjectRedis }      from '@nestjs-modules/ioredis';
import { Redis }            from 'ioredis';

@Injectable()
export class DailyScheduler {
  constructor(
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
    @InjectPinoLogger(DailyScheduler.name) private readonly logger: PinoLogger,
  ) {}

  // Runs at 02:00 Bangladesh time (UTC+6 = 20:00 UTC previous day)
  @Cron('0 20 * * *', { timeZone: 'UTC' })
  async runDailyJobs() {
    const lockKey = 'lock:daily-scheduler';
    const acquired = await this.redis.set(lockKey, '1', 'NX', 'EX', 3600);
    if (!acquired) { this.logger.warn('Daily scheduler already running on another pod'); return; }

    try {
      await this.refreshStockSummary();
      await this.lockDailyProductions();
      await this.runComplianceExpiryCheck();
    } finally {
      await this.redis.del(lockKey);
    }
  }

  private async refreshStockSummary() {
    this.logger.info('Refreshing inv.stock_summary');
    await this.prisma.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY inv.stock_summary`;
  }

  private async lockDailyProductions() {
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    await this.prisma.mfg_daily_productions.updateMany({
      where: { prodDate: { lte: yesterday }, locked: false },
      data:  { locked: true },
    });
  }

  private async runComplianceExpiryCheck() {
    const alertDate = new Date(); alertDate.setDate(alertDate.getDate() + 30);
    const expiring = await this.prisma.sys_compliance_items.findMany({
      where: { expiryDate: { lte: alertDate }, status: 'valid' },
    });
    this.logger.info({ count: expiring.length }, 'Compliance items expiring soon');
    // Notify responsible users...
  }
}
```

---

## 8. Module Dependency Rules

```
┌─────────────────────────────────────────────────────────────┐
│  DEPENDENCY RULES  (what can import what)                   │
│                                                             │
│  Business modules CAN import:                               │
│    ✓ shared/database   (PrismaService)                      │
│    ✓ shared/auth       (AuthService — for permission checks)│
│    ✓ shared/config     (ConfigService)                      │
│    ✓ shared/logger     (PinoLogger)                         │
│    ✓ infrastructure/*  (QueueModule, StorageModule)         │
│    ✓ common/*          (decorators, guards, pipes)          │
│                                                             │
│  Business modules MUST NOT import:                          │
│    ✗ Other business modules directly                        │
│      (use EventEmitter for cross-module side effects)       │
│    ✗ Infrastructure adapters directly from controllers      │
│      (queue jobs dispatched from services only)             │
│                                                             │
│  Cross-module communication patterns:                       │
│    EventEmitter  → fire-and-forget side effects             │
│    Module.exports → when module B needs module A's service  │
│    (only use sparingly — prefer events where possible)      │
└─────────────────────────────────────────────────────────────┘
```

---

## 9. Naming Conventions

| Element | Convention | Example |
|---|---|---|
| File names | kebab-case | `orders.service.ts`, `create-order.dto.ts` |
| Class names | PascalCase | `OrdersService`, `CreateOrderDto` |
| Interface names | PascalCase with I prefix | `IOrderRepository` |
| Enum names | PascalCase | `OrderStatus` |
| Enum values | UPPER_SNAKE | `OrderStatus.IN_PRODUCTION` |
| Constants | UPPER_SNAKE | `MAX_BULK_QUANTITY` |
| Module files | `<name>.module.ts` | `orders.module.ts` |
| Controller files | `<name>.controller.ts` | `orders.controller.ts` |
| Service files | `<name>.service.ts` | `orders.service.ts` |
| Repository files | `<name>.repository.ts` | `orders.repository.ts` |
| DTO files | `<action>-<entity>.dto.ts` | `create-order.dto.ts` |
| Event files | `<entity>-<action>.event.ts` | `order-confirmed.event.ts` |
| Handler files | `<event-name>.handler.ts` | `grn-approved.handler.ts` |
| Guard files | `<name>.guard.ts` | `rbac.guard.ts` |
| Test files | `<name>.spec.ts` | `orders.service.spec.ts` |
| Decorator files | `<name>.decorator.ts` | `current-user.decorator.ts` |

---

## 10. Environment Configuration

### `src/shared/config/database.config.ts`
```typescript
import { registerAs }  from '@nestjs/config';
import * as Joi        from 'joi';

export interface DatabaseConfig {
  url:      string;
  poolSize: number;
}

export default registerAs('database', (): DatabaseConfig => ({
  url:      process.env.DATABASE_URL!,
  poolSize: Number(process.env.DB_POOL_SIZE ?? 20),
}));

export const databaseConfigSchema = {
  DATABASE_URL:   Joi.string().uri().required(),
  DB_POOL_SIZE:   Joi.number().default(20),
};
```

### `.env.example`
```bash
# Application
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug
ALLOWED_ORIGINS=http://localhost:5173

# Database
DATABASE_URL=postgresql://erp:password@localhost:5432/erp_dev

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=change-me-in-production-min-32-chars
JWT_ACCESS_TTL=28800        # 8 hours in seconds
JWT_REFRESH_TTL=2592000     # 30 days in seconds

# Encryption (AES-256-GCM for NID, passport, bank account)
AES_KEY=32-byte-hex-key-change-in-production

# AWS
AWS_REGION=ap-southeast-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_DOCUMENTS_BUCKET=erp-documents
S3_EXPORTS_BUCKET=erp-exports
S3_RECEIPTS_BUCKET=erp-receipts
AWS_SES_FROM_EMAIL=noreply@okfootwear.com

# SMS (SSL Wireless)
SSL_WIRELESS_API_KEY=
SSL_WIRELESS_SENDER_ID=OKFOOTWEAR

# Sentry
SENTRY_DSN=
```

---

*OK Footwear ERP — NestJS Module Architecture | Version 1.0 | May 2025*
