// =============================================================================
// TC-AUTH-U-002 — AuthService.refresh() Unit Tests
// =============================================================================
// OK Footwear ERP — Sprint 2
// Layer under test: AuthService.refresh()
//
// Covers all 8 acceptance criteria:
//   1. Valid refresh → new {accessToken, refreshToken}
//   2. Old token revoked_at set after refresh
//   3. Old hash in Redis blacklist with TTL
//   4. Reusing old token → 401 (replay protection)
//   5. Expired token → 401
//   6. Tampered/nonexistent token → 401
//   7. New token has fresh 30-day expiry
//   8. Audit log with event=token_refreshed
// =============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { AuthService } from '@modules/system/services/auth.service';
import { TotpService } from '@modules/system/services/totp.service';
import { AuditService } from '@modules/system/services/audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import { REDIS_AUTH } from '@infrastructure/redis/redis.constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a raw refresh token (48 random bytes → 96 hex chars). */
function rawToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

/** SHA-256 hash of a raw refresh token. */
function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/** Create a mock token DB row. */
function mockTokenRow(overrides: Partial<{
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}> = {}): Record<string, unknown> {
  return {
    id: overrides.id ?? 'tok-1',
    userId: overrides.userId ?? 'user-1',
    tokenHash: overrides.tokenHash ?? hashToken('mock-raw-token'),
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    revokedAt: overrides.revokedAt ?? null,
  };
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  refreshToken: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
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
// Test Suite
// ---------------------------------------------------------------------------

describe('AuthService.refresh()', () => {
  let service: AuthService;
  let validRawToken: string;
  let validHash: string;
  let validRow: Record<string, unknown>;

  beforeAll(() => {
    validRawToken = rawToken();
    validHash = hashToken(validRawToken);
    validRow = mockTokenRow({
      id: 'tok-valid',
      tokenHash: validHash,
    });
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default: valid token found, not blacklisted, user active
    mockPrisma.refreshToken.findUnique.mockResolvedValue(validRow);
    mockPrisma.refreshToken.update.mockResolvedValue({});
    mockPrisma.refreshToken.create.mockResolvedValue({});
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'test@test.com',
      firstName: 'Test',
      middleName: null,
      lastName: 'User',
      isActive: true,
    });
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    mockJwt.signAsync.mockResolvedValue('mock-access-token');
    mockRedis.exists.mockResolvedValue(0); // Not blacklisted
    mockRedis.set.mockResolvedValue('OK');
    mockAudit.log.mockResolvedValue('audit-id');

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
  // AC-1: Valid refresh → new token pair
  // =========================================================================

  describe('AC-1: Valid refresh token returns new {accessToken, refreshToken} pair', () => {
    it('returns accessToken and refreshToken on success', async () => {
      const result = await service.refresh(validRawToken);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.accessToken).not.toBe('');
      expect(result.refreshToken).not.toBe('');
    });

    it('returns user object with id, email, fullName, permissions', async () => {
      const result = await service.refresh(validRawToken);

      expect(result.user.id).toBe('user-1');
      expect(result.user.email).toBe('test@test.com');
      expect(result.user.fullName).toBe('Test User');
      expect(Array.isArray(result.user.permissions)).toBe(true);
    });

    it('new refresh token is different from the input token', async () => {
      const result = await service.refresh(validRawToken);

      expect(result.refreshToken).not.toBe(validRawToken);
    });
  });

  // =========================================================================
  // AC-2: Old token revoked_at set
  // =========================================================================

  describe('AC-2: Old refresh token is marked revoked_at in DB', () => {
    it('calls refreshToken.update with revokedAt set', async () => {
      await service.refresh(validRawToken);

      expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tok-valid' },
          data: expect.objectContaining({
            revokedAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  // =========================================================================
  // AC-3: Old hash blacklisted in Redis
  // =========================================================================

  describe('AC-3: Old token hash is in Redis blacklist with TTL', () => {
    it('adds old hash to Redis blacklist with EX option', async () => {
      await service.refresh(validRawToken);

      const blacklistKey = `blacklist:refresh:${validHash}`;
      expect(mockRedis.set).toHaveBeenCalledWith(
        blacklistKey,
        '1',
        'EX',
        expect.any(Number),
      );
    });

    it('TTL is positive and within remaining token lifetime', async () => {
      await service.refresh(validRawToken);

      const setCall = mockRedis.set.mock.calls[0] as [string, string, string, number];
      const ttl = setCall[3];
      expect(ttl).toBeGreaterThan(0);
      // TTL should be <= 30 days in seconds
      expect(ttl).toBeLessThanOrEqual(30 * 24 * 60 * 60 + 5);
    });
  });

  // =========================================================================
  // AC-4: Replay protection
  // =========================================================================

  describe('AC-4: Reusing old refresh token returns 401 (replay protection)', () => {
    it('rejects token when revokedAt is set', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(
        mockTokenRow({ tokenHash: validHash, revokedAt: new Date() }),
      );

      await expect(
        service.refresh(validRawToken),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects token when in Redis blacklist', async () => {
      mockRedis.exists.mockResolvedValue(1); // Blacklisted

      await expect(
        service.refresh(validRawToken),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // =========================================================================
  // AC-5: Expired token → 401
  // =========================================================================

  describe('AC-5: Expired refresh token returns 401', () => {
    it('rejects token past expires_at', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(
        mockTokenRow({
          tokenHash: validHash,
          expiresAt: new Date('2020-01-01'),
        }),
      );

      await expect(
        service.refresh(validRawToken),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // =========================================================================
  // AC-6: Tampered/nonexistent → 401
  // =========================================================================

  describe('AC-6: Tampered or nonexistent token returns 401', () => {
    it('rejects nonexistent token hash', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(
        service.refresh('nonexistent-token-string'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects tampered token (hash mismatch)', async () => {
      const tamperedToken = rawToken(); // Different from validRawToken
      mockPrisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(
        service.refresh(tamperedToken),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // =========================================================================
  // AC-7: New token has fresh 30-day expiry
  // =========================================================================

  describe('AC-7: New refresh token has fresh 30-day expiry', () => {
    it('creates new refreshToken row with 30-day expiresAt', async () => {
      await service.refresh(validRawToken);

      const createCall = mockPrisma.refreshToken.create.mock.calls[0] as [
        { data: { expiresAt: Date } },
      ];

      const expiresAt = createCall[0].data.expiresAt;
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      const diff = expiresAt.getTime() - Date.now();

      expect(diff).toBeGreaterThan(thirtyDaysMs - 5000);
      expect(diff).toBeLessThan(thirtyDaysMs + 5000);
    });
  });

  // =========================================================================
  // AC-8: Audit log with event=token_refreshed
  // =========================================================================

  describe('AC-8: Audit log written with event=token_refreshed', () => {
    it('calls auditService.log with token_refreshed event', async () => {
      await service.refresh(validRawToken);

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: 'auth_events',
          action: 'INSERT',
          newValue: expect.objectContaining({
            event: 'token_refreshed',
          }),
        }),
      );
    });

    it('audit log includes email and IP', async () => {
      await service.refresh(validRawToken, {
        ipAddress: '192.168.1.100',
        userAgent: 'TestBrowser/1.0',
      });

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          newValue: expect.objectContaining({
            event: 'token_refreshed',
            email: 'test@test.com',
            ip: '192.168.1.100',
            user_agent: 'TestBrowser/1.0',
          }),
        }),
      );
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================

  describe('Edge cases', () => {
    it('rejects when user is inactive', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        firstName: 'Inactive',
        middleName: null,
        lastName: 'User',
        isActive: false,
      });

      await expect(
        service.refresh(validRawToken),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when user is deleted (not found)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.refresh(validRawToken),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('replay attempt logs token_replay_attempt audit event', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(
        mockTokenRow({ tokenHash: validHash, revokedAt: new Date() }),
      );

      try {
        await service.refresh(validRawToken);
      } catch {
        // Expected
      }

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          newValue: expect.objectContaining({
            event: 'token_replay_attempt',
          }),
        }),
      );
    });
  });
});
