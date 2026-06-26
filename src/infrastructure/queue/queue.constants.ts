// =============================================================================
// Queue Name Constants & Injection Tokens
// =============================================================================
// Central registry of all BullMQ queue names and their NestJS injection tokens.
//
// Queue naming convention: `{domain}-queue` for clarity in Bull Board UI and
// monitoring dashboards.
//
// All queues run on Redis DB0 (shared with REDIS_QUEUE from the Redis module).
// =============================================================================

// ---------------------------------------------------------------------------
// Queue Names
// ---------------------------------------------------------------------------

/** Payroll processing queue: salary calculation, payslip generation, bank file export. */
export const PAYROLL_QUEUE = 'payroll-queue';

/** PDF generation queue: invoices, reports, payslips, bank letters. */
export const PDF_QUEUE = 'pdf-queue';

/** Email sending queue: transactional emails, notifications, alerts. */
export const EMAIL_QUEUE = 'email-queue';

/** SMS sending queue: OTP, alerts, notifications (SSL Wireless gateway). */
export const SMS_QUEUE = 'sms-queue';

/** Report generation queue: heavy analytical queries, scheduled reports, CSV exports. */
export const REPORT_QUEUE = 'report-queue';

// ---------------------------------------------------------------------------
// Dead-Letter Queue (DLQ)
// ---------------------------------------------------------------------------

/**
 * Dead-letter queue for jobs that exhausted all retry attempts.
 *
 * Jobs are automatically moved here after {@link DLQ_MAX_ATTEMPTS} total
 * attempts (1 initial + 3 retries) via the QueueEvents listener in QueueModule.
 */
export const DEAD_LETTER_QUEUE = 'dead-letter-queue';

// ---------------------------------------------------------------------------
// All Queue Names (for iteration)
// ---------------------------------------------------------------------------

/** All production queue names in registration order. */
export const ALL_QUEUE_NAMES = [
  PAYROLL_QUEUE,
  PDF_QUEUE,
  EMAIL_QUEUE,
  SMS_QUEUE,
  REPORT_QUEUE,
] as const;

// ---------------------------------------------------------------------------
// DLQ Configuration
// ---------------------------------------------------------------------------

/**
 * Total job attempts before dead-lettering.
 *
 * 4 attempts = 1 initial attempt + 3 retries.
 * Matches the constraint: "Dead-letter queue after exactly 3 retries".
 *
 * DEVIATION: BullMQ counts the initial execution as attempt #1, so we set
 * attempts=4 to achieve 3 retries (attempts 2, 3, 4 are retries).
 */
export const DLQ_MAX_ATTEMPTS = 4;

/**
 * Base delay for exponential backoff (milliseconds).
 *
 * With type='exponential' and delay=1000, retry delays are:
 *   Attempt 2: 1s
 *   Attempt 3: 2s
 *   Attempt 4: 4s
 */
export const DLQ_BACKOFF_DELAY_MS = 1_000;
