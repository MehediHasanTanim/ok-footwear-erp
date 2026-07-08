// =============================================================================
// TC-AUTH-U-007 — AuthService.getUserPermissions() Redis Cache Tests
// =============================================================================
// OK Footwear ERP — Sprint 2
// Layer under test: AuthService.getUserPermissions() + invalidatePermissions()
//
// Covers all 6 acceptance criteria:
//   1. First call hits DB and sets Redis key with TTL ~300s
//   2. Second call within TTL hits Redis (no DB query)
//   3. Role change → cache invalidated → returns updated permissions
//   4. Returns empty array for user with no roles
//   5. Permissions array shape: [{module, action}] → "module:action" strings
//   6. Redis key format: permissions:{userId}
// =============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '@modules/system/services/auth.service';
import { TotpService } from '@modules/system/services/totp.service';
import { AuditService } from '@modules/system/services/audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import { REDIS_AUTH } from '@infrastructure/redis/redis.constants';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const DB_PERMISSION_ROWS = [
  { module: 'orders', action: 'read' },
  { module: 'orders', action: 'create' },
  { module: 'inventory', action: 'read' },
];

const CACHED_PERMISSIONS = JSON.stringify([
  'orders:read',
  'orders:create',
  'inventory:read',
]);

const mockPrisma = {
  user: { findUnique: jest.fn(), update: jest.fn() },
  refreshToken: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  $queryRawUnsafe: jest.fn(),
};

const mockJwt = { signAsync: jest.fn() };
const mockTotp = { verify: jest.fn(), generateSecret: jest.fn() };
const mockAudit = { log: jest.fn(), logBatch: jest.fn() };

// Redis mock with internal state to simulate cache behavior
function createRedisMock() {
  let store = new Map<string, string>();
  return {
    get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: jest.fn(
      (key: string, value: string, _mode: string, _ttl: number) => {
        store.set(key, value);
        return Promise.resolve('OK');
      },
    ),
    del: jest.fn((key: string) => {
      store.delete(key);
      return Promise.resolve(1);
    }),
    exists: jest.fn(),
    // Reset for clean tests
    _reset: () => {
      store = new Map();
    },
  };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('AuthService.getUserPermissions()', () => {
  let service: AuthService;
  let mockRedis: ReturnType<typeof createRedisMock>;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockRedis = createRedisMock();

    mockPrisma.$queryRawUnsafe.mockResolvedValue(DB_PERMISSION_ROWS);
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
  // AC-1: First call hits DB and sets Redis
  // =========================================================================

  describe('AC-1: First call hits DB and sets Redis key with TTL ~300s', () => {
    it('queries the database on first call (cache miss)', async () => {
      await service.getUserPermissions('user-1');

      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('sys.permissions'),
        'user-1',
      );
    });

    it('sets Redis key with TTL 300 seconds after DB query', async () => {
      await service.getUserPermissions('user-1');

      expect(mockRedis.set).toHaveBeenCalledWith(
        'permissions:user-1',
        CACHED_PERMISSIONS,
        'EX',
        300,
      );
    });

    it('returns correct permission strings', async () => {
      const perms = await service.getUserPermissions('user-1');

      expect(perms).toEqual([
        'orders:read',
        'orders:create',
        'inventory:read',
      ]);
    });
  });

  // =========================================================================
  // AC-2: Second call hits Redis (no DB)
  // =========================================================================

  describe('AC-2: Second call within TTL hits Redis (no DB query)', () => {
    it('first call populates cache, second call reads from Redis', async () => {
      // First call — populates cache
      await service.getUserPermissions('user-1');
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);

      // Second call — should hit Redis, NOT DB
      const perms = await service.getUserPermissions('user-1');

      // DB should not be called again
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
      expect(perms).toEqual([
        'orders:read',
        'orders:create',
        'inventory:read',
      ]);
    });

    it('Redis get is called on the second request', async () => {
      await service.getUserPermissions('user-1'); // Populate
      await service.getUserPermissions('user-1'); // Cache hit

      // Redis.get should have been called twice (once for miss, once for hit)
      expect(mockRedis.get).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // AC-3: Cache invalidation after role change
  // =========================================================================

  describe('AC-3: Role change invalidates cache → returns updated permissions', () => {
    it('after invalidation, next call queries DB again', async () => {
      // Populate cache
      await service.getUserPermissions('user-1');

      // Invalidate
      await service.invalidatePermissions('user-1');

      // Next call should hit DB
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        { module: 'orders', action: 'read' },
        { module: 'orders', action: 'create' },
        { module: 'orders', action: 'approve' },
        { module: 'inventory', action: 'read' },
      ]);

      const perms = await service.getUserPermissions('user-1');

      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
      expect(perms).toContain('orders:approve');
      expect(perms).toHaveLength(4);
    });

    it('invalidatePermissions calls Redis DEL', async () => {
      await service.invalidatePermissions('user-42');

      expect(mockRedis.del).toHaveBeenCalledWith('permissions:user-42');
    });

    it('cache key is correctly formed with userId', async () => {
      await service.getUserPermissions('abc-123-def');

      expect(mockRedis.set).toHaveBeenCalledWith(
        'permissions:abc-123-def',
        expect.any(String),
        'EX',
        300,
      );
    });
  });

  // =========================================================================
  // AC-4: Empty array for user with no roles
  // =========================================================================

  describe('AC-4: Returns empty array for user with no roles (not an error)', () => {
    it('returns [] when DB returns no rows', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      const perms = await service.getUserPermissions('no-role-user');

      expect(perms).toEqual([]);
      expect(perms).toHaveLength(0);
    });

    it('caches the empty array too', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      await service.getUserPermissions('no-role-user');

      expect(mockRedis.set).toHaveBeenCalledWith(
        'permissions:no-role-user',
        '[]',
        'EX',
        300,
      );
    });
  });

  // =========================================================================
  // AC-5: Permissions array shape
  // =========================================================================

  describe('AC-5: Permissions format is "module:action" strings', () => {
    it('each permission is in "module:action" format', async () => {
      const perms = await service.getUserPermissions('user-1');

      for (const perm of perms) {
        expect(perm).toMatch(/^[a-z_]+:[a-z_]+$/);
        expect(perm.split(':')).toHaveLength(2);
      }
    });

    it('permissions are sorted by module, then action', async () => {
      // DB returns rows sorted by ORDER BY p.module, p.action
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        { module: 'inventory', action: 'read' },
        { module: 'inventory', action: 'write' },
        { module: 'orders', action: 'approve' },
        { module: 'orders', action: 'create' },
      ]);

      const perms = await service.getUserPermissions('user-1');

      // DB query has ORDER BY p.module, p.action
      expect(perms[0]).toBe('inventory:read');
      expect(perms[1]).toBe('inventory:write');
      expect(perms[2]).toBe('orders:approve');
      expect(perms[3]).toBe('orders:create');
    });
  });

  // =========================================================================
  // AC-6: Redis key format
  // =========================================================================

  describe('AC-6: Redis key format is exactly permissions:{userId}', () => {
    it('uses key format permissions:{userId}', async () => {
      await service.getUserPermissions('user-uuid-123');

      expect(mockRedis.get).toHaveBeenCalledWith('permissions:user-uuid-123');
      expect(mockRedis.set).toHaveBeenCalledWith(
        'permissions:user-uuid-123',
        expect.any(String),
        'EX',
        300,
      );
    });

    it('key format works with UUID-formatted userIds', async () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      await service.getUserPermissions(uuid);

      expect(mockRedis.get).toHaveBeenCalledWith(
        `permissions:${uuid}`,
      );
    });

    it('calling for two different users uses different keys', async () => {
      await service.getUserPermissions('user-a');
      await service.getUserPermissions('user-b');

      expect(mockRedis.set).toHaveBeenCalledWith(
        'permissions:user-a',
        expect.any(String),
        'EX',
        300,
      );
      expect(mockRedis.set).toHaveBeenCalledWith(
        'permissions:user-b',
        expect.any(String),
        'EX',
        300,
      );
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================

  describe('Edge cases', () => {
    it('falls back to DB when Redis.get throws', async () => {
      mockRedis.get.mockRejectedValueOnce(new Error('Connection refused'));

      const perms = await service.getUserPermissions('user-1');

      // Should still return data from DB
      expect(perms).toEqual([
        'orders:read',
        'orders:create',
        'inventory:read',
      ]);
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    });

    it('succeeds even when Redis.set throws (fire-and-forget)', async () => {
      mockRedis.set.mockRejectedValueOnce(new Error('OOM'));

      const perms = await service.getUserPermissions('user-1');

      // Should still return correct data from DB
      expect(perms).toEqual([
        'orders:read',
        'orders:create',
        'inventory:read',
      ]);
    });

    it('invalidatePermissions handles Redis.del failure gracefully', async () => {
      mockRedis.del.mockRejectedValueOnce(new Error('Connection refused'));

      // Should not throw
      await expect(
        service.invalidatePermissions('user-1'),
      ).resolves.toBeUndefined();
    });
  });
});
