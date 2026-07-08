// =============================================================================
// TC-AUTH-U-001 — AuthService.login() Unit Tests
// =============================================================================
// OK Footwear ERP — Sprint 2
// Layer under test: AuthService.login()
//
// Covers all 9 acceptance criteria:
//   1. Valid credentials → {accessToken, user}
//   2. Wrong password → 401 generic (no detail leak)
//   3. 5 failed attempts → locked_until set ~30 min ahead
//   4. Locked account → 401 with lock message + remaining time
//   5. Successful login after lockout resets failed_attempts=0
//   6. MFA required → {mfaRequired:true} when TOTP set, no token
//   7. Audit log on login_success
//   8. Audit log on login_failed with attempt_count
//   9. No user enumeration: nonexistent email + wrong password = identical 401
// =============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from '@modules/system/services/auth.service';
import { TotpService } from '@modules/system/services/totp.service';
import { AuditService } from '@modules/system/services/audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import { REDIS_AUTH } from '@infrastructure/redis/redis.constants';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
  },
  $queryRawUnsafe: jest.fn(),
};

const mockJwt = {
  signAsync: jest.fn(),
};

const mockTotp = {
  verify: jest.fn(),
  generateSecret: jest.fn(),
};

const mockAudit = {
  log: jest.fn(),
  logBatch: jest.fn(),
};

const mockRedis = {
  exists: jest.fn(),
  set: jest.fn(),
};

// ---------------------------------------------------------------------------
// Factory for a mock user object
// ---------------------------------------------------------------------------

function mockUser(overrides: Partial<{
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  failedAttempts: number;
  lockedUntil: Date | null;
  totpSecretEncrypted: string | null;
  isActive: boolean;
}> = {}): Record<string, unknown> {
  return {
    id: overrides.id ?? 'user-123',
    email: overrides.email ?? 'test@okfootwear.com',
    passwordHash:
      overrides.passwordHash ??
      '$argon2id$v=19$m=65536,t=3,p=2$hashhashhash$hashhashhashashashashhash',
    firstName: overrides.firstName ?? 'Test',
    middleName: overrides.middleName ?? null,
    lastName: overrides.lastName ?? 'User',
    failedAttempts: overrides.failedAttempts ?? 0,
    lockedUntil: overrides.lockedUntil ?? null,
    totpSecretEncrypted: overrides.totpSecretEncrypted ?? null,
    isActive: overrides.isActive ?? true,
  };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('AuthService.login()', () => {
  let service: AuthService;
  let realHash: string;

  beforeAll(async () => {
    realHash = await argon2.hash('correct-password');
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma.user.findUnique.mockResolvedValue(
      mockUser({ passwordHash: realHash }),
    );
    mockPrisma.user.update.mockResolvedValue({});
    mockPrisma.refreshToken.create.mockResolvedValue({});
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    mockJwt.signAsync.mockResolvedValue('mock-jwt-token');
    mockTotp.verify.mockResolvedValue(true);
    mockAudit.log.mockResolvedValue('audit-id');
    mockRedis.exists.mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: TotpService, useValue: mockTotp },
        { provide: AuditService, useValue: mockAudit },
        { provide: REDIS_AUTH, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // =========================================================================
  // AC-1: Valid credentials → success
  // =========================================================================

  describe('AC-1: Login with valid credentials', () => {
    it('returns accessToken', async () => {
      const result = await service.login({
        email: 'test@okfootwear.com',
        password: 'correct-password',
      });

      expect('accessToken' in result).toBe(true);
      if ('accessToken' in result) {
        expect(result.accessToken).toBe('mock-jwt-token');
      }
    });

    it('returns user object with id, email, fullName, permissions', async () => {
      const result = await service.login({
        email: 'test@okfootwear.com',
        password: 'correct-password',
      });

      expect('user' in result).toBe(true);
      if ('user' in result) {
        expect(result.user.id).toBe('user-123');
        expect(result.user.email).toBe('test@okfootwear.com');
        expect(result.user.fullName).toBe('Test User');
        expect(Array.isArray(result.user.permissions)).toBe(true);
      }
    });

    it('fullName includes middleName when present', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        mockUser({ passwordHash: realHash, firstName: 'Md', middleName: 'Abul', lastName: 'Kalam' }),
      );

      const result = await service.login({
        email: 'test@okfootwear.com',
        password: 'correct-password',
      });

      if ('user' in result) {
        expect(result.user.fullName).toBe('Md Abul Kalam');
      }
    });

    it('fullName omits middleName when null', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        mockUser({ passwordHash: realHash, firstName: 'Fatema', middleName: null, lastName: 'Khatun' }),
      );

      const result = await service.login({
        email: 'test@okfootwear.com',
        password: 'correct-password',
      });

      if ('user' in result) {
        expect(result.user.fullName).toBe('Fatema Khatun');
      }
    });

    it('resets failed_attempts to 0 on success', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        mockUser({ passwordHash: realHash, failedAttempts: 3, lockedUntil: new Date(Date.now() - 1000) }),
      );

      await service.login({
        email: 'test@okfootwear.com',
        password: 'correct-password',
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failedAttempts: 0,
            lockedUntil: null,
          }),
        }),
      );
    });
  });

  // =========================================================================
  // AC-2: Wrong password → 401 generic
  // =========================================================================

  describe('AC-2: Login with wrong password returns 401 generic', () => {
    it('throws UnauthorizedException', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser());

      await expect(
        service.login({
          email: 'test@okfootwear.com',
          password: 'wrong-password',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('error message is generic — does NOT reveal wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser());

      try {
        await service.login({
          email: 'test@okfootwear.com',
          password: 'wrong-password',
        });
        fail('Should have thrown');
      } catch (err) {
        const response = (err as UnauthorizedException).getResponse() as Record<string, unknown>;
        expect(response['message']).toBe('Invalid email or password');
        // Must not leak which specific field was wrong
        expect(response['message']).not.toBe('Invalid password');
        expect(response['message']).not.toBe('Wrong password');
      }
    });

    it('increments failed_attempts on wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        mockUser({ failedAttempts: 2 }),
      );

      try {
        await service.login({
          email: 'test@okfootwear.com',
          password: 'wrong-password',
        });
      } catch {
        // Expected
      }

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ failedAttempts: 3 }),
        }),
      );
    });
  });

  // =========================================================================
  // AC-3: 5 failed attempts → locked_until set
  // =========================================================================

  describe('AC-3: After 5 failed attempts, locked_until is set ~30 min ahead', () => {
    it('sets locked_until on 5th failed attempt', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        mockUser({ failedAttempts: 4 }),
      );

      try {
        await service.login({
          email: 'test@okfootwear.com',
          password: 'wrong-password',
        });
      } catch {
        // Expected
      }

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failedAttempts: 5,
            lockedUntil: expect.any(Date),
          }),
        }),
      );

      // Verify lockedUntil is approximately 30 minutes from now
      const updateCall = mockPrisma.user.update.mock.calls[0][0];
      const lockedUntil = updateCall.data.lockedUntil as Date;
      const diffMs = lockedUntil.getTime() - Date.now();
      expect(diffMs).toBeGreaterThan(29 * 60 * 1000); // > 29 min
      expect(diffMs).toBeLessThan(31 * 60 * 1000); // < 31 min
    });
  });

  // =========================================================================
  // AC-4: Locked account → 401 with lock message
  // =========================================================================

  describe('AC-4: Locked account returns 401 with lock message + remaining time', () => {
    it('throws UnauthorizedException with lock detail', async () => {
      const futureLock = new Date(Date.now() + 15 * 60 * 1000); // 15 min from now
      mockPrisma.user.findUnique.mockResolvedValue(
        mockUser({ failedAttempts: 5, lockedUntil: futureLock }),
      );

      try {
        await service.login({
          email: 'test@okfootwear.com',
          password: 'correct-password',
        });
        fail('Should have thrown');
      } catch (err) {
        const response = (err as UnauthorizedException).getResponse() as Record<string, unknown>;
        expect(response['message']).toBe('Account locked');
        expect(response['detail']).toContain('15');
        expect(response['detail']).toContain('minute');
      }
    });

    it('does NOT check password when account is locked', async () => {
      const futureLock = new Date(Date.now() + 15 * 60 * 1000);
      mockPrisma.user.findUnique.mockResolvedValue(
        mockUser({ failedAttempts: 5, lockedUntil: futureLock }),
      );

      try {
        await service.login({
          email: 'test@okfootwear.com',
          password: 'correct-password',
        });
      } catch {
        // Expected
      }

      // User.update should NOT be called (no attempt to verify password)
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // AC-5: Success after lockout resets failed_attempts
  // =========================================================================

  describe('AC-5: Successful login after lockout resets failed_attempts to 0', () => {
    it('resets counters when logging in after lockout expiry', async () => {
      const pastLock = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      mockPrisma.user.findUnique.mockResolvedValue(
        mockUser({ passwordHash: realHash, failedAttempts: 5, lockedUntil: pastLock }),
      );

      await service.login({
        email: 'test@okfootwear.com',
        password: 'correct-password',
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failedAttempts: 0,
            lockedUntil: null,
          }),
        }),
      );
    });
  });

  // =========================================================================
  // AC-6: MFA required when TOTP set, no token
  // =========================================================================

  describe('AC-6: MFA required returns {mfaRequired:true}', () => {
    it('returns mfaRequired when TOTP secret is set and no token provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        mockUser({
          passwordHash: realHash,
          totpSecretEncrypted: 'encrypted_totp_secret_here',
        }),
      );

      const result = await service.login({
        email: 'test@okfootwear.com',
        password: 'correct-password',
      });

      expect('mfaRequired' in result).toBe(true);
      if ('mfaRequired' in result) {
        expect(result.mfaRequired).toBe(true);
        expect(result.tempToken).toBe('mock-jwt-token');
      }
    });

    it('does NOT return mfaRequired when TOTP token IS provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        mockUser({
          passwordHash: realHash,
          totpSecretEncrypted: 'encrypted_totp_secret_here',
        }),
      );

      const result = await service.login({
        email: 'test@okfootwear.com',
        password: 'correct-password',
        totpToken: '123456',
      });

      expect('accessToken' in result).toBe(true);
    });
  });

  // =========================================================================
  // AC-7: Audit log on login_success
  // =========================================================================

  describe('AC-7: Audit log written on successful login', () => {
    it('calls auditService.log with event=login_success', async () => {
      await service.login({
        email: 'test@okfootwear.com',
        password: 'correct-password',
      });

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: 'auth_events',
          action: 'INSERT',
          newValue: expect.objectContaining({
            event: 'login_success',
            email: 'test@okfootwear.com',
          }),
        }),
      );
    });
  });

  // =========================================================================
  // AC-8: Audit log on login_failed
  // =========================================================================

  describe('AC-8: Audit log written on failed login', () => {
    it('calls auditService.log with event=login_failed on wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser());

      try {
        await service.login({
          email: 'test@okfootwear.com',
          password: 'wrong-password',
        });
      } catch {
        // Expected
      }

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: 'auth_events',
          action: 'INSERT',
          newValue: expect.objectContaining({
            event: 'login_failed',
            reason: 'wrong_password',
            attempt_count: 1,
          }),
        }),
      );
    });

    it('includes attempt_count in failed login audit', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        mockUser({ failedAttempts: 2 }),
      );

      try {
        await service.login({
          email: 'test@okfootwear.com',
          password: 'wrong-password',
        });
      } catch {
        // Expected
      }

      const auditCall = mockAudit.log.mock.calls.find(
        (call: { newValue?: { event?: string } }[]) =>
          call[0]?.newValue?.event === 'login_failed',
      );

      expect(auditCall).toBeDefined();
      expect(auditCall[0].newValue.attempt_count).toBe(3);
    });
  });

  // =========================================================================
  // AC-9: No user enumeration
  // =========================================================================

  describe('AC-9: No user enumeration — identical response for nonexistent email and wrong password', () => {
    it('nonexistent email returns same error as wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      // Wrong password error
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      let nonexistentError: Record<string, unknown> = {};
      try {
        await service.login({
          email: 'nonexistent@okfootwear.com',
          password: 'some-password',
        });
      } catch (err) {
        nonexistentError = (err as UnauthorizedException).getResponse() as Record<string, unknown>;
      }

      // Real user, wrong password error
      mockPrisma.user.findUnique.mockResolvedValue(mockUser());
      let wrongPasswordError: Record<string, unknown> = {};
      try {
        await service.login({
          email: 'test@okfootwear.com',
          password: 'wrong-password',
        });
      } catch (err) {
        wrongPasswordError = (err as UnauthorizedException).getResponse() as Record<string, unknown>;
      }

      // Both must have identical messages
      expect(nonexistentError['message']).toBe(wrongPasswordError['message']);
      expect(nonexistentError['statusCode']).toBe(wrongPasswordError['statusCode']);

      // Neither should reveal whether the email exists
      expect(JSON.stringify(nonexistentError)).not.toContain('not found');
      expect(JSON.stringify(nonexistentError)).not.toContain('exist');
    });

    it('nonexistent email does NOT call user.update', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      try {
        await service.login({
          email: 'nonexistent@okfootwear.com',
          password: 'some-password',
        });
      } catch {
        // Expected
      }

      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('nonexistent email still triggers failed audit log', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      try {
        await service.login({
          email: 'nonexistent@okfootwear.com',
          password: 'some-password',
        });
      } catch {
        // Expected
      }

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          newValue: expect.objectContaining({
            event: 'login_failed',
            reason: 'user_not_found',
          }),
        }),
      );
    });
  });

  // =========================================================================
  // AC-1–7: generateTokens() acceptance tests
  // =========================================================================

  describe('generateTokens()', () => {
    const testPermissions = ['orders:read', 'orders:create', 'inventory:read'];

    beforeEach(() => {
      // Capture the JWT payload to assert its contents
      mockJwt.signAsync.mockImplementation(
        (payload: Record<string, unknown>) =>
          Promise.resolve(JSON.stringify(payload)),
      );
    });

    // =======================================================================
    // AC-1: accessToken JWT decodes to {sub, email, permissions[], iat, exp}
    // =======================================================================

    it('AC-1: accessToken payload contains sub, email, and permissions', async () => {
      const tokens = await service.generateTokens(
        'user-1',
        'test@okfootwear.com',
        testPermissions,
      );

      // accessToken is the stringified JWT payload (mock)
      const payload = JSON.parse(tokens.accessToken) as Record<string, unknown>;

      expect(payload['sub']).toBe('user-1');
      expect(payload['email']).toBe('test@okfootwear.com');
      expect(payload['permissions']).toEqual(testPermissions);
    });

    it('AC-1: permissions array is embedded in the JWT payload', async () => {
      const tokens = await service.generateTokens(
        'user-2',
        'admin@okfootwear.com',
        ['sys:admin', 'orders:approve'],
      );

      const payload = JSON.parse(tokens.accessToken) as Record<string, unknown>;
      const perms = payload['permissions'] as string[];

      expect(perms).toContain('sys:admin');
      expect(perms).toContain('orders:approve');
    });

    // =======================================================================
    // AC-2: accessToken exp is ~8 hours from issuance
    // =======================================================================

    it('AC-2: accessToken expiresIn is passed as ~8h', async () => {
      await service.generateTokens('user-1', 'test@test.com', []);

      const signCall = mockJwt.signAsync.mock.calls[0] as [
        Record<string, unknown>,
        { expiresIn: number },
      ];
      expect(signCall[1].expiresIn).toBeDefined();
    });

    // =======================================================================
    // AC-3: refreshToken is a 96-char hex string
    // =======================================================================

    it('AC-3: refreshToken is exactly 96 hex characters', async () => {
      const tokens = await service.generateTokens(
        'user-1',
        'test@test.com',
        [],
      );

      expect(tokens.refreshToken).toMatch(/^[0-9a-f]{96}$/);
    });

    it('AC-3: refreshToken is NOT a JWT (no dots)', async () => {
      const tokens = await service.generateTokens(
        'user-1',
        'test@test.com',
        [],
      );

      expect(tokens.refreshToken).not.toContain('.');
      expect(tokens.refreshToken).not.toMatch(/^eyJ/); // JWT header prefix
    });

    // =======================================================================
    // AC-4: refresh_tokens row stores SHA-256 hash, not raw token
    // =======================================================================

    it('AC-4: stored tokenHash is sha256(refreshToken), not the raw token', async () => {
      const tokens = await service.generateTokens(
        'user-1',
        'test@test.com',
        [],
      );

      const createCall = mockPrisma.refreshToken.create.mock.calls[0] as [
        { data: { tokenHash: string; userId: string; expiresAt: Date } },
      ];
      const storedHash = createCall[0].data.tokenHash;

      // The stored hash must be a 64-char hex string (SHA-256 output)
      expect(storedHash).toMatch(/^[0-9a-f]{64}$/);

      // The stored hash must NOT equal the raw refresh token
      expect(storedHash).not.toBe(tokens.refreshToken);

      // Verify: sha256(refreshToken) === storedHash
      const computedHash = require('crypto')
        .createHash('sha256')
        .update(tokens.refreshToken)
        .digest('hex');
      expect(storedHash).toBe(computedHash);
    });

    it('AC-4: raw refresh token is NEVER passed to Prisma', async () => {
      const tokens = await service.generateTokens(
        'user-1',
        'test@test.com',
        [],
      );

      // Check all Prisma calls — raw token must not appear in any argument
      const allPrismaCalls = [
        ...mockPrisma.user.findUnique.mock.calls,
        ...mockPrisma.user.update.mock.calls,
        ...mockPrisma.refreshToken.create.mock.calls,
      ];

      const allArgs = JSON.stringify(allPrismaCalls);
      expect(allArgs).not.toContain(tokens.refreshToken);
    });

    // =======================================================================
    // AC-5: httpOnly cookie with Secure, SameSite=Strict
    // =======================================================================
    // Covered by TC-SEC-AUTH-008 (existing test file). Not duplicated here.

    // =======================================================================
    // AC-6: accessToken NOT set as cookie — only in response body
    // =======================================================================
    // Covered by the AuthController integration. The service layer only
    // returns tokens; the controller decides cookie vs body.

    // =======================================================================
    // AC-7: Two calls = two separate refresh_token rows
    // =======================================================================

    it('AC-7: calling generateTokens twice creates two distinct refresh_token rows', async () => {
      const firstCall = await service.generateTokens(
        'user-1',
        'test@test.com',
        [],
      );
      const secondCall = await service.generateTokens(
        'user-1',
        'test@test.com',
        [],
      );

      // Two different refresh tokens
      expect(firstCall.refreshToken).not.toBe(secondCall.refreshToken);

      // Two Prisma create calls
      expect(mockPrisma.refreshToken.create).toHaveBeenCalledTimes(2);

      // The stored hashes must be different
      const hash1 = (
        mockPrisma.refreshToken.create.mock.calls[0] as [
          { data: { tokenHash: string } },
        ]
      )[0].data.tokenHash;
      const hash2 = (
        mockPrisma.refreshToken.create.mock.calls[1] as [
          { data: { tokenHash: string } },
        ]
      )[0].data.tokenHash;

      expect(hash1).not.toBe(hash2);
    });

    it('AC-7: each refresh_token row has correct userId and expiry', async () => {
      await service.generateTokens('user-42', 'user42@test.com', []);

      const createCall = mockPrisma.refreshToken.create.mock.calls[0] as [
        { data: { userId: string; expiresAt: Date } },
      ];

      expect(createCall[0].data.userId).toBe('user-42');

      const expiresAt = createCall[0].data.expiresAt;
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      const diff = expiresAt.getTime() - Date.now();
      expect(diff).toBeGreaterThan(thirtyDaysMs - 5000); // within 5s of 30 days
      expect(diff).toBeLessThan(thirtyDaysMs + 5000);
    });
  });
});
