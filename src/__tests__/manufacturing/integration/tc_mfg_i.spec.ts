import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { prisma } from '@test/helpers/integration-test-setup';
import { PrismaService } from '@shared/database/prisma.service';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RbacGuard } from '@common/guards/rbac.guard';
import { HttpExceptionFilter } from '@common/filters/http-exception.filter';
import { BomService } from '@modules/manufacturing/services/bom.service';
import { CostSheetsService } from '@modules/manufacturing/services/cost-sheets.service';
import {
  ArticleBomController,
  BomController,
} from '@modules/manufacturing/controllers/bom.controller';
import { CostSheetsController } from '@modules/manufacturing/controllers/cost-sheets.controller';

const USER_ID = 'c9222222-2222-4222-8222-222222222222';
const ARTICLE_ID = 'a9222222-2222-4222-8222-222222222222';
const ITEM_ID = 'e9222222-2222-4222-8222-222222222222';

const allowGuard: CanActivate = {
  canActivate: (_context: ExecutionContext) => true,
};

async function seed(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO sys.users (id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
     VALUES ($1::uuid, 'mfg-i@okfootwear.com', 'x', 'M', 'Fg', true, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    USER_ID,
  );
  await prisma.article.upsert({
    where: { id: ARTICLE_ID },
    create: { id: ARTICLE_ID, code: 'ART-MFG-I', description: 'HTTP BOM article' },
    update: {},
  });
  await prisma.stockItem.upsert({
    where: { id: ITEM_ID },
    create: {
      id: ITEM_ID,
      itemCode: 'ITM-MFG-I',
      name: 'Lining',
      category: 'raw_material',
      uom: 'M',
    },
    update: {},
  });
}

describe('Manufacturing HTTP (Sprint 9 BOM / cost sheet)', () => {
  let app: INestApplication;
  let http: request.SuperTest<request.Test>;

  beforeAll(async () => {
    const prismaSvc = prisma as unknown as PrismaService;
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BomController, ArticleBomController, CostSheetsController],
      providers: [
        BomService,
        CostSheetsService,
        { provide: PrismaService, useValue: prismaSvc },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(allowGuard)
      .overrideGuard(RbacGuard)
      .useValue(allowGuard)
      .compile();

    app = module.createNestApplication();
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
        email: 'mfg-i@okfootwear.com',
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
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await seed();
  });

  it('POST /api/v1/manufacturing/bom → 201 draft', async () => {
    const res = await http.post('/api/v1/manufacturing/bom').send({
      articleId: ARTICLE_ID,
      version: `i-${Date.now()}`,
      lines: [
        {
          itemId: ITEM_ID,
          componentType: 'lining',
          qtyPerUnit: 0.4,
          uom: 'M',
          wastagePct: 5,
        },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('draft');
    expect(res.body.lines).toHaveLength(1);
  });

  it('POST approve then GET /api/v1/articles/:id/bom returns approved', async () => {
    const created = await http.post('/api/v1/manufacturing/bom').send({
      articleId: ARTICLE_ID,
      version: `a-${Date.now()}`,
      lines: [
        {
          itemId: ITEM_ID,
          componentType: 'lining',
          qtyPerUnit: 0.4,
          uom: 'M',
        },
      ],
    });
    expect(created.status).toBe(201);

    const approved = await http.post(
      `/api/v1/manufacturing/bom/${created.body.id}/approve`,
    );
    expect(approved.status).toBe(201);
    expect(approved.body.status).toBe('approved');

    const active = await http.get(`/api/v1/articles/${ARTICLE_ID}/bom`);
    expect(active.status).toBe(200);
    expect(active.body.id).toBe(created.body.id);

    const cost = await http.post(`/api/v1/manufacturing/bom/${created.body.id}/cost-sheet`).send({
      labourCost: 10,
      overheadCost: 5,
      targetMarginPct: 20,
    });
    expect(cost.status).toBe(201);
    expect(cost.body.sellingPrice).toBe(
      Number((cost.body.totalCost * 1.2).toFixed(4)),
    );
  });
});
