import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Redis } from 'ioredis';
import { PrismaService } from '@shared/database/prisma.service';
import { REDIS_CACHE } from '@infrastructure/redis/redis.constants';

@Injectable()
export class DailyScheduler {
  private readonly logger = new Logger(DailyScheduler.name);

  private static readonly LOCK_KEY = 'lock:mfg:daily-production-lock';
  private static readonly LOCK_TTL = 3600;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CACHE) private readonly redis: Redis,
  ) {}

  /** 02:00 Asia/Dhaka = 20:00 UTC previous calendar day */
  @Cron('0 20 * * *', { timeZone: 'UTC' })
  async runDailyJobs(): Promise<void> {
    await this.lockDailyProductions();
  }

  async lockDailyProductions(): Promise<number> {
    const acquired = await this.redis.set(
      DailyScheduler.LOCK_KEY,
      process.pid.toString(),
      'EX',
      DailyScheduler.LOCK_TTL,
      'NX',
    );

    if (!acquired) {
      this.logger.warn('Daily production lock skipped — another instance holds the lock');
      return 0;
    }

    try {
      const result = await this.prisma.$executeRaw`
        UPDATE mfg.daily_productions
        SET locked = TRUE
        WHERE prod_date < CURRENT_DATE AND locked = FALSE
      `;
      const count = typeof result === 'number' ? result : 0;
      this.logger.log(`Locked ${count} daily production row(s)`);
      return count;
    } finally {
      await this.redis.del(DailyScheduler.LOCK_KEY);
    }
  }
}
