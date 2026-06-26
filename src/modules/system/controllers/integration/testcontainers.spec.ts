/**
 * Integration test — verifies PostgreSQL and Redis are reachable.
 *
 * This is a smoke test for the testcontainers setup. It validates:
 *   1. PostgreSQL container is running and Prisma can connect.
 *   2. Transaction rollback works (data inserted in one test is invisible
 *      in the next test).
 *   3. Redis container is running and ioredis can PING.
 */

import { prisma } from '@test/helpers/integration-test-setup';

describe('Testcontainers — PostgreSQL + Redis connectivity', () => {
  describe('PostgreSQL via Prisma', () => {
    it('connects to the test database', async () => {
      // Raw query — the simplest possible DB interaction
      const result = await prisma.$queryRawUnsafe<Array<{ one: number }>>(
        'SELECT 1 AS one',
      );
      expect(result[0]!.one).toBe(1);
    });

    it('transaction rollback: inserted data does NOT persist', async () => {
      // Insert a Role via raw SQL (avoids needing the full Prisma schema setup)
      await prisma.$executeRawUnsafe(
        `INSERT INTO sys.roles (id, name, is_system, created_at, updated_at)
         VALUES (gen_random_uuid(), 'test-role', true, NOW(), NOW())`,
      );

      // Data should be visible within the same test (same transaction)
      const count = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        "SELECT COUNT(*) as count FROM sys.roles WHERE name = 'test-role'",
      );
      expect(Number(count[0]!.count)).toBe(1);
    });

    it('rollback verified: previous insert is gone', async () => {
      // The ROLLBACK from the previous test's afterEach should have
      // removed this data
      const count = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        "SELECT COUNT(*) as count FROM sys.roles WHERE name = 'test-role'",
      );
      expect(Number(count[0]!.count)).toBe(0);
    });
  });

  describe('Redis via ioredis', () => {
    it('pings Redis successfully', async () => {
      const Redis = (await import('ioredis')).default;
      const redisUrl = process.env['TEST_REDIS_URL'];

      if (!redisUrl) {
        throw new Error('TEST_REDIS_URL not set — globalSetup may have failed');
      }

      const redis = new Redis(redisUrl, {
        lazyConnect: true,
        connectTimeout: 5_000,
      });

      try {
        await redis.connect();
        const pong = await redis.ping();
        expect(pong).toBe('PONG');
      } finally {
        await redis.quit();
      }
    });
  });
});
