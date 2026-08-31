import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Redis } from 'ioredis';
import { REDIS_CACHE } from '@infrastructure/redis/redis.constants';
import { LeaveService } from '@modules/hr/services/leave.service';
import { GratuityService } from '@modules/hr/services/gratuity.service';
import { PfService } from '@modules/hr/services/pf.service';
import { PrismaService } from '@shared/database/prisma.service';

@Injectable()
export class MonthlyScheduler {
  private readonly logger = new Logger(MonthlyScheduler.name);

  private static readonly LEAVE_LOCK = 'lock:hr:leave-accrual';
  private static readonly GRATUITY_LOCK = 'lock:hr:gratuity-accrual';
  private static readonly PF_LOCK = 'lock:hr:pf-interest';
  private static readonly LOCK_TTL = 3600;

  constructor(
    private readonly leave: LeaveService,
    private readonly gratuity: GratuityService,
    private readonly pf: PfService,
    private readonly prisma: PrismaService,
    @Inject(REDIS_CACHE) private readonly redis: Redis,
  ) {}

  /** 1st of month 00:30 BDT = 18:30 UTC previous day (approx; use day 1 18:30 UTC) */
  @Cron('30 18 1 * *', { timeZone: 'UTC' })
  async accrueLeaveBalances(): Promise<void> {
    await this.withLock(MonthlyScheduler.LEAVE_LOCK, async () => {
      const result = await this.leave.accrueMonthly();
      this.logger.log(`Leave accrual cron: ${JSON.stringify(result)}`);
    });
  }

  /** Last day of month 23:00 BDT — run at 17:00 UTC on days 28-31 and guard inside */
  @Cron('0 17 28-31 * *', { timeZone: 'UTC' })
  async runGratuityProvision(): Promise<void> {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    if (tomorrow.getUTCDate() !== 1) return;

    await this.withLock(MonthlyScheduler.GRATUITY_LOCK, async () => {
      const admin = await this.prisma.user.findFirst({ where: { deletedAt: null } });
      const postedBy = admin?.id;
      const result = await this.gratuity.accrueMonth(undefined, postedBy ?? undefined);
      this.logger.log(`Gratuity accrual cron: ${JSON.stringify(result)}`);
    });
  }

  /** 1 July 02:00 BDT = 20:00 UTC on 30 June */
  @Cron('0 20 30 6 *', { timeZone: 'UTC' })
  async creditPfInterest(): Promise<void> {
    await this.withLock(MonthlyScheduler.PF_LOCK, async () => {
      const rate = Number(process.env['HR_PF_INTEREST_RATE_PCT'] ?? '8');
      const result = await this.pf.annualInterestCredit(rate);
      this.logger.log(`PF interest cron: ${JSON.stringify(result)}`);
    });
  }

  private async withLock(key: string, fn: () => Promise<void>): Promise<void> {
    const acquired = await this.redis.set(key, process.pid.toString(), 'EX', MonthlyScheduler.LOCK_TTL, 'NX');
    if (!acquired) {
      this.logger.warn(`Skipped ${key} — lock held`);
      return;
    }
    try {
      await fn();
    } finally {
      await this.redis.del(key);
    }
  }
}
