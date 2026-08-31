import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { prisma } from '@test/helpers/integration-test-setup';
import {
  deployDailyProductionsPartition,
  seedMfgMasterData,
} from '../helpers/deploy-daily-productions';
import { PrismaService } from '@shared/database/prisma.service';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RbacGuard } from '@common/guards/rbac.guard';
import { HttpExceptionFilter } from '@common/filters/http-exception.filter';
import { BomService } from '@modules/manufacturing/services/bom.service';
import { ProductionOrdersService } from '@modules/manufacturing/services/production-orders.service';
import { DailyProductionService } from '@modules/manufacturing/services/daily-production.service';
import { QcResultsService } from '@modules/manufacturing/services/qc-results.service';
import { ProductionOrdersController } from '@modules/manufacturing/controllers/production-orders.controller';
import { DailyProductionController } from '@modules/manufacturing/controllers/daily-production.controller';
import { QcResultsController } from '@modules/manufacturing/controllers/qc-results.controller';
import { ProductionBlockGuard } from '@modules/manufacturing/guards/production-block.guard';
import { OrdersService } from '@modules/orders/services/orders.service';
import { DocNumberService } from '@modules/orders/services/doc-number.service';
import { ProductionCompletedHandler } from '@modules/orders/listeners/production-completed.handler';
import { EventEmitter2 } from '@nestjs/event-emitter';

const USER_ID = 'c9333333-3333-4333-8333-333333333333';
const ARTICLE_ID = 'a9333333-3333-4333-8333-333333333333';
const BUYER_ID = 'b9333333-3333-4333-8333-333333333333';
const ORDER_ID = '09333333-3333-4333-8333-333333333333';

const allowGuard: CanActivate = {
  canActivate: (_context: ExecutionContext) => true,
};

async function deployProductionSchema(): Promise<void> {
  await seedMfgMasterData();
  await deployDailyProductionsPartition();
}

async function seedProductionFlow(): Promise<{
  bomId: string;
  factoryLineId: string;
  operationId: string;
}> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO sys.users (id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
     VALUES ($1::uuid, 'mfg-prod-i@okfootwear.com', 'x', 'M', 'Prod', true, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    USER_ID,
  );

  await prisma.article.upsert({
    where: { id: ARTICLE_ID },
    create: { id: ARTICLE_ID, code: 'ART-PROD-I', description: 'Production HTTP article' },
    update: {},
  });

  await prisma.buyer.upsert({
    where: { id: BUYER_ID },
    create: {
      id: BUYER_ID,
      name: 'Prod Buyer',
      currency: 'USD',
      paymentTerms: 'TT_ADVANCE',
    },
    update: {},
  });

  await prisma.order.upsert({
    where: { id: ORDER_ID },
    create: {
      id: ORDER_ID,
      orderNumber: `P${Date.now().toString().slice(-8)}`,
      buyerId: BUYER_ID,
      articleId: ARTICLE_ID,
      status: 'in_production',
      sampleApproved: true,
      totalQuantity: 200,
      deliveryDate: new Date('2026-12-31'),
      currency: 'USD',
    },
    update: { status: 'in_production', sampleApproved: true },
  });

  await prisma.orderLine.deleteMany({ where: { orderId: ORDER_ID } });
  await prisma.orderLine.createMany({
    data: [
      { orderId: ORDER_ID, sizeLabel: 'UK8', quantity: 120, unitPrice: 10 },
      { orderId: ORDER_ID, sizeLabel: 'UK9', quantity: 80, unitPrice: 10 },
    ],
  });

  const bom = await prisma.bomHeader.create({
    data: {
      articleId: ARTICLE_ID,
      version: `prod-i-${Date.now()}`,
      status: 'approved',
      createdBy: USER_ID,
    },
  });

  const lineRows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM mfg.factory_lines WHERE code = 'LINE-A' LIMIT 1
  `;
  const opRows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM mfg.operations WHERE code = 'CUT' LIMIT 1
  `;

  return {
    bomId: bom.id,
    factoryLineId: lineRows[0]!.id,
    operationId: opRows[0]!.id,
  };
}

describe('Manufacturing HTTP production flow (Sprint 10–11)', () => {
  let app: INestApplication;
  let http: request.SuperTest<request.Test>;
  let eventEmitter: EventEmitter2;

  beforeAll(async () => {
    await deployProductionSchema();

    const prismaSvc = prisma as unknown as PrismaService;
    const module: TestingModule = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      controllers: [ProductionOrdersController, DailyProductionController, QcResultsController],
      providers: [
        BomService,
        ProductionOrdersService,
        DailyProductionService,
        QcResultsService,
        ProductionBlockGuard,
        OrdersService,
        DocNumberService,
        ProductionCompletedHandler,
        { provide: PrismaService, useValue: prismaSvc },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(allowGuard)
      .overrideGuard(RbacGuard)
      .useValue(allowGuard)
      .compile();

    app = module.createNestApplication();
    eventEmitter = module.get(EventEmitter2);
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user?: unknown }).user = {
        sub: USER_ID,
        email: 'mfg-prod-i@okfootwear.com',
        permissions: [
          'manufacturing:read',
          'manufacturing:create',
          'manufacturing:update',
          'manufacturing:approve',
        ],
      };
      next();
    });
    await app.init();
    http = request(app.getHttpServer());
  }, 180_000);

  afterAll(async () => {
    await app?.close();
  });

  it('create PO → daily entry → final QC pass → order status qc', async () => {
    const { bomId, factoryLineId, operationId } = await seedProductionFlow();

    const created = await http.post('/api/v1/manufacturing/production-orders').send({
      orderId: ORDER_ID,
      bomId,
      factoryLineId,
    });
    expect(created.status).toBe(201);
    expect(created.body.plannedQty).toBe(200);
    expect(created.body.sizePlan).toHaveLength(2);

    const started = await http.post(
      `/api/v1/manufacturing/production-orders/${created.body.id}/start`,
    );
    expect(started.status).toBe(200);
    expect(started.body.status).toBe('in_progress');

    const daily = await http
      .post(`/api/v1/manufacturing/production-orders/${created.body.id}/daily`)
      .send({
        prodDate: '2026-06-01',
        factoryLineId,
        operationId,
        targetQty: 100,
        producedQty: 85,
      });
    expect(daily.status).toBe(201);
    expect(daily.body.efficiencyPct).toBe(85);

    const qc = await http
      .post(`/api/v1/manufacturing/production-orders/${created.body.id}/qc`)
      .send({
        qcType: 'final',
        inspectedQty: 50,
        passedQty: 50,
        failedQty: 0,
        reworkQty: 0,
        verdict: 'pass',
      });
    expect(qc.status).toBe(201);

    // Allow async event handler to run
    await new Promise((r) => setTimeout(r, 50));

    const po = await http.get(`/api/v1/manufacturing/production-orders/${created.body.id}`);
    expect(po.body.status).toBe('completed');

    const order = await prisma.order.findUnique({ where: { id: ORDER_ID } });
    expect(order?.status).toBe('qc');

    expect(eventEmitter).toBeDefined();
  });
});
