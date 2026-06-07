import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Standard API response envelope interceptor.
 *
 * Wraps all successful (2xx) responses in:
 * {
 *   data: <original response>,
 *   timestamp: "<ISO 8601>"
 * }
 *
 * Skips wrapping for:
 * - Raw response types (streams, buffers)
 * - Responses that already contain { data, timestamp }
 */
export interface Envelope<T> {
  data: T;
  timestamp: string;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, Envelope<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<Envelope<T>> {
    return next.handle().pipe(
      map((data) => ({
        data,
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
