import { AsyncLocalStorage } from 'async_hooks';

// =============================================================================
// Correlation ID Store — AsyncLocalStorage singleton
// =============================================================================
//
// Provides a typed, zero-dependency mechanism for propagating correlation_id
// and user_id across the entire request lifecycle WITHOUT req-scoped injection.
//
// Why AsyncLocalStorage (not REQUEST scope)?
// - Works in guards, interceptors, pipes, filters, and BullMQ workers
//   where NestJS DI request scope is unavailable or degraded.
// - No performance penalty from REQUEST-scoped providers (which force NestJS
//   to create a new injector tree per request).
// - Standard Node.js API — no framework coupling.
// - Survives async context switches (await, Promise chains, event emitters).
//
// Usage:
//   In middleware: CorrelationStore.enterWith({ correlationId: '...' });
//   In any service: const ctx = CorrelationStore.getStore();
//   In pino mixin:  { correlation_id: CorrelationStore.getStore()?.correlationId }

// ---------------------------------------------------------------------------
// Typed context
// ---------------------------------------------------------------------------

export interface CorrelationContext {
  /** UUID v7 correlation ID — time-ordered for log sorting. */
  correlationId: string;

  /** Authenticated user ID (set by auth guard later — Sprint 3). */
  userId?: string;

  /**
   * DEVIATION: module field is NOT stored here because it varies per log call,
   * not per request. nestjs-pino's PinoLogger.setContext() handles module-level
   * binding via child loggers. We read it from the PinoLogger instance itself.
   */
}

// ---------------------------------------------------------------------------
// Singleton store
// ---------------------------------------------------------------------------

const storage = new AsyncLocalStorage<CorrelationContext>();

// ---------------------------------------------------------------------------
// Static helpers
// ---------------------------------------------------------------------------

export const CorrelationStore = {
  /**
   * Enter a new correlation context for the current async scope chain.
   *
   * Call this ONCE per request (in middleware). The context survives
   * all async operations downstream — database queries, Redis calls,
   * event emissions — without manual propagation.
   */
  enterWith(ctx: CorrelationContext): void {
    storage.enterWith(ctx);
  },

  /**
   * Retrieve the current correlation context.
   *
   * Returns `undefined` if called outside a request context (e.g., during
   * bootstrap, cron jobs without correlation, or CLI commands).
   *
   * Callers must handle the `undefined` case gracefully — pino mixin
   * returns `undefined` for missing fields, which pino omits from output.
   */
  getStore(): CorrelationContext | undefined {
    return storage.getStore();
  },

  /**
   * Run a callback within a correlation context.
   *
   * Useful for non-request entry points (BullMQ workers, CLI scripts,
   * scheduled tasks) where there's no HTTP middleware to enter the store.
   *
   * Example:
   *   CorrelationStore.run({ correlationId: uuidv7() }, async () => {
   *     await someService.doWork();
   *   });
   */
  run<T>(ctx: CorrelationContext, fn: () => T): T {
    return storage.run(ctx, fn);
  },
};
