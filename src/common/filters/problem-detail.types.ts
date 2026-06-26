// =============================================================================
// RFC 7807 — Problem Details for HTTP APIs
// =============================================================================
// https://datatracker.ietf.org/doc/html/rfc7807
//
// These types define the standard shape of error responses from the API.
// Every error — whether a validation failure, a 404, or a 500 — follows
// this contract so clients can reliably parse and handle errors.
//
// Content-Type: application/problem+json
// =============================================================================

// ---------------------------------------------------------------------------
// Problem Detail — the core RFC 7807 object
// ---------------------------------------------------------------------------

/**
 * RFC 7807 Problem Detail object.
 *
 * All error responses from the API follow this shape. Fields marked with
 * `?` are omitted from the response JSON when undefined (via `.toJSON()`).
 */
export interface ProblemDetail {
  /**
   * URI identifying the problem type.
   *
   * Format: `https://ok-footwear.com/errors/<status-code>`
   * Example: `https://ok-footwear.com/errors/422`
   *
   * Clients can use this URI for automatic error handling and can
   * dereference it for human-readable documentation (future).
   */
  type: string;

  /**
   * Short, human-readable summary of the problem type.
   *
   * Unchanged between occurrences of the same `type` (e.g., all 404s
   * return "Not Found"). For localization, clients use the `type` URI
   * to fetch a translated title.
   */
  title: string;

  /**
   * HTTP status code.
   */
  status: number;

  /**
   * Human-readable explanation specific to this occurrence.
   *
   * Unlike `title`, this can vary (e.g., "User with ID 123 not found"
   * vs. "Order with ID 456 not found").
   */
  detail: string;

  /**
   * The request path that caused the error.
   *
   * Example: `/api/v1/employees/019eea1b-...`
   */
  instance: string;

  /**
   * Correlation ID (UUID v7) from the request.
   *
   * Matches the `X-Correlation-ID` response header. Clients include this
   * when reporting errors to support — it enables full log trace.
   */
  correlationId: string;
}

// ---------------------------------------------------------------------------
// Validation Error Detail — per-field validation failure
// ---------------------------------------------------------------------------

/**
 * A single validation error — maps a field to a human-readable message.
 *
 * When class-validator rejects a DTO, the ValidationPipe collects all
 * failures and the filter maps them into this array.
 */
export interface ValidationErrorDetail {
  /**
   * The field that failed validation.
   *
   * Uses dot-notation for nested objects:
   *   - `name` for top-level fields
   *   - `address.city` for nested fields
   *   - `items[0].quantity` for array elements
   */
  field: string;

  /**
   * Human-readable validation message.
   *
   * Example: "email must be a valid email address"
   */
  message: string;
}

// ---------------------------------------------------------------------------
// Extended Problem Detail — with validation errors
// ---------------------------------------------------------------------------

/**
 * Problem Detail extended with validation errors.
 *
 * Returned for 400/422 responses where class-validator rejected the input.
 * The `errors` array is present ONLY when validation failures occurred.
 */
export interface ValidationProblemDetail extends ProblemDetail {
  errors: ValidationErrorDetail[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Base URI for error type documentation.
 *
 * DEVIATION: Hardcoded domain. In a future Sprint, this should come from
 * AppConfigService (e.g., `configService.errorDocBaseUri`). Currently
 * acceptable since it's a documentation URI, not a secret.
 */
const ERROR_TYPE_BASE = 'https://ok-footwear.com/errors';

/**
 * Build a type URI for a given HTTP status code.
 *
 * Example: `problemTypeUri(422)` → `"https://ok-footwear.com/errors/422"`
 */
export function problemTypeUri(status: number): string {
  return `${ERROR_TYPE_BASE}/${status}`;
}
