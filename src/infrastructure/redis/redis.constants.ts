// =============================================================================
// Redis Injection Tokens & Database Indices
// =============================================================================
// Named injection tokens for the three ioredis clients.
//
// DB allocation:
//   DB0 — Queue (BullMQ job data, repeatable jobs, delayed jobs)
//   DB1 — Auth  (JWT refresh tokens, RBAC permission cache, MFA nonces)
//   DB2 — Cache (application cache: query results, API responses, computed data)
//
// Separate DBs prevent key collisions between domains and enable:
//   - Independent FLUSHDB per domain (e.g., clear cache without losing auth tokens)
//   - Different eviction policies per DB (LRU for cache, noeviction for auth)
//   - Per-DB monitoring (keyspace hits/misses, memory usage)
// =============================================================================

/** Injection token for the Redis client connected to DB0 (BullMQ queues). */
export const REDIS_QUEUE = Symbol('REDIS_QUEUE');

/** Injection token for the Redis client connected to DB1 (auth/JWT/RBAC). */
export const REDIS_AUTH = Symbol('REDIS_AUTH');

/** Injection token for the Redis client connected to DB2 (application cache). */
export const REDIS_CACHE = Symbol('REDIS_CACHE');

/** Redis database index for BullMQ queues. */
export const REDIS_DB_QUEUE = 0;

/** Redis database index for auth/JWT/RBAC data. */
export const REDIS_DB_AUTH = 1;

/** Redis database index for application cache. */
export const REDIS_DB_CACHE = 2;
