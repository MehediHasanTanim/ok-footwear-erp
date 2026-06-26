import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Job, Queue, QueueEvents } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';

import { AppConfigService } from '@shared/config/app-config.service';

import {
  ALL_QUEUE_NAMES,
  DEAD_LETTER_QUEUE,
} from './queue.constants';

/**
 * Dead-Letter Queue (DLQ) event listener.
 *
 * Listens for 'failed' events on all 5 production queues. When a job has
 * exhausted all retry attempts (attemptsMade >= opts.attempts), it is moved
 * to the dead-letter-queue for operator inspection and manual retry.
 *
 * The dead-letter-queue itself has attempts=1 (no retry) to prevent
 * infinite loops. Operators can manually retry DLQ jobs from Bull Board.
 */
@Injectable()
export class DeadLetterListener implements OnModuleInit {
  private readonly logger = new Logger(DeadLetterListener.name);

  constructor(
    private readonly configService: AppConfigService,
    @InjectQueue(DEAD_LETTER_QUEUE) private readonly dlq: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    // We use Queue from bullmq (not @InjectQueue) because QueueEvents
    // needs a raw Queue reference. We create lightweight Queue references
    // for event listening only (no job processing).
    const connection = { url: this.configService.redisUrl };

    for (const queueName of ALL_QUEUE_NAMES) {
      const queueEvents = new QueueEvents(queueName, { connection });

      queueEvents.on('failed', async ({ jobId, failedReason }) => {
        await this.handleFailedJob(queueName, jobId, failedReason);
      });

      this.logger.log(`DLQ listener registered for "${queueName}"`);
    }

    this.logger.log(
      `DLQ listeners active on ${ALL_QUEUE_NAMES.length} queues → DLQ target: "${DEAD_LETTER_QUEUE}"`,
    );
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  /**
   * Handle a failed job event.
   *
   * Checks whether the job has exhausted all retry attempts. If so,
   * moves it to the dead-letter queue and removes it from the source queue.
   */
  private async handleFailedJob(
    queueName: string,
    jobId: string,
    failedReason: string,
  ): Promise<void> {
    try {
      // Create a temporary Queue reference to fetch the job
      const connection = { url: this.configService.redisUrl };
      const sourceQueue = new Queue(queueName, { connection });

      // DEVIATION: BullMQ v5's Queue.getJob() returns Job | undefined
      const job: Job | undefined = await sourceQueue.getJob(jobId);

      if (!job) {
        this.logger.warn(
          `DLQ: job ${jobId} not found in "${queueName}" — may have been removed`,
        );
        await sourceQueue.close();
        return;
      }

      const attemptsMade = job.attemptsMade;
      const maxAttempts = job.opts.attempts ?? 1;

      if (attemptsMade >= maxAttempts) {
        // Permanently failed — move to DLQ
        await this.dlq.add(job.name, job.data, {
          // Preserve original opts for debugging but reset attempts
          ...job.opts,
          attempts: 1,
        });

        this.logger.warn(
          `DLQ: "${job.name}" (${jobId}) from "${queueName}" — ` +
            `${attemptsMade}/${maxAttempts} attempts exhausted. ` +
            `Reason: ${failedReason}`,
        );

        // Remove exhausted job from source queue to keep it clean
        await job.remove();
      } else {
        // Will be retried — do nothing
        this.logger.debug(
          `DLQ: "${job.name}" (${jobId}) from "${queueName}" — ` +
            `attempt ${attemptsMade}/${maxAttempts}, will retry`,
        );
      }

      await sourceQueue.close();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `DLQ: error handling failed job ${jobId} from "${queueName}": ${message}`,
      );
    }
  }
}
