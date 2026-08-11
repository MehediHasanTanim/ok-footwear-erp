// =============================================================================
// TC-SEC-INJ-001 — SQL injection in search parameter
// =============================================================================
// OK Footwear ERP — Sprint 5
// Layer under test: BuyersService.findAll() trigram search (Prisma $queryRaw)
//
// Purpose: Classic SQL injection payloads in `?search=` must be treated as
// literal search text (parameterized), never executed as SQL. The result is
// an empty data set — no unauthorized rows leaked.
//
// BuyersService uses Prisma tagged-template `$queryRaw` which binds `${search}`
// as a query parameter (not string concatenation). This suite asserts:
//   1. HTTP 200 with empty `data` for an injection payload
//   2. The injection string is passed as a bound value to $queryRaw
//   3. A successful fuzzy match for a benign term still returns rows
// =============================================================================

import {
  Controller,
  Get,
  INestApplication,
  Query,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { BuyersService } from '@modules/orders/services/buyers.service';
import { PrismaService } from '@shared/database/prisma.service';
import { BuyerQueryDto } from '@modules/orders/dto/buyers.dto';

const SQL_INJECTION = "' OR '1'='1";

/** Arguments Prisma / client receives for a tagged `$queryRaw\`...\`` call. */
type QueryRawTaggedCall = [TemplateStringsArray, ...unknown[]];


@Controller('buyers')
class TestBuyersController {
  constructor(private readonly buyersService: BuyersService) {}

  @Get()
  findAll(@Query() query: BuyerQueryDto) {
    return this.buyersService.findAll(query);
  }
}

describe('TC-SEC-INJ-001 · SQL injection in search parameter', () => {
  let app: INestApplication;
  let http: request.SuperTest<request.Test>;
  let mockQueryRaw: jest.Mock;

  beforeAll(async () => {
    mockQueryRaw = jest.fn();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [TestBuyersController],
      providers: [
        BuyersService,
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: mockQueryRaw,
            buyer: {
              findMany: jest.fn(),
              count: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    mockQueryRaw.mockReset();
  });

  it("does not execute injected SQL in search query parameter", async () => {
    // No rows match the literal injection string as a buyer name
    mockQueryRaw
      .mockResolvedValueOnce([]) // id rows
      .mockResolvedValueOnce([{ count: BigInt(0) }]); // count

    const res = await http.get('/buyers').query({ search: SQL_INJECTION });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.totalItems).toBe(0);

    // Injection must be bound as a parameter value, not concatenated into SQL.
    // Tagged `$queryRaw\`...\`` is invoked as (strings, ...values).
    expect(mockQueryRaw).toHaveBeenCalled();
    for (const call of mockQueryRaw.mock.calls as QueryRawTaggedCall[]) {
      const [strings, ...values] = call;
      expect(values).toContain(SQL_INJECTION);
      const text = Array.from(strings).join('?');
      expect(text).not.toContain(SQL_INJECTION);
      expect(text.toLowerCase()).not.toContain("or '1'='1");
    }
  });

  it('still returns matching buyers for a benign search term', async () => {
    mockQueryRaw
      .mockResolvedValueOnce([{ id: 'b-1' }])
      .mockResolvedValueOnce([{ count: BigInt(1) }]);

    const prisma = app.get(PrismaService);
    (prisma.buyer.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'b-1', name: 'Nike' },
    ]);

    const res = await http.get('/buyers').query({ search: 'Nike' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ id: 'b-1', name: 'Nike' }]);
  });
});
