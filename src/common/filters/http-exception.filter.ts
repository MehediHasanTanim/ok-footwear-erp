import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * RFC 7807 Problem Details HTTP exception filter.
 *
 * Transforms all thrown exceptions into a standardized JSON response:
 * {
 *   type: "https://ok-footwear.com/errors/<status>",
 *   title: "<Human-readable summary>",
 *   status: <HTTP status code>,
 *   detail: "<Error message>",
 *   instance: "<request path>",
 *   correlationId: "<X-Correlation-ID header value>",
 *   errors: [ ...validation errors if applicable ]
 * }
 *
 * Design decisions:
 * - Catches HttpException (NestJS built-in) and unknown exceptions.
 * - Unknown exceptions → 500 Internal Server Error with generic message in
 *   production, full stack trace in development.
 * - Class-validator errors → unwrapped into the `errors` array.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const correlationId = (request.headers['x-correlation-id'] as string) ?? '';

    let status: HttpStatus;
    let title: string;
    let detail: string;
    let errors: unknown[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        title = exception.name;
        detail = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        title = (resp.error as string) ?? exception.name;
        detail = (resp.message as string) ?? exception.message;
        errors = resp.errors as unknown[] | undefined;
      } else {
        title = exception.name;
        detail = exception.message;
      }
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      title = 'Internal Server Error';
      detail =
        process.env.NODE_ENV === 'production'
          ? 'An unexpected error occurred. Please try again later.'
          : (exception as Error).message ?? 'Unknown error';
    }

    // Log server errors
    if (status >= 500) {
      this.logger.error(
        { correlationId, path: request.url, exception },
        `HTTP ${status}: ${detail}`,
      );
    }

    response.status(status).json({
      type: `https://ok-footwear.com/errors/${status}`,
      title,
      status,
      detail,
      instance: request.url,
      correlationId,
      ...(errors ? { errors } : {}),
    });
  }
}
