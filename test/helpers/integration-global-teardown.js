// =============================================================================
// Integration Test — Global Teardown (JavaScript)
// =============================================================================
// Stops the testcontainers started in global setup.

const { execSync } = require('child_process');

module.exports = async function globalTeardown() {
  const pgId = process.env['TEST_PG_CONTAINER_ID'];
  const redisId = process.env['TEST_REDIS_CONTAINER_ID'];

  if (pgId) {
    try {
      execSync(`docker stop ${pgId}`, { stdio: 'ignore' });
      execSync(`docker rm ${pgId}`, { stdio: 'ignore' });
      console.log(`✓ PostgreSQL container stopped`);
    } catch {
      console.warn('⚠ Could not stop PostgreSQL container');
    }
  }

  if (redisId) {
    try {
      execSync(`docker stop ${redisId}`, { stdio: 'ignore' });
      execSync(`docker rm ${redisId}`, { stdio: 'ignore' });
      console.log(`✓ Redis container stopped`);
    } catch {
      console.warn('⚠ Could not stop Redis container');
    }
  }
};
