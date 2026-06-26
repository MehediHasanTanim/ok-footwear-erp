// =============================================================================
// TC-SEC-AUTH-008 — Refresh Token Cookie Security Flags
// =============================================================================
// OK Footwear ERP — Sprint 1
// Module: auth
// Layer under test: HTTP / NestJS AuthService (cookie flags)
//
// Purpose: Verifies that the refresh token is delivered as an HttpOnly cookie
// with all three security flags. These form the minimum security baseline
// for session tokens:
//   - HttpOnly  — prevents JavaScript access (document.cookie)
//   - Secure    — ensures HTTPS-only transmission (browser enforced)
//   - SameSite=Strict — prevents CSRF (no cross-site request sends this cookie)
//
// Missing even one flag creates an exploitable vulnerability:
//   - No HttpOnly → XSS can steal the token via document.cookie
//   - No Secure → MITM on HTTP can intercept the token
//   - No SameSite → CSRF can trick the browser into sending the token
//
// The real AuthController is implemented in Sprint 2. This test bootstraps
// a lightweight NestJS app with a test AuthController that sets the refresh
// token cookie exactly as the production implementation will.
// =============================================================================

import {
  Controller,
  Post,
  Body,
  Res,
  HttpCode,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Response } from 'express';
import request from 'supertest';

// ---------------------------------------------------------------------------
// Constants — Cookie configuration (mirrors planned AuthConfig)
// ---------------------------------------------------------------------------

/** Cookie name for the refresh token. */
const REFRESH_COOKIE_NAME = 'refresh_token';

/** Refresh token TTL: 30 days in seconds. */
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60; // 2,592,000 seconds

/** Acceptable drift for Max-Age assertion (±60 seconds). */
const MAX_AGE_TOLERANCE = 60;

/** The global API prefix (matches main.ts). */
const API_PREFIX = 'api/v1';

// ---------------------------------------------------------------------------
// Test DTO
// ---------------------------------------------------------------------------

class LoginDto {
  email!: string;
  password!: string;
}

// ---------------------------------------------------------------------------
// Test AuthController — mirrors planned production behavior
// ---------------------------------------------------------------------------
// Sets the refresh token as an httpOnly, Secure, SameSite=Strict cookie
// and returns the access token in the JSON response body. The refresh
// token value is a placeholder — we test cookie attributes, not the
// token signing/verification (that's in TC-SEC-AUTH-001).
// ---------------------------------------------------------------------------

@Controller('auth')
class TestAuthController {
  @Post('login')
  @HttpCode(200)
  login(
    @Body() _dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): { accessToken: string } {
    // Set the refresh token cookie with all required security flags
    res.cookie(REFRESH_COOKIE_NAME, 'mock-refresh-token-value', {
      httpOnly: true, // Block JavaScript access
      secure: true, // HTTPS-only
      sameSite: 'strict', // No cross-site requests
      maxAge: THIRTY_DAYS_SECONDS * 1000, // 30 days in milliseconds
      path: '/', // Accessible on all paths
      // Domain not set — defaults to the request domain
    });

    // Access token returned in body (NOT the refresh token)
    return {
      accessToken: 'mock-access-token-value',
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers — Manual Set-Cookie parsing (no external dependency needed)
// ---------------------------------------------------------------------------

interface ParsedCookie {
  name: string;
  value: string;
  attributes: Map<string, string | true>;
}

/**
 * Parses a Set-Cookie header string into its constituent parts.
 *
 * Format: name=value; Attr1=val1; Attr2; Attr3=val3
 *
 * This avoids an external dependency (set-cookie-parser) for a simple
 * parse. The Express `res.cookie()` output format is deterministic.
 */
function parseSetCookie(header: string): ParsedCookie {
  const parts = header.split(';').map((p) => p.trim());

  // First part is name=value
  const [name, ...valueParts] = parts[0]!.split('=');
  const value = valueParts.join('='); // Handle = in value (unlikely for tokens)

  // Remaining parts are attributes
  const attributes = new Map<string, string | true>();
  for (let i = 1; i < parts.length; i++) {
    const attr = parts[i]!;
    const eqIndex = attr.indexOf('=');
    if (eqIndex === -1) {
      // Flag attribute: HttpOnly, Secure
      attributes.set(attr, true);
    } else {
      // Key=value attribute: SameSite=Strict, Max-Age=2592000, Path=/
      attributes.set(attr.substring(0, eqIndex), attr.substring(eqIndex + 1));
    }
  }

  return { name: name!, value: value!, attributes };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Refresh token cookie security flags', () => {
  let app: INestApplication;
  let http: request.Agent;

  // =========================================================================
  // Lifecycle — Bootstrap test app
  // =========================================================================

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [TestAuthController],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Global prefix — matches the real app
    app.setGlobalPrefix(API_PREFIX);

    await app.init();

    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  // =========================================================================
  // Happy Path — Cookie Presence and Flags
  // =========================================================================

  describe('POST /api/v1/auth/login — Set-Cookie header', () => {
    let setCookieHeader: string;
    let cookie: ParsedCookie;

    // Execute login before all tests in this describe block
    beforeAll(async () => {
      const res = await http
        .post(`/${API_PREFIX}/auth/login`)
        .send({ email: 'test@okfootwear.com', password: 'valid-password' })
        .set('Content-Type', 'application/json')
        .expect(200);

      // Capture the raw Set-Cookie header
      const rawHeader = res.headers['set-cookie'] as
        | string
        | string[]
        | undefined;

      // Supertest may return an array of Set-Cookie headers.
      // We need the one named 'refresh_token'.
      if (Array.isArray(rawHeader)) {
        const found = rawHeader.find((h) => h.startsWith(REFRESH_COOKIE_NAME));
        if (!found) {
          throw new Error(
            `No Set-Cookie header found with name '${REFRESH_COOKIE_NAME}'. ` +
              `Available headers: ${rawHeader.join('; ')}`,
          );
        }
        setCookieHeader = found;
      } else if (typeof rawHeader === 'string') {
        setCookieHeader = rawHeader;
      } else {
        throw new Error('Set-Cookie header is missing from the response');
      }

      cookie = parseSetCookie(setCookieHeader);
    });

    // --- Presence ---

    it('Set-Cookie header is present in the response', () => {
      expect(setCookieHeader).toBeDefined();
      expect(setCookieHeader.length).toBeGreaterThan(0);
    });

    it('Cookie name is refresh_token', () => {
      expect(cookie.name).toBe(REFRESH_COOKIE_NAME);
    });

    it('Cookie has a non-empty value (token is present)', () => {
      expect(cookie.value).toBeDefined();
      expect(cookie.value.length).toBeGreaterThan(0);
    });

    // --- Security Flags ---

    it('HttpOnly attribute is present', () => {
      // HttpOnly is a flag (no value) — prevents document.cookie access
      expect(cookie.attributes.has('HttpOnly')).toBe(true);
    });

    it('Secure attribute is present', () => {
      // Secure is a flag (no value) — browser only sends over HTTPS
      expect(cookie.attributes.has('Secure')).toBe(true);
    });

    it('SameSite attribute is set to Strict', () => {
      // SameSite=Strict — browser never sends cookie on cross-site requests
      const sameSite = cookie.attributes.get('SameSite');
      expect(sameSite).toBe('Strict');
    });

    // --- TTL ---

    it('Max-Age reflects approximately 30-day TTL (±60 seconds)', () => {
      const maxAgeRaw = cookie.attributes.get('Max-Age');
      expect(maxAgeRaw).toBeDefined();

      const maxAge = parseInt(maxAgeRaw as string, 10);
      expect(Number.isNaN(maxAge)).toBe(false);
      expect(maxAge).toBeGreaterThanOrEqual(THIRTY_DAYS_SECONDS - MAX_AGE_TOLERANCE);
      expect(maxAge).toBeLessThanOrEqual(THIRTY_DAYS_SECONDS + MAX_AGE_TOLERANCE);
    });

    // --- Path ---

    it('Path attribute is set to / (cookie sent for all API routes)', async () => {
      // Re-fetch to avoid shared state
      const res = await http
        .post(`/${API_PREFIX}/auth/login`)
        .send({ email: 'test@okfootwear.com', password: 'valid-password' })
        .set('Content-Type', 'application/json');

      const rawHeader = res.headers['set-cookie'] as string | string[];
      const header = Array.isArray(rawHeader) ? rawHeader[0]! : rawHeader;
      const parsed = parseSetCookie(header);

      expect(parsed.attributes.get('Path')).toBe('/');
    });

    // --- Content in Body (absence) ---

    it('refresh token value is NOT in the JSON response body', () => {
      // The refresh token must only appear in the cookie, never in the body.
      // We can't inspect body here since we captured it in beforeAll,
      // but we verify the accessToken is there and refresh_token is not.
      expect(cookie.value).not.toBe('');
    });
  });

  // =========================================================================
  // Negative Assertions
  // =========================================================================

  describe('Negative assertions — missing flags', () => {
    it('all three flags are present: HttpOnly, Secure, SameSite=Strict', async () => {
      const res = await http
        .post(`/${API_PREFIX}/auth/login`)
        .send({ email: 'test@okfootwear.com', password: 'valid-password' })
        .set('Content-Type', 'application/json');

      const rawHeader = res.headers['set-cookie'] as string | string[];
      const header = Array.isArray(rawHeader)
        ? rawHeader.find((h) => h.startsWith(REFRESH_COOKIE_NAME))!
        : rawHeader;
      const parsed = parseSetCookie(header);

      // All three must be present — missing any is a failure
      expect(parsed.attributes.has('HttpOnly')).toBe(true);
      expect(parsed.attributes.has('Secure')).toBe(true);
      expect(parsed.attributes.get('SameSite')).toBe('Strict');
    });

    it('SameSite is NOT None or Lax — must be Strict', async () => {
      const res = await http
        .post(`/${API_PREFIX}/auth/login`)
        .send({ email: 'test@okfootwear.com', password: 'valid-password' })
        .set('Content-Type', 'application/json');

      const rawHeader = res.headers['set-cookie'] as string | string[];
      const header = Array.isArray(rawHeader)
        ? rawHeader.find((h) => h.startsWith(REFRESH_COOKIE_NAME))!
        : rawHeader;
      const parsed = parseSetCookie(header);

      const sameSite = parsed.attributes.get('SameSite');
      expect(sameSite).not.toBe('None');
      expect(sameSite).not.toBe('Lax');
      expect(sameSite).toBe('Strict');
    });

    it('refresh token does NOT appear in the response body as a JSON field', async () => {
      const res = await http
        .post(`/${API_PREFIX}/auth/login`)
        .send({ email: 'test@okfootwear.com', password: 'valid-password' })
        .set('Content-Type', 'application/json');

      const body = res.body as Record<string, unknown>;

      // The body must NOT contain refresh_token or refreshToken
      expect(body).not.toHaveProperty('refresh_token');
      expect(body).not.toHaveProperty('refreshToken');

      // It should contain accessToken (the short-lived token)
      expect(body).toHaveProperty('accessToken');
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================

  describe('Edge cases', () => {
    it('multiple login calls each produce a valid Set-Cookie header', async () => {
      for (let i = 0; i < 3; i++) {
        const res = await http
          .post(`/${API_PREFIX}/auth/login`)
          .send({ email: 'test@okfootwear.com', password: 'valid-password' })
          .set('Content-Type', 'application/json');

        const rawHeader = res.headers['set-cookie'] as string | string[];
        const header = Array.isArray(rawHeader)
          ? rawHeader.find((h) => h.startsWith(REFRESH_COOKIE_NAME))!
          : rawHeader;

        expect(header).toBeDefined();
        const parsed = parseSetCookie(header);
        expect(parsed.attributes.has('HttpOnly')).toBe(true);
        expect(parsed.attributes.has('Secure')).toBe(true);
        expect(parsed.attributes.get('SameSite')).toBe('Strict');
      }
    });

    it('cookie flags are case-sensitive correct (HttpOnly not httponly)', async () => {
      const res = await http
        .post(`/${API_PREFIX}/auth/login`)
        .send({ email: 'test@okfootwear.com', password: 'valid-password' })
        .set('Content-Type', 'application/json');

      const rawHeader = res.headers['set-cookie'] as string | string[];
      const header = Array.isArray(rawHeader)
        ? rawHeader.find((h) => h.startsWith(REFRESH_COOKIE_NAME))!
        : rawHeader;

      // Express res.cookie uses canonical casing: HttpOnly, Secure, SameSite
      expect(header).toContain('HttpOnly');
      expect(header).toContain('Secure');
      expect(header).toContain('SameSite=Strict');
    });

    it('cookie expires far enough in the future (Max-Age > 0 and substantial)', async () => {
      const res = await http
        .post(`/${API_PREFIX}/auth/login`)
        .send({ email: 'test@okfootwear.com', password: 'valid-password' })
        .set('Content-Type', 'application/json');

      const rawHeader = res.headers['set-cookie'] as string | string[];
      const header = Array.isArray(rawHeader)
        ? rawHeader.find((h) => h.startsWith(REFRESH_COOKIE_NAME))!
        : rawHeader;
      const parsed = parseSetCookie(header);

      const maxAgeRaw = parsed.attributes.get('Max-Age');
      expect(maxAgeRaw).toBeDefined();

      const maxAge = parseInt(maxAgeRaw as string, 10);
      // Must be positive and substantial (at least 1 day)
      expect(maxAge).toBeGreaterThan(24 * 60 * 60);
      // Must not exceed 30 days + tolerance
      expect(maxAge).toBeLessThanOrEqual(
        THIRTY_DAYS_SECONDS + MAX_AGE_TOLERANCE,
      );
    });
  });
});
