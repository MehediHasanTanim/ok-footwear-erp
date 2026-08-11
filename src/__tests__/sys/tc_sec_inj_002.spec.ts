// =============================================================================
// TC-SEC-INJ-002 — Non-UUID / SQL injection in path parameter
// =============================================================================
// OK Footwear ERP — Sprint 5
// Layer under test: common ParseUUIDPipe on path params
//
// Purpose: A SQL-injection-shaped (or otherwise non-UUID) path parameter must
// be rejected with 400 Bad Request before any service / DB layer runs.
//
// Production controllers that already use ParseUUIDPipe (audit, compliance)
// get the same pipe. This suite wires the shared pipe on an orders-shaped
// route matching the security test spec: GET /orders/:id
// =============================================================================

import {
  Controller,
  Get,
  INestApplication,
  Param,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { ParseUUIDPipe } from '@common/pipes/parse-uuid.pipe';

@Controller('orders')
class TestOrdersController {
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): { id: string } {
    return { id };
  }
}

describe('TC-SEC-INJ-002 · Non-UUID path parameter returns 400', () => {
  let app: INestApplication;
  let http: request.SuperTest<request.Test>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [TestOrdersController],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns 400 for SQL-injection-shaped path parameter', async () => {
    const res = await http.get("/orders/' OR 1=1 --");

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not a valid uuid/i);
  });

  it('returns 400 for a non-UUID opaque string', async () => {
    const res = await http.get('/orders/not-a-uuid');

    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid UUID v4 path parameter', async () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    const res = await http.get(`/orders/${id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id });
  });
});
