// =============================================================================
// Integration Test — Global Setup (JavaScript)
// =============================================================================
// Jest runs globalSetup in a separate process without ts-jest, so this file
// uses plain CommonJS. It starts real PostgreSQL 16 and Redis 7 containers
// via testcontainers and writes connection strings to environment variables.

const {
  PostgreSqlContainer,
} = require('@testcontainers/postgresql');
const { RedisContainer } = require('@testcontainers/redis');

module.exports = async function globalSetup() {
  // -------------------------------------------------------------------
  // PostgreSQL 16
  // -------------------------------------------------------------------
  const pgContainer = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('ok_footwear_erp')
    .withUsername('ok_footwear')
    .withPassword('ok_footwear_dev')
    .withExposedPorts(5432)
    .start();

  const pgHost = pgContainer.getHost();
  const pgPort = pgContainer.getMappedPort(5432);

  process.env['TEST_DATABASE_URL'] =
    `postgresql://ok_footwear:ok_footwear_dev@${pgHost}:${pgPort}/ok_footwear_erp`;
  process.env['TEST_DIRECT_DATABASE_URL'] =
    `postgresql://ok_footwear:ok_footwear_dev@${pgHost}:${pgPort}/ok_footwear_erp`;
  process.env['TEST_PG_CONTAINER_ID'] = pgContainer.getId();

  // -------------------------------------------------------------------
  // Redis 7
  // -------------------------------------------------------------------
  const redisContainer = await new RedisContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .start();

  const redisHost = redisContainer.getHost();
  const redisPort = redisContainer.getMappedPort(6379);

  process.env['TEST_REDIS_URL'] = `redis://${redisHost}:${redisPort}`;
  process.env['TEST_REDIS_CONTAINER_ID'] = redisContainer.getId();

  console.log(`\n✓ PostgreSQL 16 started: ${process.env['TEST_DATABASE_URL']}`);
  console.log(`✓ Redis 7 started: ${process.env['TEST_REDIS_URL']}\n`);
};
