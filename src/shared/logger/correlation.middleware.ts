import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { v7 as uuidv7, validate } from 'uuid';

import { CorrelationStore } from './correlation-store';

// =============================================================================
// Correlation ID Middleware
// =============================================================================
//
// Runs EARLY in the request pipeline — before pino-http, before guards,
// before any business logic. Responsibilities:
//
// 1. Read X-Correlation-ID from incoming request, validate it.
//    - If valid UUID: reuse it (downstream service propagation).
//    - If missing/invalid: generate a new UUID v7.
//
// 2. Enter the correlation context into AsyncLocalStorage so that
//    all downstream code (services, repositories, event handlers)
//    can access correlation_id without req-scoped injection.
//
// 3. Set X-Correlation-ID on the response — always, for every response.
//    This allows clients and upstream proxies to correlate requests
//    end-to-end across service boundaries.
//
// 4. Optionally normalize user_id if present in a known header
//    (X-Authenticated-User-Id for service mesh / API gateway propagation).
//
// UUID v7 rationale:
//   - Time-ordered: first 48 bits are a Unix timestamp in ms.
//   - Sortable: ORDER BY correlation_id sorts chronologically.
//   - Index-friendly: avoids B-tree fragmentation of UUID v4.
//   - RFC 9562 compliant.

/** Header name for correlation ID (incoming and outgoing). */
const CORRELATION_HEADER = 'X-Correlation-ID';

/** Header name for authenticated user ID from upstream proxy/gateway. */
const USER_HEADER = 'X-Authenticated-User-Id';

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  /**
   * Express middleware handler.
   *
   * Rely on the `next()` pattern to ensure this runs before NestJS route
   * resolution. Not using async/await since we want synchronous header
   * setting — the AsyncLocalStorage.enterWith() is synchronous.
   */
  use(req: Request, res: Response, next: NextFunction): void {
    // -----------------------------------------------------------------
    // 1. Determine correlation ID
    // -----------------------------------------------------------------
    const incoming = req.headers[CORRELATION_HEADER.toLowerCase()];
    const correlationId =
      typeof incoming === 'string' && validate(incoming)
        ? incoming
        : uuidv7();

    // -----------------------------------------------------------------
    // 2. Extract user ID (if available from upstream proxy)
    // -----------------------------------------------------------------
    const incomingUser = req.headers[USER_HEADER.toLowerCase()];
    const userId =
      typeof incomingUser === 'string' && incomingUser.length > 0
        ? incomingUser
        : undefined;

    // -----------------------------------------------------------------
    // 3. Enter correlation context (synchronous)
    // -----------------------------------------------------------------
    CorrelationStore.enterWith({ correlationId, userId });

    // -----------------------------------------------------------------
    // 4. Set response header — ALWAYS, for every response
    // -----------------------------------------------------------------
    res.setHeader(CORRELATION_HEADER, correlationId);

    // -----------------------------------------------------------------
    // 5. Also set req.id so pino-http picks it up via genReqId fallback
    // -----------------------------------------------------------------
    // DEVIATION: We set req.id even though we have AsyncLocalStorage
    // because pino-http reads req.id for its own 'id' field in the log.
    // The mixin() will ALSO add correlation_id from the store — giving
    // us BOTH pino's built-in req.id AND our correlation_id field.
    (req as unknown as Record<string, unknown>).id = correlationId;

    next();
  }
}
