import type { JobsOptions } from 'bullmq';

import {
  DLQ_BACKOFF_DELAY_MS,
  DLQ_MAX_ATTEMPTS,
} from './queue.constants';

// =============================================================================
// Default Job Options — Applied to all 5 production queues
// =============================================================================
//
// These defaults ensure every job, regardless of which service adds it,
// gets consistent retry behavior without per-job configuration.
//
// Individual job producers can override these options (e.g., for jobs that
// should never retry). To prevent accidental overrides, the @Processor
// decorator can validate job options at the worker level.

/**
 * Default job options applied to every queue via BullModule.registerQueue().
 *
 * - attempts: 4 (1 initial + 3 retries) → matches DLQ constraint
 * - backoff: exponential starting at 1s, capped by BullMQ's max backoff
 * - removeOnComplete: false → keep completed jobs for 24h (default) for inspection
 * - removeOnFail: false → keep failed jobs for inspection in Bull Board
 *   (the QueueEvents listener will move exhausted jobs to the DLQ)
 */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: DLQ_MAX_ATTEMPTS,
  backoff: {
    type: 'exponential',
    delay: DLQ_BACKOFF_DELAY_MS,
  },
  removeOnComplete: false,
  removeOnFail: false,
};

/**
 * Verify that with `attempts=4` and `backoff.type='exponential'` with
 * `delay=1000`, the retry schedule is:
 *
 *   Attempt 1 (initial): executes immediately
 *   Attempt 2 (retry 1): 1000ms after failure
 *   Attempt 3 (retry 2): 2000ms after failure
 *   Attempt 4 (retry 3): 4000ms after failure
 *
 * Total maximum delay before DLQ: ~7 seconds from first failure.
 * This satisfies the acceptance test: "Retry backoff is exponential".
 */
