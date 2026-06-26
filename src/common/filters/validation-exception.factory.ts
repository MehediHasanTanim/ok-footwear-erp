import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from '@nestjs/common';

import type { ValidationErrorDetail } from './problem-detail.types';

// =============================================================================
// Validation Error Mapper
// =============================================================================
//
// Maps class-validator's nested ValidationError[] tree into a flat array of
// { field, message } objects suitable for the RFC 7807 `errors` field.
//
// NestJS's default ValidationPipe produces a BadRequestException with
// `message: string[]` (flat list of constraint messages without field names).
// This factory customizes that behavior to produce structured errors with
// dot-notation field paths.
//
// Usage (in main.ts):
//   new ValidationPipe({
//     exceptionFactory: (errors) =>
//       validationExceptionFactory(errors),
//   })
//
// Resulting exception response shape (accessible in HttpExceptionFilter):
//   {
//     statusCode: 400,
//     message: "Validation failed",
//     error: "Bad Request",
//     errors: [{ field: "email", message: "email must be an email" }, ...]
//   }

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * NestJS ValidationPipe exception factory.
 *
 * Converts class-validator ValidationError[] into a BadRequestException
 * whose response includes a structured `errors` array with field paths.
 *
 * Nested validation errors are flattened with dot-notation field paths
 * (e.g., `address.city` for a nested object, `items[0].quantity` for arrays).
 */
export function validationExceptionFactory(
  validationErrors: ValidationError[] = [],
): BadRequestException {
  const errors = flattenValidationErrors(validationErrors);

  return new BadRequestException({
    message: 'Validation failed',
    error: 'Bad Request',
    statusCode: 400,
    errors,
  });
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

/**
 * Recursively flatten ValidationError[] into ValidationErrorDetail[].
 *
 * Handles:
 *   - Top-level field errors: { field: "email", message: "..." }
 *   - Nested object errors: { field: "address.city", message: "..." }
 *   - Array element errors: { field: "items[0].quantity", message: "..." }
 *   - Multiple constraints per field: each constraint becomes a separate entry
 */
function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): ValidationErrorDetail[] {
  const result: ValidationErrorDetail[] = [];

  for (const error of errors) {
    const field = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;

    // Map constraint messages (one per validation rule that failed)
    if (error.constraints) {
      for (const message of Object.values(error.constraints)) {
        result.push({ field, message });
      }
    }

    // Recurse into nested objects/arrays
    if (error.children && error.children.length > 0) {
      result.push(
        ...flattenValidationErrors(error.children, field),
      );
    }
  }

  return result;
}
