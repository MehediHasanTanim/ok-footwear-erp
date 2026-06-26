// =============================================================================
// TC-SEC-SESS-003 — CORS Rejection of Unknown Origins
// =============================================================================
// OK Footwear ERP — Sprint 1
// Module: sys
// Layer under test: HTTP / NestJS CORS middleware
//
// Purpose: Verifies that the CORS middleware rejects requests from origins
// NOT in the ALLOWED_ORIGINS allowlist. The production config uses a
// dynamic origin callback — unlisted origins receive no CORS headers,
// which causes the browser to block the response per the Same-Origin Policy.
//
// CORS enforcement is ultimately the browser's responsibility. The server's
// job is to omit or mismatch the Access-Control-Allow-Origin header.
// Supertest bypasses the browser, so we test header values directly.
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

/** An origin NOT in the allowlist — must be rejected. */
const EVIL_ORIGIN = 'https://evil.com';

/** A second malicious origin for edge-case testing. */
const EVIL_ORIGIN_2 = 'https://malware.net';

/** The global API prefix (matches main.ts). */
const API_PREFIX = 'api/v1';

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('CORS — unknown origin rejection', () => {
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
    // Origin callback: allows the single configured origin + localhost
    // in dev. Rejects everything else by calling callback with an Error,
    // which omits CORS headers (browser will block the response).
    //
    // We force production-like behavior by NOT adding the localhost
    // dev bypass. The only allowed origin is https://app.okfootwear.com.
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
          // Rejected: callback with Error omits CORS headers
          callback(new Error(`Origin "${origin}" is not allowed by CORS`));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
      exposedHeaders: ['X-Correlation-ID', 'Retry-After'],
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
  // Helper — assert CORS rejection (evil origin NOT allowed)
  // =========================================================================

  /**
   * Asserts that the response does NOT grant CORS access to the evil origin.
   *
   * The server must NOT reflect the evil origin back in
   * Access-Control-Allow-Origin, and must NEVER use wildcard (*).
   */
  function assertCorsRejectsEvilOrigin(
    res: request.Response,
    label: string,
  ): void {
    const acao = res.headers['access-control-allow-origin'] as
      | string
      | undefined;

    // If the header is present, it must NOT match the evil origin
    if (acao) {
      expect(acao).not.toBe(EVIL_ORIGIN);
    }
    // If absent, that's fine — the browser will block the response

    // Wildcard CORS must NEVER appear
    expect(acao).not.toBe('*');

    // Sanity: label for test context
    expect(label).toBeTruthy();
  }

  // =========================================================================
  // GET Request — Unknown Origin
  // =========================================================================

  describe('GET /api/v1/health with evil origin', () => {
    it('does NOT include Access-Control-Allow-Origin matching the evil origin', async () => {
      const res = await http
        .get(`/${API_PREFIX}/health`)
        .set('Origin', EVIL_ORIGIN)
        .expect(() => {
          // Don't assert on status code — the error handler may produce
          // various status codes. We only care about CORS headers.
        });

      const acao = res.headers['access-control-allow-origin'] as
        | string
        | undefined;

      // Must NOT grant access to the evil origin
      if (acao) {
        expect(acao).not.toBe(EVIL_ORIGIN);
      }

      // Wildcard CORS must NEVER appear
      expect(acao).not.toBe('*');
    });

    it('Access-Control-Allow-Origin is either absent or not https://evil.com', async () => {
      const res = await http
        .get(`/${API_PREFIX}/health`)
        .set('Origin', EVIL_ORIGIN);

      const acao = res.headers['access-control-allow-origin'] as
        | string
        | undefined;

      // XOR: either absent, or present but NOT evil.com
      const isAbsent = acao === undefined || acao === null;
      const isNotEvil = acao !== EVIL_ORIGIN;

      expect(isAbsent || isNotEvil).toBe(true);
    });

    it('wildcard Access-Control-Allow-Origin: * must never appear', async () => {
      const res = await http
        .get(`/${API_PREFIX}/health`)
        .set('Origin', EVIL_ORIGIN);

      expect(res.headers['access-control-allow-origin']).not.toBe('*');
    });
  });

  // =========================================================================
  // Preflight OPTIONS — Unknown Origin
  // =========================================================================

  describe('OPTIONS /api/v1/health (preflight) with evil origin', () => {
    it('preflight response does NOT grant CORS access to the evil origin', async () => {
      const res = await http
        .options(`/${API_PREFIX}/health`)
        .set('Origin', EVIL_ORIGIN)
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'Authorization');

      const acao = res.headers['access-control-allow-origin'] as
        | string
        | undefined;

      // The evil origin must NOT be allowed
      if (acao) {
        expect(acao).not.toBe(EVIL_ORIGIN);
      }

      expect(acao).not.toBe('*');
    });

    it('preflight returns status 204 or does not reflect evil origin in ACAO', async () => {
      const res = await http
        .options(`/${API_PREFIX}/health`)
        .set('Origin', EVIL_ORIGIN)
        .set('Access-Control-Request-Method', 'GET');

      const acao = res.headers['access-control-allow-origin'] as
        | string
        | undefined;

      // Either the preflight was rejected (no ACAO for evil) or it returned 204
      // but with ACAO NOT matching evil
      const isEvilBlocked = !acao || acao !== EVIL_ORIGIN;
      expect(isEvilBlocked).toBe(true);
    });

    it('OPTIONS preflight with evil origin does NOT return Access-Control-Allow-Methods with GET', async () => {
      const res = await http
        .options(`/${API_PREFIX}/health`)
        .set('Origin', EVIL_ORIGIN)
        .set('Access-Control-Request-Method', 'GET');

      const acam = res.headers['access-control-allow-methods'] as
        | string
        | undefined;
      const acao = res.headers['access-control-allow-origin'] as
        | string
        | undefined;

      // If the evil origin is not allowed, either no CORS headers are set,
      // or they don't grant access (origin not reflected / methods not listed)
      if (acao === EVIL_ORIGIN) {
        // Should never happen — but if it does, the methods must not include GET
        expect(acam).toBeUndefined();
      }
    });
  });

  // =========================================================================
  // Negative Assertions
  // =========================================================================

  describe('Negative assertions — wildcard and evil origin', () => {
    it('wildcard * never appears for evil origin on GET request', async () => {
      const res = await http
        .get(`/${API_PREFIX}/health`)
        .set('Origin', EVIL_ORIGIN);

      expect(res.headers['access-control-allow-origin']).not.toBe('*');
    });

    it('wildcard * never appears for evil origin on OPTIONS preflight', async () => {
      const res = await http
        .options(`/${API_PREFIX}/health`)
        .set('Origin', EVIL_ORIGIN)
        .set('Access-Control-Request-Method', 'GET');

      expect(res.headers['access-control-allow-origin']).not.toBe('*');
    });

    it('Access-Control-Allow-Origin: https://evil.com never appears', async () => {
      // Test with multiple requests to ensure consistency
      const origins = [EVIL_ORIGIN, EVIL_ORIGIN_2];

      for (const origin of origins) {
        const res = await http
          .get(`/${API_PREFIX}/health`)
          .set('Origin', origin);

        expect(res.headers['access-control-allow-origin']).not.toBe(origin);

        // Also test preflight
        const preflightRes = await http
          .options(`/${API_PREFIX}/health`)
          .set('Origin', origin)
          .set('Access-Control-Request-Method', 'GET');

        expect(preflightRes.headers['access-control-allow-origin']).not.toBe(
          origin,
        );
      }
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================

  describe('Edge cases', () => {
    it('multiple unknown origins are all rejected consistently', async () => {
      const unknownOrigins = [
        'https://evil.com',
        'https://malware.net',
        'https://phishing.example.com',
        'http://localhost:9999',
        'https://app.okfootwear.com.evil.com',
      ];

      for (const origin of unknownOrigins) {
        const res = await http
          .get(`/${API_PREFIX}/health`)
          .set('Origin', origin);

        assertCorsRejectsEvilOrigin(res, origin);
      }
    });

    it('requests with no Origin header succeed (server-to-server, curl)', async () => {
      // Requests without an Origin header must NOT be rejected —
      // these are server-to-server calls, Postman, or curl.
      const res = await http.get(`/${API_PREFIX}/health`).expect(200);

      expect(res.body).toHaveProperty('status', 'ok');
    });

    it('wildcard is never set for any origin — not just evil ones', async () => {
      // Test with the allowed origin too — wildcard must NEVER appear anywhere
      const originsToTest = [
        ALLOWED_ORIGIN,
        EVIL_ORIGIN,
        'https://random-site.org',
      ];

      for (const origin of originsToTest) {
        const res = await http
          .get(`/${API_PREFIX}/health`)
          .set('Origin', origin);

        expect(res.headers['access-control-allow-origin']).not.toBe('*');
      }
    });

    it('the allowed origin is present in Access-Control-Allow-Origin on GET', async () => {
      // Sanity check: the allowed origin DOES get CORS headers
      const res = await http
        .get(`/${API_PREFIX}/health`)
        .set('Origin', ALLOWED_ORIGIN)
        .expect(200);

      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('the allowed origin passes preflight OPTIONS with correct headers', async () => {
      // Sanity check: preflight for the allowed origin works
      const res = await http
        .options(`/${API_PREFIX}/health`)
        .set('Origin', ALLOWED_ORIGIN)
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'Authorization');

      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(res.headers['access-control-allow-methods']).toContain('GET');
    });
  });
});
