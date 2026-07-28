// =============================================================================
// TC-SEC-INJ-005 — Unknown DTO properties stripped by ValidationPipe whitelist
// =============================================================================
// OK Footwear ERP — Sprint 4
// Layer under test: NestJS ValidationPipe (whitelist + forbidNonWhitelisted)
//
// Purpose: Verifies that the global ValidationPipe strips unknown properties
// from request bodies. This prevents mass-assignment attacks where an attacker
// sends extra fields (e.g., `role: "admin"`, `isActive: true`) hoping they'll
// be passed through to the service layer.
//
// Test strategy:
//   - A lightweight NestJS app with one controller, one DTO, and the same
//     ValidationPipe config as production (whitelist + forbidNonWhitelisted).
//   - Send a request with known + unknown properties.
//   - Assert the DTO received by the controller has ONLY known properties.
//   - Assert forbidden unknown properties produce a 422 (not silently accepted).
// =============================================================================

import {
  Controller,
  Post,
  Body,
  ValidationPipe,
  ValidationError,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { IsString, IsInt, Min, IsUUID } from 'class-validator';
import request from 'supertest';

// ---------------------------------------------------------------------------
// Test DTO — known fields only
// ---------------------------------------------------------------------------

class CreateOrderDto {
  @IsUUID('4')
  buyerId!: string;

  @IsUUID('4')
  articleId!: string;

  @IsInt()
  @Min(1)
  totalQuantity!: number;

  @IsString()
  deliveryDate!: string;

  @IsString()
  currency!: string;
}

// ---------------------------------------------------------------------------
// Test Controller — captures received DTO for verification
// ---------------------------------------------------------------------------

let capturedDto: Record<string, unknown> | null = null;

@Controller('orders')
class TestOrdersController {
  @Post()
  create(@Body() dto: CreateOrderDto): Record<string, unknown> {
    capturedDto = dto as unknown as Record<string, unknown>;
    return { success: true };
  }
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('TC-SEC-INJ-005 · ValidationPipe whitelist strips unknown properties', () => {
  let app: INestApplication;
  let http: request.Agent;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [TestOrdersController],
    }).compile();

    app = moduleFixture.createNestApplication();

    // -------------------------------------------------------------------
    // ValidationPipe — same config as production (main.ts)
    // -------------------------------------------------------------------
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
        forbidUnknownValues: true,
        exceptionFactory: (errors: ValidationError[]) => {
          const messages = errors.map((e) => ({
            field: e.property,
            message: Object.values(e.constraints ?? {}).join('; '),
          }));
          return new UnprocessableEntityException({
            statusCode: 422,
            message: 'Validation failed',
            errors: messages,
          });
        },
      }),
    );

    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    capturedDto = null;
  });

  // =========================================================================
  // Whitelist — unknown properties WITH valid known fields → rejected (422)
  // =========================================================================
  // With forbidNonWhitelisted: true, ANY unknown property triggers 422
  // BEFORE the DTO is passed to the controller. This is the strongest
  // defense against mass-assignment.

  it('should reject (422) when unknown properties are sent alongside valid known fields', async () => {
    const res = await http
      .post('/orders')
      .send({
        // Known fields (correct — would pass validation on their own)
        buyerId: '550e8400-e29b-41d4-a716-446655440000',
        articleId: '550e8400-e29b-41d4-a716-446655440001',
        totalQuantity: 100,
        deliveryDate: '2026-12-01',
        currency: 'USD',

        // Unknown fields (mass-assignment injection attempt)
        role: 'admin',
        isActive: true,
        internalNotes: 'bypass validation',
      })
      .expect(422);

    // Error must reference the unknown properties
    expect(res.body.statusCode).toBe(422);
    expect(res.body.message).toBe('Validation failed');
    expect(res.body.errors).toBeDefined();
    const errorFields = res.body.errors.map(
      (e: { field: string }) => e.field,
    );

    // The non-whitelisted fields should be flagged
    expect(errorFields).toContain('role');
    expect(errorFields).toContain('isActive');
    expect(errorFields).toContain('internalNotes');

    // Controller must not have been reached — DTO was rejected
    expect(capturedDto).toBeNull();
  });

  it('should accept request when only known valid fields are sent', async () => {
    const res = await http
      .post('/orders')
      .send({
        buyerId: '550e8400-e29b-41d4-a716-446655440000',
        articleId: '550e8400-e29b-41d4-a716-446655440001',
        totalQuantity: 100,
        deliveryDate: '2026-12-01',
        currency: 'USD',
      })
      .expect(201);

    expect(res.body.success).toBe(true);

    // Verify only the 5 declared fields were passed through
    expect(capturedDto).not.toBeNull();
    const keys = Object.keys(capturedDto!);
    expect(keys).toHaveLength(5);
    expect(keys).toContain('buyerId');
    expect(keys).toContain('articleId');
    expect(keys).toContain('totalQuantity');
    expect(keys).toContain('deliveryDate');
    expect(keys).toContain('currency');
  });

  // =========================================================================
  // forbidNonWhitelisted — rejects unknown properties when present
  // =========================================================================

  it('should return 422 when unknown properties are sent (forbidNonWhitelisted)', async () => {
    // Send only unknown properties — all required fields missing
    const res = await http
      .post('/orders')
      .send({
        role: 'admin',
        isActive: true,
        internalNotes: 'totally unknown payload',
      })
      .expect(422);

    expect(res.body.statusCode).toBe(422);
    expect(res.body.message).toBe('Validation failed');
    expect(res.body.errors).toBeDefined();
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  // =========================================================================
  // Validation still works on known fields
  // =========================================================================

  it('should still validate known fields after whitestripping', async () => {
    const res = await http
      .post('/orders')
      .send({
        buyerId: 'not-a-uuid',
        articleId: '550e8400-e29b-41d4-a716-446655440001',
        totalQuantity: -5, // below @Min(1)
        deliveryDate: '2026-12-01',
        currency: 'USD',
      })
      .expect(422);

    expect(res.body.errors).toBeDefined();
    const fields = res.body.errors.map((e: { field: string }) => e.field);
    // buyerId UUID validation and totalQuantity min validation should trigger
    expect(fields).toContain('buyerId');
    expect(fields).toContain('totalQuantity');
  });
});
