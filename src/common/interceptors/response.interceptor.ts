import {
  Injectable,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
  StreamableFile,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

// =============================================================================
// Standard API Response Envelope
// =============================================================================
//
// Every successful (2xx) response is wrapped in this envelope:
//
//   { data: T, timestamp: "2026-06-22T10:30:00.000Z" }
//
// For paginated responses, `data` itself contains the pagination fields:
//
//   { data: { items: [...], total, page, limit }, timestamp: "..." }
//
// Design decisions:
// - Single `data` field (not `data` + `meta`) — simpler client parsing.
//   Pagination metadata lives inside `data` alongside `items`.
// - ISO 8601 timestamp — machine-parseable, timezone-agnostic (UTC).
// - Raw responses (StreamableFile, Buffer) pass through unwrapped.
// - Error responses never reach this interceptor (RxJS `map` only runs
//   on successful `next` notifications; errors flow through `catchError`
//   which we don't intercept — they hit the ExceptionFilter directly).

// ---------------------------------------------------------------------------
// Envelope type
// ---------------------------------------------------------------------------

export interface Envelope<T> {
  data: T;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Internal sentinel — marks wrapped responses to avoid double-wrapping
// ---------------------------------------------------------------------------
const ENVELOPE_SENTINEL = Symbol('OKFootwearEnvelope');

// ---------------------------------------------------------------------------
// ResponseInterceptor
// ---------------------------------------------------------------------------

/**
 * Wraps all successful (2xx) controller responses in the standard
 * `{ data, timestamp }` envelope.
 *
 * Must be registered AFTER ClassSerializerInterceptor in the global
 * interceptor chain so that @Exclude() stripping happens before the
 * envelope is applied.
 *
 * Skips wrapping for:
 *   - StreamableFile (file downloads)
 *   - Buffer (binary responses)
 *   - Responses already wrapped (detected via sentinel)
 */
@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, Envelope<T> | T>
{
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<Envelope<T> | T> {
    return next.handle().pipe(
      map((data: T) => {
        // Skip wrapping for raw binary responses
        if (this.isRawResponse(data)) {
          return data;
        }

        // Skip wrapping if already an envelope (e.g., manual envelope from
        // a controller that needs custom metadata)
        if (this.isAlreadyWrapped(data)) {
          return data;
        }

        return {
          data,
          timestamp: new Date().toISOString(),
          // Attach sentinel so downstream code can detect the envelope
          // without runtime type checks on `data` shape
          [ENVELOPE_SENTINEL]: true,
        } as Envelope<T>;
      }),
    );
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Detect raw binary/stream responses that should NOT be JSON-wrapped.
   *
   * StreamableFile is NestJS's standard for file downloads.
   * Buffer is used for raw binary data.
   */
  private isRawResponse(data: T): boolean {
    if (data instanceof StreamableFile) return true;
    if (Buffer.isBuffer(data)) return true;
    // Uint8Array (and subclasses) are binary — don't wrap
    if (data instanceof Uint8Array) return true;
    return false;
  }

  /**
   * Detect if the response is already wrapped in an envelope.
   *
   * Controllers can manually return `{ data, timestamp }` for edge cases
   * where they need custom envelope handling. The sentinel prevents
   * double-wrapping.
   */
  private isAlreadyWrapped(data: T): boolean {
    return (
      typeof data === 'object' &&
      data !== null &&
      ENVELOPE_SENTINEL in (data as Record<string | symbol, unknown>)
    );
  }
}
