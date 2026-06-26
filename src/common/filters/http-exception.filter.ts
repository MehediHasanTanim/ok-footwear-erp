import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { CorrelationStore } from '@shared/logger/correlation-store';

import type {
  ProblemDetail,
  ValidationErrorDetail,
} from './problem-detail.types';
import { problemTypeUri } from './problem-detail.types';

// =============================================================================
// HttpExceptionFilter — RFC 7807 application/problem+json
// =============================================================================
//
// Catches ALL exceptions (known HttpException and unknown errors) and
// transforms them into RFC 7807 Problem Detail responses.
//
// Key behaviors:
//   - Sets Content-Type: application/problem+json on ALL error responses.
//   - Reads correlationId from CorrelationStore (set by CorrelationMiddleware),
//     NOT from request headers — this is the canonical source.
//   - Maps class-validator validation errors (from ValidationPipe) to a
//     structured `errors[]` array with `{ field, message }` entries.
//   - Never leaks stack traces in production (NODE_ENV=production).
//   - Logs server errors (5xx) with full context for debugging.
//
// Response shape:
//   {
//     "type": "https://ok-footwear.com/errors/422",
//     "title": "Unprocessable Entity",
//     "status": 422,
//     "detail": "Validation failed",
//     "instance": "/api/v1/employees",
//     "correlationId": "019eea1b-d4f7-7776-96c0-816c03416784",
//     "errors": [
//       { "field": "email", "message": "email must be an email" },
//       { "field": "name",  "message": "name should not be empty" }
//     ]
//   }

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // -----------------------------------------------------------------
    // 1. Determine correlation ID from the canonical store
    // -----------------------------------------------------------------
    // DEVIATION: We read from CorrelationStore, not request.headers.
    // The CorrelationMiddleware sets this store at the start of every
    // request. Reading from headers directly would bypass the store
    // and could return a stale or tampered value.
    const correlationId =
      CorrelationStore.getStore()?.correlationId ?? '';

    // -----------------------------------------------------------------
    // 2. Determine HTTP status, title, detail, and optional errors
    // -----------------------------------------------------------------
    const problem = this.buildProblemDetail(
      exception,
      request.url,
      correlationId,
    );

    // -----------------------------------------------------------------
    // 3. Log server errors (5xx) with full context
    // -----------------------------------------------------------------
    if (problem.status >= 500) {
      this.logger.error(
        {
          correlationId,
          path: request.url,
          exception: exception instanceof Error
            ? { name: exception.name, message: exception.message }
            : exception,
        },
        `HTTP ${problem.status}: ${problem.detail}`,
      );
    }

    // -----------------------------------------------------------------
    // 4. Send RFC 7807 response
    // -----------------------------------------------------------------
    response
      .status(problem.status)
      .contentType('application/problem+json')
      .json(problem);
  }

  // -----------------------------------------------------------------------
  // Private: build the ProblemDetail object
  // -----------------------------------------------------------------------

  private buildProblemDetail(
    exception: unknown,
    requestPath: string,
    correlationId: string,
  ): ProblemDetail | { errors: ValidationErrorDetail[]; type: string; title: string; status: number; detail: string; instance: string; correlationId: string } {
    // --- Case 1: Known HttpException ---
    if (exception instanceof HttpException) {
      return this.buildFromHttpException(
        exception,
        requestPath,
        correlationId,
      );
    }

    // --- Case 2: Unknown exception → 500 ---
    return this.buildFromUnknownException(
      exception,
      requestPath,
      correlationId,
    );
  }

  // -----------------------------------------------------------------------
  // Case 1: HttpException (4xx, 5xx, etc.)
  // -----------------------------------------------------------------------

  private buildFromHttpException(
    exception: HttpException,
    requestPath: string,
    correlationId: string,
  ) {
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();
    let title: string;
    let detail: string;
    let validationErrors: ValidationErrorDetail[] | undefined;

    if (typeof exceptionResponse === 'string') {
      // Simple string response (e.g., throw new HttpException('Not found', 404))
      title = this.statusToTitle(status);
      detail = exceptionResponse;
    } else if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null
    ) {
      const body = exceptionResponse as Record<string, unknown>;

      // Check for structured validation errors from our custom
      // ValidationPipe exceptionFactory (validation-exception.factory.ts).
      // The factory sets `errors: ValidationErrorDetail[]` on the response.
      if (Array.isArray(body['errors'])) {
        validationErrors = body['errors'] as ValidationErrorDetail[];
      }

      title =
        typeof body['error'] === 'string'
          ? (body['error'] as string)
          : this.statusToTitle(status);

      // Use the first message if it's an array (default NestJS ValidationPipe
      // behavior), otherwise the message string, otherwise the exception message
      if (Array.isArray(body['message'])) {
        // Default NestJS ValidationPipe: message is a string[] of constraint
        // messages. We already have structured `errors` from above if the
        // custom factory was used. If not (no `errors` field), create basic
        // entries from the string array.
        detail = 'Validation failed';
        if (!validationErrors) {
          validationErrors = (body['message'] as string[]).map((msg) => ({
            field: 'unknown',
            message: msg,
          }));
        }
      } else if (typeof body['message'] === 'string') {
        detail = body['message'] as string;
      } else {
        detail = exception.message;
      }
    } else {
      title = this.statusToTitle(status);
      detail = exception.message;
    }

    // Status 400 with validation errors should be 422 (Unprocessable Entity)
    // per RFC 7807 convention. NestJS ValidationPipe uses 400 by default.
    const effectiveStatus =
      validationErrors && validationErrors.length > 0 && status === 400
        ? HttpStatus.UNPROCESSABLE_ENTITY
        : status;

    return {
      type: problemTypeUri(effectiveStatus),
      title: this.statusToTitle(effectiveStatus),
      status: effectiveStatus,
      detail,
      instance: requestPath,
      correlationId,
      ...(validationErrors && validationErrors.length > 0
        ? { errors: validationErrors }
        : {}),
    };
  }

  // -----------------------------------------------------------------------
  // Case 2: Unknown exception → 500 Internal Server Error
  // -----------------------------------------------------------------------

  private buildFromUnknownException(
    exception: unknown,
    requestPath: string,
    correlationId: string,
  ) {
    const isProduction = process.env['NODE_ENV'] === 'production';

    const detail = isProduction
      ? 'An unexpected error occurred. Please try again later.'
      : exception instanceof Error
        ? exception.message
        : 'Unknown error';

    // DEVIATION: Never include stack traces in RFC 7807 responses.
    // Stack traces are logged via the Logger (see catch() above) for
    // debugging, but the client receives only a sanitized message.
    // Production detail is generic to avoid information disclosure.

    return {
      type: problemTypeUri(HttpStatus.INTERNAL_SERVER_ERROR),
      title: 'Internal Server Error',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail,
      instance: requestPath,
      correlationId,
    };
  }

  // -----------------------------------------------------------------------
  // Utility: HTTP status code → RFC 7231 title
  // -----------------------------------------------------------------------

  /**
   * Map HTTP status codes to their standard RFC 7231 reason phrases.
   *
   * Only the most commonly expected error statuses are mapped explicitly.
   * Unknown statuses fall back to "Unknown Error".
   */
  private statusToTitle(status: number): string {
    const titles: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'Bad Request',
      [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
      [HttpStatus.FORBIDDEN]: 'Forbidden',
      [HttpStatus.NOT_FOUND]: 'Not Found',
      [HttpStatus.METHOD_NOT_ALLOWED]: 'Method Not Allowed',
      [HttpStatus.NOT_ACCEPTABLE]: 'Not Acceptable',
      [HttpStatus.REQUEST_TIMEOUT]: 'Request Timeout',
      [HttpStatus.CONFLICT]: 'Conflict',
      [HttpStatus.GONE]: 'Gone',
      [HttpStatus.UNPROCESSABLE_ENTITY]: 'Unprocessable Entity',
      [HttpStatus.TOO_MANY_REQUESTS]: 'Too Many Requests',
      [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal Server Error',
      [HttpStatus.NOT_IMPLEMENTED]: 'Not Implemented',
      [HttpStatus.BAD_GATEWAY]: 'Bad Gateway',
      [HttpStatus.SERVICE_UNAVAILABLE]: 'Service Unavailable',
      [HttpStatus.GATEWAY_TIMEOUT]: 'Gateway Timeout',
    };

    return titles[status] ?? 'Unknown Error';
  }
}
