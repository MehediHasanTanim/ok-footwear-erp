// =============================================================================
// TC-E2E-ORD-002 — Full order lifecycle: draft → confirmed → ... → delivered
// =============================================================================
// OK Footwear ERP — Sprint 4
// Layer under test: NestJS HTTP pipeline (full AppModule) against real DB + Redis
//
// Purpose: Verifies the complete order state machine end-to-end through the
// HTTP API. Every transition is validated against STATUS_TRANSITIONS, and the
// sample_approved gate on confirmed → in_production is exercised.
//
// Lifecycle:
//   POST /orders                → draft
//   PATCH /orders/:id/status    → confirmed (generates 6 milestones)
//   [set sample_approved=true via direct Prisma — gate prerequisite]
//   PATCH /orders/:id/status    → in_production
//   PATCH /orders/:id/status    → qc
//   PATCH /orders/:id/status    → packed
//   PATCH /orders/:id/status    → delivered (terminal — no further transitions)
//
// Requires: testcontainers (PostgreSQL 16 + Redis 7) started by global setup.
// =============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  ClassSerializerInterceptor,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';

import { AppModule } from '@/app.module';
import { CorrelationMiddleware } from '@shared/logger';
import {
  HttpExceptionFilter,
  validationExceptionFactory,
} from '@common/filters';
import { ResponseInterceptor } from '@common/interceptors';

// ---------------------------------------------------------------------------
// Constants — Fixed UUIDs for test fixtures
// ---------------------------------------------------------------------------

const OPS_USER_ID = 'e2e00000-0000-4000-8000-000000000001';
const BUYER_ID = 'e2e00000-0000-4000-8000-000000000011';
const ARTICLE_ID = 'e2e00000-0000-4000-8000-000000000021';
const OPS_ROLE_ID = 'e2e00000-0000-4000-8000-000000000031';
const PERM_READ_ID = 'e2e00000-0000-4000-8000-000000000101';
const PERM_CREATE_ID = 'e2e00000-0000-4000-8000-000000000102';
const PERM_UPDATE_ID = 'e2e00000-0000-4000-8000-000000000103';
const PERM_DELETE_ID = 'e2e00000-0000-4000-8000-000000000104';

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('TC-E2E-ORD-002 · Full order lifecycle', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let prisma: PrismaClient;
  let redis: Redis;
  let opsUserToken: string;
  let http: request.Agent;

  // =========================================================================
  // Lifecycle — beforeAll
  // =========================================================================

  beforeAll(async () => {
    // -------------------------------------------------------------------
    // 1. Set environment variables
    // -------------------------------------------------------------------
    const dbUrl = process.env['TEST_DATABASE_URL'];
    const directDbUrl = process.env['TEST_DIRECT_DATABASE_URL'];
    const redisUrl = process.env['TEST_REDIS_URL'];

    if (!dbUrl || !directDbUrl) {
      throw new Error(
        'TEST_DATABASE_URL / TEST_DIRECT_DATABASE_URL not set. ' +
          'Ensure integration-global-setup.js ran successfully.',
      );
    }
    if (!redisUrl) {
      throw new Error(
        'TEST_REDIS_URL not set. Ensure integration-global-setup.js ran successfully.',
      );
    }

    process.env['DATABASE_URL'] = dbUrl;
    process.env['DIRECT_DATABASE_URL'] = directDbUrl;
    process.env['REDIS_URL'] = redisUrl;
    process.env['JWT_SECRET'] =
      'e2e-test-jwt-secret-at-least-32-characters!!';
    process.env['TOTP_ENCRYPTION_KEY'] =
      '3649ff438e7e1fc0f5169d2662003c1e83fb2cfcd33e01c7a94d3768c3879984';
    process.env['NODE_ENV'] = 'test';

    // -------------------------------------------------------------------
    // 2. Create Prisma client + Redis
    // -------------------------------------------------------------------
    prisma = new PrismaClient({
      datasources: { db: { url: directDbUrl } },
      log: [
        { level: 'warn', emit: 'stdout' },
        { level: 'error', emit: 'stdout' },
      ],
    });
    await prisma.$connect();

    redis = new Redis(redisUrl, { maxRetriesPerRequest: null });

    // Push schema (idempotent)
    const { execSync } = await import('child_process');
    execSync('npx prisma db push --skip-generate --accept-data-loss', {
      env: { ...process.env, DATABASE_URL: directDbUrl, DIRECT_DATABASE_URL: directDbUrl },
      stdio: 'pipe',
    });

    // Create next_doc_number function (db push doesn't run migrations)
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION sys.next_doc_number(p_prefix TEXT)
      RETURNS TEXT LANGUAGE plpgsql AS $$
      DECLARE
        v_last_number INT; v_pad_length INT; v_separator CHAR(1);
        v_year INT; v_formatted TEXT;
      BEGIN
        SELECT last_number, pad_length, separator
        INTO v_last_number, v_pad_length, v_separator
        FROM sys.document_sequences WHERE prefix = p_prefix FOR UPDATE;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Unknown prefix: %', p_prefix;
        END IF;
        v_last_number := v_last_number + 1;
        UPDATE sys.document_sequences SET last_number = v_last_number WHERE prefix = p_prefix;
        v_year := EXTRACT(YEAR FROM CURRENT_DATE)::INT;
        v_formatted := p_prefix || v_separator || v_year::TEXT || v_separator || LPAD(v_last_number::TEXT, v_pad_length, '0');
        RETURN v_formatted;
      END; $$;
    `);

    // Seed ORD prefix
    await prisma.$executeRawUnsafe(`
      INSERT INTO sys.document_sequences (prefix, last_number, pad_length, separator)
      VALUES ('ORD', 0, 6, '-')
      ON CONFLICT (prefix) DO UPDATE SET last_number = 0
    `);

    // -------------------------------------------------------------------
    // 3. Seed reference data
    // -------------------------------------------------------------------
    await seedE2EData(prisma);

    // -------------------------------------------------------------------
    // 4. Create NestJS app
    // -------------------------------------------------------------------
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    const correlationMiddleware = new CorrelationMiddleware();
    app.use(correlationMiddleware.use.bind(correlationMiddleware));
    app.setGlobalPrefix('api/v1');
    app.useGlobalInterceptors(
      new ResponseInterceptor(),
      new ClassSerializerInterceptor(app.get(Reflector)),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
        forbidUnknownValues: true,
        exceptionFactory: (errors) => validationExceptionFactory(errors),
      }),
    );

    await app.init();
    http = request(app.getHttpServer());

    // -------------------------------------------------------------------
    // 5. Generate JWT for ops user
    // -------------------------------------------------------------------
    jwtService = app.get(JwtService);
    opsUserToken = await jwtService.signAsync(
      {
        sub: OPS_USER_ID,
        email: 'e2e-ops@okfootwear.test',
        permissions: ['orders:read', 'orders:create', 'orders:update', 'orders:delete'],
      },
      { expiresIn: '1h' },
    );
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await redis?.quit();
  });

  beforeEach(async () => {
    // Clean test data
    await prisma.$executeRawUnsafe(`DELETE FROM ord.order_milestones`);
    await prisma.$executeRawUnsafe(`DELETE FROM ord.order_lines`);
    await prisma.$executeRawUnsafe(`DELETE FROM ord.orders`);

    // Reset sequence
    await prisma.$executeRawUnsafe(`
      INSERT INTO sys.document_sequences (prefix, last_number, pad_length, separator)
      VALUES ('ORD', 0, 6, '-')
      ON CONFLICT (prefix) DO UPDATE SET last_number = 0
    `);

    // Clear throttle keys
    try {
      await redis.select(2);
      const keys = await redis.keys('ratelimit:*');
      if (keys.length > 0) await redis.del(keys);
      await redis.select(0);
    } catch { /* non-blocking */ }
  });

  // =========================================================================
  // TC-E2E-ORD-002 · Full lifecycle
  // =========================================================================

  it('should complete full lifecycle: draft → confirmed → in_production → qc → packed → delivered', async () => {
    // ── Step 1: Create order (draft) ──────────────────────────────────

    const createRes = await http
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${opsUserToken}`)
      .send({
        buyerId: BUYER_ID,
        articleId: ARTICLE_ID,
        totalQuantity: 100,
        deliveryDate: '2026-12-01',
        currency: 'USD',
        orderLines: [
          { sizeLabel: '38', quantity: 50, unitPrice: 12.5 },
          { sizeLabel: '39', quantity: 50, unitPrice: 12.5 },
        ],
      })
      .expect(201);

    const orderId: string = createRes.body.data.id;
    expect(createRes.body.data.status).toBe('draft');
    expect(createRes.body.data.orderNumber).toMatch(/^ORD-/);

    // ── Step 2: draft → confirmed ────────────────────────────────────

    const confirmRes = await http
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${opsUserToken}`)
      .send({ toStatus: 'confirmed' })
      .expect(200);

    expect(confirmRes.body.data.status).toBe('confirmed');
    expect(confirmRes.body.data.confirmedAt).toBeDefined();

    // Verify 6 milestones were generated
    const milestoneCount = await prisma.orderMilestone.count({
      where: { orderId },
    });
    expect(milestoneCount).toBe(6);

    // ── Step 3: Set sample_approved = true (gate for in_production) ──

    await prisma.order.update({
      where: { id: orderId },
      data: { sampleApproved: true },
    });

    // ── Step 4: confirmed → in_production ────────────────────────────

    const inProdRes = await http
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${opsUserToken}`)
      .send({ toStatus: 'in_production' })
      .expect(200);

    expect(inProdRes.body.data.status).toBe('in_production');

    // ── Step 5: in_production → qc ───────────────────────────────────

    const qcRes = await http
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${opsUserToken}`)
      .send({ toStatus: 'qc' })
      .expect(200);

    expect(qcRes.body.data.status).toBe('qc');

    // ── Step 6: qc → packed ──────────────────────────────────────────

    const packedRes = await http
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${opsUserToken}`)
      .send({ toStatus: 'packed' })
      .expect(200);

    expect(packedRes.body.data.status).toBe('packed');

    // ── Step 7: packed → delivered (terminal) ────────────────────────

    const deliveredRes = await http
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${opsUserToken}`)
      .send({ toStatus: 'delivered' })
      .expect(200);

    expect(deliveredRes.body.data.status).toBe('delivered');

    // ── Step 8: Verify terminal state — no further transitions ───────

    await http
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${opsUserToken}`)
      .send({ toStatus: 'confirmed' })
      .expect(400); // delivered is terminal — cannot transition

    // ── Step 9: Verify DB reflects final state ───────────────────────

    const finalOrder = await prisma.order.findUnique({
      where: { id: orderId },
    });
    expect(finalOrder).not.toBeNull();
    expect(finalOrder!.status).toBe('delivered');
  }, 30_000);
});

// =============================================================================
// Seed Reference Data — self-contained for this E2E test
// =============================================================================

async function seedE2EData(prisma: PrismaClient): Promise<void> {
  const passwordHash = await argon2.hash('E2ETestPass123!');

  // Role
  await prisma.$executeRawUnsafe(`
    INSERT INTO sys.roles (id, name, description, is_system, updated_at)
    VALUES ('${OPS_ROLE_ID}', 'E2E Ops', 'E2E test ops role', true, NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  // Permissions
  for (const [id, module, action, desc] of [
    [PERM_READ_ID, 'orders', 'read', 'Read orders'],
    [PERM_CREATE_ID, 'orders', 'create', 'Create orders'],
    [PERM_UPDATE_ID, 'orders', 'update', 'Update orders'],
    [PERM_DELETE_ID, 'orders', 'delete', 'Delete orders'],
  ]) {
    await prisma.$executeRawUnsafe(`
      INSERT INTO sys.permissions (id, module, action, description)
      VALUES ('${id}', '${module}', '${action}', '${desc}')
      ON CONFLICT (module, action) DO NOTHING
    `);
  }

  // Role permissions
  for (const permId of [PERM_READ_ID, PERM_CREATE_ID, PERM_UPDATE_ID, PERM_DELETE_ID]) {
    await prisma.$executeRawUnsafe(`
      INSERT INTO sys.role_permissions (role_id, permission_id)
      VALUES ('${OPS_ROLE_ID}', '${permId}')
      ON CONFLICT (role_id, permission_id) DO NOTHING
    `);
  }

  // User
  await prisma.$executeRawUnsafe(`
    INSERT INTO sys.users (id, email, password_hash, first_name, last_name, is_active, updated_at)
    VALUES ('${OPS_USER_ID}', 'e2e-ops@okfootwear.test', '${passwordHash}', 'E2E', 'Ops', true, NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  // User role
  await prisma.$executeRawUnsafe(`
    INSERT INTO sys.user_roles (user_id, role_id)
    VALUES ('${OPS_USER_ID}', '${OPS_ROLE_ID}')
    ON CONFLICT (user_id, role_id) DO NOTHING
  `);

  // Buyer
  await prisma.$executeRawUnsafe(`
    INSERT INTO ord.buyers (id, name, currency, payment_terms, is_active, deleted_at, updated_at)
    VALUES ('${BUYER_ID}', 'E2E Buyer Ltd.', 'USD', 'LC_SIGHT', true, NULL, NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  // Article
  await prisma.$executeRawUnsafe(`
    INSERT INTO ord.articles (id, code, description, is_active, deleted_at, updated_at)
    VALUES ('${ARTICLE_ID}', 'E2E-ART-001', 'E2E Test Article', true, NULL, NOW())
    ON CONFLICT (id) DO NOTHING
  `);
}
