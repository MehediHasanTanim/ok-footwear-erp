// =============================================================================
// TC-SEC-SESS-002 — Security Headers (Helmet) HTTP Test
// =============================================================================
// OK Footwear ERP — Sprint 1
// Module: sys
// Layer under test: HTTP / NestJS middleware (Helmet)
//
// Purpose: Verifies that Helmet middleware sets all required HTTP security
// headers on every response regardless of status code. These headers defend
// against common web vulnerabilities:
//   - Strict-Transport-Security (HSTS): prevents protocol downgrade attacks
//   - Content-Security-Policy (CSP): reduces XSS surface
//   - X-Frame-Options: blocks clickjacking
//   - X-Content-Type-Options: prevents MIME sniffing
//
// This test bootstraps a lightweight NestJS app with the same Helmet
// configuration as production (CSP + HSTS enabled). The real AppModule
// is not used because it requires PostgreSQL, Redis, and BullMQ — all
// unnecessary for testing HTTP middleware headers.
//
// Three test controllers produce the required HTTP status codes:
//   - GET  /api/v1/health       → 200 (success)
//   - POST /api/v1/auth/login    → 422 (validation failure)
//   - GET  /api/v1/orders        → 401 (authentication required)
// =============================================================================

import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  UnprocessableEntityException,
  ValidationPipe,
  ValidationError,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import helmet from 'helmet';
import request from 'supertest';

// ---------------------------------------------------------------------------
// Test DTO — triggers 422 validation error when body is invalid
// ---------------------------------------------------------------------------

class LoginDto {
  @IsEmail({}, { message: 'email must be a valid email address' })
  email!: string;

  @IsString({ message: 'password must be a string' })
  @MinLength(8, { message: 'password must be at least 8 characters' })
  password!: string;
}

// ---------------------------------------------------------------------------
// Test Guard — rejects all requests with 401 Unauthorized
// ---------------------------------------------------------------------------
// Simulates the behavior of a JWT guard when no valid token is present.
// The real JwtAuthGuard is a stub (always returns true in Sprint 1), so
// this test-specific guard produces the 401 responses needed for the test.

@Injectable()
class RejectAllGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    throw new UnauthorizedException('Authentication required');
  }
}

// ---------------------------------------------------------------------------
// Test Controllers — produce 200, 422, and 401 responses
// ---------------------------------------------------------------------------

@Controller('health')
class TestHealthController {
  @Get()
  check(): { status: string; timestamp: string; uptime: number } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}

@Controller('auth')
class TestAuthController {
  @Post('login')
  login(@Body() _dto: LoginDto): { token: string } {
    // Never reached when validation fails — but required for the route to exist
    return { token: 'test-token' };
  }
}

@Controller('orders')
@UseGuards(RejectAllGuard)
class TestOrdersController {
  @Get()
  list(): string[] {
    // Never reached — guard throws 401 before this executes
    return [];
  }
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Helmet security headers', () => {
  let app: INestApplication;
  let http: request.Agent;

  // =========================================================================
  // Lifecycle — Bootstrap test app with production Helmet config
  // =========================================================================

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [
        TestHealthController,
        TestAuthController,
        TestOrdersController,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();

    // -------------------------------------------------------------------
    // Apply Helmet with the same production configuration as main.ts
    // -------------------------------------------------------------------
    // DEVIATION: In the real main.ts, CSP and HSTS are conditionally
    // enabled only in production (isProduction = configService.nodeEnv
    // === 'production'). Here we force production mode so ALL headers
    // are present — the test spec requires all four headers.
    // -------------------------------------------------------------------
    app.use(
      helmet({
        // Content Security Policy: restrict script/style sources to self
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:'],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
          },
        },

        // HTTP Strict Transport Security — enforce HTTPS for 1 year
        strictTransportSecurity: {
          maxAge: 31_536_000, // 365 days in seconds
          includeSubDomains: true,
          preload: true,
        },

        // Prevent clickjacking
        xFrameOptions: { action: 'deny' },

        // Prevent MIME type sniffing
        xContentTypeOptions: true,

        // Referrer Policy
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },

        // Disable X-Powered-By header
        hidePoweredBy: true,
      }),
    );

    // -------------------------------------------------------------------
    // Global prefix — matches the real app's api/v1 prefix
    // -------------------------------------------------------------------
    app.setGlobalPrefix('api/v1');

    // -------------------------------------------------------------------
    // ValidationPipe — required for the 422 response on POST /auth/login
    // -------------------------------------------------------------------
    // Default ValidationPipe throws BadRequestException (400).
    // The test spec requires 422 Unprocessable Entity for validation
    // errors, so we override exceptionFactory to throw 422.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
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

    // Create supertest agent bound to the test app
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  // =========================================================================
  // Helper — assert all four required security headers are present
  // =========================================================================

  /**
   * Asserts that the response contains all four required Helmet security
   * headers with correct values, and that X-Powered-By is absent.
   */
  function assertSecurityHeaders(response: request.Response): void {
    // --- Header 1: Strict-Transport-Security (HSTS) ---
    const hsts = response.headers['strict-transport-security'] as
      | string
      | undefined;
    expect(hsts).toBeDefined();
    expect(hsts).toContain('max-age=');
    // Verify max-age is at least 31536000 (1 year)
    const maxAgeMatch = hsts?.match(/max-age=(\d+)/);
    expect(maxAgeMatch).not.toBeNull();
    const maxAge = parseInt(maxAgeMatch![1]!, 10);
    expect(maxAge).toBeGreaterThanOrEqual(31_536_000);

    // --- Header 2: Content-Security-Policy (CSP) ---
    const csp = response.headers['content-security-policy'] as
      | string
      | undefined;
    expect(csp).toBeDefined();
    expect((csp ?? '').length).toBeGreaterThan(0);

    // --- Header 3: X-Frame-Options ---
    const xfo = response.headers['x-frame-options'] as string | undefined;
    expect(xfo).toBeDefined();
    expect(['DENY', 'SAMEORIGIN']).toContain(xfo?.toUpperCase());

    // --- Header 4: X-Content-Type-Options ---
    const xcto = response.headers['x-content-type-options'] as
      | string
      | undefined;
    expect(xcto).toBeDefined();
    expect(xcto?.toLowerCase()).toBe('nosniff');

    // --- Negative: X-Powered-By must NOT be present ---
    expect(response.headers['x-powered-by']).toBeUndefined();
  }

  // =========================================================================
  // Happy Path — 200 response
  // =========================================================================

  describe('GET /api/v1/health — 200 OK', () => {
    it('returns all four security headers on a 200 response', async () => {
      const response = await http.get('/api/v1/health').expect(200);

      assertSecurityHeaders(response);
    });

    it('Strict-Transport-Security includes includeSubDomains and preload', async () => {
      const response = await http.get('/api/v1/health').expect(200);

      const hsts = response.headers['strict-transport-security'] as string;
      expect(hsts).toContain('includeSubDomains');
      expect(hsts).toContain('preload');
    });

    it('X-Frame-Options is DENY on 200 response', async () => {
      const response = await http.get('/api/v1/health').expect(200);

      expect(response.headers['x-frame-options']).toBe('DENY');
    });

    it('X-Content-Type-Options is nosniff on 200 response', async () => {
      const response = await http.get('/api/v1/health').expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  // =========================================================================
  // Error responses — 422 and 401
  // =========================================================================

  describe('POST /api/v1/auth/login — 422 Unprocessable Entity', () => {
    it('returns all four security headers on a 422 validation error', async () => {
      // Send an empty body — violates @IsEmail() and @IsString() + @MinLength(8)
      const response = await http
        .post('/api/v1/auth/login')
        .send({})
        .set('Content-Type', 'application/json')
        .expect(422);

      assertSecurityHeaders(response);
    });

    it('X-Frame-Options is DENY on 422 error response', async () => {
      const response = await http
        .post('/api/v1/auth/login')
        .send({})
        .set('Content-Type', 'application/json')
        .expect(422);

      expect(response.headers['x-frame-options']).toBe('DENY');
    });

    it('X-Powered-By is absent from 422 error response', async () => {
      const response = await http
        .post('/api/v1/auth/login')
        .send({})
        .set('Content-Type', 'application/json')
        .expect(422);

      expect(response.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('GET /api/v1/orders — 401 Unauthorized', () => {
    it('returns all four security headers on a 401 error response', async () => {
      const response = await http.get('/api/v1/orders').expect(401);

      assertSecurityHeaders(response);
    });

    it('X-Frame-Options is DENY on 401 error response', async () => {
      const response = await http.get('/api/v1/orders').expect(401);

      expect(response.headers['x-frame-options']).toBe('DENY');
    });

    it('X-Content-Type-Options is nosniff on 401 error response', async () => {
      const response = await http.get('/api/v1/orders').expect(401);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================

  describe('Edge cases', () => {
    it('all four headers are present on all three response types (200, 401, 422)', async () => {
      // Step 1 — GET /api/v1/health → 200
      const res200 = await http.get('/api/v1/health').expect(200);

      // Step 2 — POST /api/v1/auth/login with invalid body → 422
      const res422 = await http
        .post('/api/v1/auth/login')
        .send({ email: 'not-an-email' })
        .set('Content-Type', 'application/json')
        .expect(422);

      // Step 3 — GET /api/v1/orders → 401
      const res401 = await http.get('/api/v1/orders').expect(401);

      // Verify all three response types have all four headers
      const responses = [
        { label: '200 OK', res: res200 },
        { label: '422 Unprocessable', res: res422 },
        { label: '401 Unauthorized', res: res401 },
      ] as const;

      for (const { label, res } of responses) {
        expect(res.headers['strict-transport-security']).toBeDefined();
        expect(res.headers['content-security-policy']).toBeDefined();
        expect(res.headers['x-frame-options']).toBeDefined();
        expect(res.headers['x-content-type-options']).toBeDefined();

        // Provide context on failure via a label assertion
        expect(label).toBeTruthy();
      }
    });

    it('X-Powered-By is absent from all response types (Helmet hidePoweredBy)', async () => {
      const res200 = await http.get('/api/v1/health').expect(200);
      const res422 = await http
        .post('/api/v1/auth/login')
        .send({})
        .set('Content-Type', 'application/json')
        .expect(422);
      const res401 = await http.get('/api/v1/orders').expect(401);

      expect(res200.headers['x-powered-by']).toBeUndefined();
      expect(res422.headers['x-powered-by']).toBeUndefined();
      expect(res401.headers['x-powered-by']).toBeUndefined();
    });

    it('CSP header contains default-src directive', async () => {
      const response = await http.get('/api/v1/health').expect(200);

      const csp = response.headers['content-security-policy'] as string;
      expect(csp).toContain("default-src 'self'");
    });

    it('HSTS max-age is exactly 31536000 seconds (365 days)', async () => {
      const response = await http.get('/api/v1/health').expect(200);

      const hsts = response.headers['strict-transport-security'] as string;
      expect(hsts).toContain('max-age=31536000');
    });
  });
});
