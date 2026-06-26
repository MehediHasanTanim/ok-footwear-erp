import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';

import { AppConfigService } from '@shared/config/app-config.service';

import {
  ALL_QUEUE_NAMES,
  DEAD_LETTER_QUEUE,
} from './queue.constants';
import { DEFAULT_JOB_OPTIONS } from './queue-dlq.config';
import { DeadLetterListener } from './dead-letter.listener';

// =============================================================================
// Helper: build Bull Board feature registrations for all queues
// =============================================================================

/**
 * Build BullBoardModule.forFeature() registrations for all 5 production
 * queues and the dead-letter queue.
 *
 * Each entry tells Bull Board: "here's a queue named X, use BullMQAdapter
 * to interface with it." Bull Board resolves the actual Queue instance
 * from the NestJS DI container at runtime via getQueueToken(name).
 */
function buildBullBoardFeatures(): ReturnType<typeof BullBoardModule.forFeature> {
  const adapters = [
    ...ALL_QUEUE_NAMES,
    DEAD_LETTER_QUEUE,
  ].map((name) => ({
    name,
    adapter: BullMQAdapter,
  }));

  return BullBoardModule.forFeature(...adapters);
}

// =============================================================================
// QueueModule
// =============================================================================

/**
 * BullMQ queue infrastructure module.
 *
 * Registers 5 named production queues + 1 dead-letter queue with consistent
 * retry and backoff behavior. Mounts Bull Board for dev/staging monitoring.
 *
 * Queues:
 *   payroll-queue    — Salary calculation, payslip generation, bank export
 *   pdf-queue        — Invoice, report, payslip PDF generation
 *   email-queue      — Transactional email delivery
 *   sms-queue        — OTP, alerts via SSL Wireless (Bangladesh)
 *   report-queue     — Heavy analytical queries, CSV/Excel exports
 *   dead-letter-queue — Exhausted jobs (3 retries failed) for inspection
 *
 * Retry strategy (per-job via defaultJobOptions):
 *   attempts: 4  →  1 initial + 3 retries
 *   backoff: exponential, base 1s → delays: 1s, 2s, 4s
 *   After exhaustion → DeadLetterListener moves job to dead-letter-queue
 *
 * Bull Board:
 *   Mounted at /admin/queues (dev-only, BasicAuth in staging)
 *   Shows all 6 queues with job counts, status, and retry controls
 */
@Module({
  imports: [
    // -----------------------------------------------------------------
    // BullMQ forRoot — shared connection for all queues
    // -----------------------------------------------------------------
    BullModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (configService: AppConfigService) => ({
        connection: { url: configService.redisUrl },
        // Default job options applied to all queues unless overridden
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      }),
    }),

    // -----------------------------------------------------------------
    // Register all 6 queues
    // -----------------------------------------------------------------
    BullModule.registerQueue(
      { name: ALL_QUEUE_NAMES[0], defaultJobOptions: DEFAULT_JOB_OPTIONS },
      { name: ALL_QUEUE_NAMES[1], defaultJobOptions: DEFAULT_JOB_OPTIONS },
      { name: ALL_QUEUE_NAMES[2], defaultJobOptions: DEFAULT_JOB_OPTIONS },
      { name: ALL_QUEUE_NAMES[3], defaultJobOptions: DEFAULT_JOB_OPTIONS },
      { name: ALL_QUEUE_NAMES[4], defaultJobOptions: DEFAULT_JOB_OPTIONS },
      // DLQ: no retries (attempts=1) — these are already exhausted jobs
      { name: DEAD_LETTER_QUEUE, defaultJobOptions: { attempts: 1 } },
    ),

    // -----------------------------------------------------------------
    // Bull Board — register all 6 queues for the admin UI
    // -----------------------------------------------------------------
    buildBullBoardFeatures(),
  ],
  providers: [
    // Listens for 'failed' events and moves exhausted jobs to DLQ
    DeadLetterListener,
  ],
  exports: [BullModule],
})
export class QueueModule {}
