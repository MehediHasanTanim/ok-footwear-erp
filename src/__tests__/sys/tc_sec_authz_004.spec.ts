// =============================================================================
// TC-SEC-AUTHZ-004 — Finance role cannot access board module endpoints
// =============================================================================
// OK Footwear ERP — Sprint 5
// Layer under test: RbacGuard + @Permissions() on a board-shaped route
//
// Purpose: finance_manager holds finance permissions only. Accessing a
// board endpoint that requires `board:read` must return 403 Forbidden.
//
// Board module has no production controllers yet (Sprint 15+). This suite
// bootstraps a minimal NestJS app with a BoardResolutionsController that
// mirrors the planned `/board/resolutions` route and uses the real RbacGuard.
// A middleware injects the JWT-shaped user (simulating JwtAuthGuard).
// =============================================================================

import {
  Controller,
  Get,
  INestApplication,
  UseGuards,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';

// ---------------------------------------------------------------------------
// Minimal board endpoint — matches planned TC path `/board/resolutions`
// ---------------------------------------------------------------------------

@Controller('board/resolutions')
@UseGuards(RbacGuard)
class BoardResolutionsController {
  @Get()
  @Permissions('board:read')
  list(): { data: unknown[] } {
    return { data: [{ id: 'res-1', title: 'Approve FY budget' }] };
  }
}

/** finance_manager — finance module only; no board:* */
const FINANCE_MANAGER = {
  sub: '11111111-1111-4111-8111-111111111111',
  email: 'finance.mgr@okfootwear.com',
  permissions: ['finance:read', 'finance:create', 'finance:update', 'finance:approve'],
};

/** Director / company secretary — has board access */
const BOARD_USER = {
  sub: '22222222-2222-4222-8222-222222222222',
  email: 'cs@okfootwear.com',
  permissions: ['board:read', 'board:create'],
};

describe('TC-SEC-AUTHZ-004 · finance_manager cannot access board endpoints', () => {
  let app: INestApplication;
  let http: request.SuperTest<request.Test>;
  let activeUser: typeof FINANCE_MANAGER = FINANCE_MANAGER;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [BoardResolutionsController],
      providers: [RbacGuard],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Simulate JwtAuthGuard: attach authenticated user before RbacGuard runs
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user?: typeof FINANCE_MANAGER }).user = activeUser;
      next();
    });

    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns 403 when finance_manager accesses board resolutions endpoint', async () => {
    activeUser = FINANCE_MANAGER;

    const res = await http.get('/board/resolutions');

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/insufficient permissions/i);
  });

  it('returns 200 when a user with board:read accesses the same endpoint', async () => {
    activeUser = BOARD_USER;

    const res = await http.get('/board/resolutions');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});
