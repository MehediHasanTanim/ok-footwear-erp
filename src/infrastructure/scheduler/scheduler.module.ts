import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RedisModule } from '@infrastructure/redis';
import { DailyScheduler } from './daily-scheduler.service';

@Module({
  imports: [ScheduleModule.forRoot(), RedisModule],
  providers: [DailyScheduler],
  exports: [DailyScheduler],
})
export class SchedulerModule {}
