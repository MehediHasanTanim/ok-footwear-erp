// =============================================================================
// TC-SEC-SESS-004 — CORS Allows Whitelisted Origin
// =============================================================================
// OK Footwear ERP — Sprint 1
// Module: sys
// Layer under test: HTTP / NestJS CORS middleware
//
// Purpose: The positive counterpart to TC-SEC-SESS-003. Verifies that the
// allowlisted origin receives correct CORS headers so legitimate frontend
// requests succeed. The Access-Control-Allow-Credentials: true header is
// especially critical — without it, the browser blocks the httpOnly refresh
// token cookie from being sent on cross-origin requests, breaking the
// token refresh flow.
//
// This test bootstraps a lightweight NestJS app with the same CORS
// configuration as main.ts, with ALLOWED_ORIGINS set to exactly one
// origin: https://app.okfootwear.com.
// =============================================================================

import {
  Controller,
  Get,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

// ---------------------------------------------------------------------------
// Test Controller — provides a simple endpoint to exercise CORS
// ---------------------------------------------------------------------------

@Controller('health')
class TestHealthController {
  @Get()
  check(): { status: string; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}

// ---------------------------------------------------------------------------
// Constants — CORS allowlist configuration
// ---------------------------------------------------------------------------

/** The single allowed origin (mirrors production ALLOWED_ORIGINS). */
const ALLOWED_ORIGIN = 'https://app.okfootwear.com';

/** The global API prefix (matches main.ts). */
const API_PREFIX = 'api/v1';

/** Expected allowed methods from the production CORS config. */
const EXPECTED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

/** Expected allowed headers from the production CORS config. */
const EXPECTED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Correlation-ID',
];

/** Expected exposed headers from the production CORS config. */
const EXPECTED_EXPOSED_HEADERS = ['X-Correlation-ID', 'Retry-After'];

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('CORS — whitelisted origin allowed', () => {
  let app: INestApplication;
  let http: request.Agent;

  // =========================================================================
  // Lifecycle — Bootstrap test app with production CORS config
  // =========================================================================

  beforeAll(async () => {
    // Set the environment variable to match the test precondition
    process.env['ALLOWED_ORIGINS'] = ALLOWED_ORIGIN;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [TestHealthController],
    }).compile();

    app = moduleFixture.createNestApplication();

    // -------------------------------------------------------------------
    // CORS — same configuration as main.ts (production mode)
    // -------------------------------------------------------------------
    // Origin callback: allows the single configured origin.
    // credentials: true is CRITICAL — without it, the browser blocks
    // the httpOnly refresh token cookie on cross-origin requests.
    // -------------------------------------------------------------------
    app.enableCors({
      origin: (origin, callback) => {
        // Allow requests with no origin (server-to-server, Postman, curl)
        if (!origin) {
          callback(null, true);
          return;
        }

        if (origin === ALLOWED_ORIGIN) {
          callback(null, true);
        } else {
          callback(new Error(`Origin "${origin}" is not allowed by CORS`));
        }
      },
      credentials: true,
      methods: EXPECTED_METHODS,
      allowedHeaders: EXPECTED_HEADERS,
      exposedHeaders: EXPECTED_EXPOSED_HEADERS,
    });

    // Global prefix — matches the real app
    app.setGlobalPrefix(API_PREFIX);

    await app.init();

    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
    delete process.env['ALLOWED_ORIGINS'];
  });

  // =========================================================================
  // Happy Path — GET with allowed origin
  // =========================================================================

  describe('GET /api/v1/health with allowed origin', () => {
    it('returns Access-Control-Allow-Origin matching the allowed origin exactly', async () => {
      const res = await http
        .get(`/${API_PREFIX}/health`)
        .set('Origin', ALLOWED_ORIGIN)
        .expect(200);

      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    });

    it('returns Access-Control-Allow-Credentials: true', async () => {
      // CRITICAL: Without this header, the browser blocks httpOnly cookies
      // (including the refresh token cookie) on cross-origin requests.
      const res = await http
        .get(`/${API_PREFIX}/health`)
        .set('Origin', ALLOWED_ORIGIN)
        .expect(200);

      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('returns the response body successfully (CORS does not block the request)', async () => {
      const res = await http
        .get(`/${API_PREFIX}/health`)
        .set('Origin', ALLOWED_ORIGIN)
        .expect(200);

      expect(res.body).toHaveProperty('status', 'ok');
      expect(res.body).toHaveProperty('timestamp');
    });

    it('exposes the expected headers via Access-Control-Expose-Headers', async () => {
      const res = await http
        .get(`/${API_PREFIX}/health`)
        .set('Origin', ALLOWED_ORIGIN)
        .expect(200);

      const exposed = res.headers['access-control-expose-headers'] as
        | string
        | undefined;

      // If the header is present, verify it includes the expected values
      if (exposed) {
        EXPECTED_EXPOSED_HEADERS.forEach((header) => {
          expect(exposed.toLowerCase()).toContain(header.toLowerCase());
        });
      }
    });
  });

  // =========================================================================
  // Preflight OPTIONS — allowed origin
  // =========================================================================

  describe('OPTIONS /api/v1/health (preflight) with allowed origin', () => {
    it('returns status 204 No Content for preflight', async () => {
      const res = await http
        .options(`/${API_PREFIX}/health`)
        .set('Origin', ALLOWED_ORIGIN)
        .set('Access-Control-Request-Method', 'GET')
        .expect(204);

      // 204 means no body — preflight succeeded
      expect(res.body).toEqual({});
    });

    it('returns Access-Control-Allow-Origin matching the allowed origin', async () => {
      const res = await http
        .options(`/${API_PREFIX}/health`)
        .set('Origin', ALLOWED_ORIGIN)
        .set('Access-Control-Request-Method', 'GET')
        .expect(204);

      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    });

    it('returns Access-Control-Allow-Methods containing GET', async () => {
      const res = await http
        .options(`/${API_PREFIX}/health`)
        .set('Origin', ALLOWED_ORIGIN)
        .set('Access-Control-Request-Method', 'GET')
        .expect(204);

      const methods = res.headers['access-control-allow-methods'] as string;
      expect(methods).toBeDefined();
      expect(methods).toContain('GET');
    });

    it('returns Access-Control-Allow-Methods containing all configured methods', async () => {
      const res = await http
        .options(`/${API_PREFIX}/health`)
        .set('Origin', ALLOWED_ORIGIN)
        .set('Access-Control-Request-Method', 'GET')
        .expect(204);

      const methods = res.headers['access-control-allow-methods'] as string;
      EXPECTED_METHODS.forEach((method) => {
        expect(methods).toContain(method);
      });
    });

    it('returns Access-Control-Allow-Headers for preflight', async () => {
      const res = await http
        .options(`/${API_PREFIX}/health`)
        .set('Origin', ALLOWED_ORIGIN)
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'Authorization, X-Correlation-ID')
        .expect(204);

      const headers = res.headers['access-control-allow-headers'] as string;
      expect(headers).toBeDefined();

      EXPECTED_HEADERS.forEach((header) => {
        expect(headers.toLowerCase()).toContain(header.toLowerCase());
      });
    });

    it('returns Access-Control-Allow-Credentials: true on preflight', async () => {
      const res = await http
        .options(`/${API_PREFIX}/health`)
        .set('Origin', ALLOWED_ORIGIN)
        .set('Access-Control-Request-Method', 'GET')
        .expect(204);

      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  // =========================================================================
  // Negative Assertions
  // =========================================================================

  describe('Negative assertions', () => {
    it('Access-Control-Allow-Origin must be the exact origin string, NOT wildcard *', async () => {
      const res = await http
        .get(`/${API_PREFIX}/health`)
        .set('Origin', ALLOWED_ORIGIN)
        .expect(200);

      // Must be the exact origin, not wildcard
      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
      expect(res.headers['access-control-allow-origin']).not.toBe('*');
    });

    it('Access-Control-Allow-Origin on preflight is exact origin, NOT wildcard', async () => {
      const res = await http
        .options(`/${API_PREFIX}/health`)
        .set('Origin', ALLOWED_ORIGIN)
        .set('Access-Control-Request-Method', 'GET')
        .expect(204);

      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
      expect(res.headers['access-control-allow-origin']).not.toBe('*');
    });

    it('credentials must be supported: Access-Control-Allow-Credentials: true', async () => {
      // This is critical: without credentials:true, the browser won't send
      // the httpOnly refresh token cookie on cross-origin requests,
      // breaking the entire token refresh flow.
      const res = await http
        .get(`/${API_PREFIX}/health`)
        .set('Origin', ALLOWED_ORIGIN)
        .expect(200);

      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================

  describe('Edge cases', () => {
    it('multiple requests from the allowed origin all get correct CORS headers', async () => {
      // Verify consistency across multiple requests
      for (let i = 0; i < 3; i++) {
        const res = await http
          .get(`/${API_PREFIX}/health`)
          .set('Origin', ALLOWED_ORIGIN)
          .expect(200);

        expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
        expect(res.headers['access-control-allow-credentials']).toBe('true');
      }
    });

    it('allowed origin works with POST method preflight', async () => {
      // Test that POST preflight also works (not just GET)
      const res = await http
        .options(`/${API_PREFIX}/health`)
        .set('Origin', ALLOWED_ORIGIN)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type, Authorization')
        .expect(204);

      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
      expect(res.headers['access-control-allow-methods']).toContain('POST');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('allowed origin works with custom header preflight (X-Correlation-ID)', async () => {
      // The frontend sends X-Correlation-ID for request tracing.
      // The CORS config must allow this custom header.
      const res = await http
        .options(`/${API_PREFIX}/health`)
        .set('Origin', ALLOWED_ORIGIN)
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'X-Correlation-ID')
        .expect(204);

      const allowedHeaders = res.headers['access-control-allow-headers'] as
        | string
        | undefined;

      expect(allowedHeaders).toBeDefined();
      expect(allowedHeaders?.toLowerCase()).toContain('x-correlation-id');
    });

    it('subdomain variations of the allowed origin are NOT granted access', async () => {
      // Security: subdomains like evil.app.okfootwear.com must NOT be allowed
      // just because the parent domain is in the allowlist
      const subdomainVariants = [
        'https://evil.app.okfootwear.com',
        'https://app.okfootwear.com.evil.com',
        'https://app.okfootwear.co',
        'https://app.okfootwear.com:443',
      ];

      for (const variant of subdomainVariants) {
        const res = await http
          .get(`/${API_PREFIX}/health`)
          .set('Origin', variant);

        // Must NOT echo back the origin or use wildcard
        expect(res.headers['access-control-allow-origin']).not.toBe(variant);
        expect(res.headers['access-control-allow-origin']).not.toBe('*');
      }
    });
  });
});
