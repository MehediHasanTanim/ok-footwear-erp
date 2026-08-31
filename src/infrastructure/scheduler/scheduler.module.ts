import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RedisModule } from '@infrastructure/redis';
import { DailyScheduler } from './daily-scheduler.service';
import { MonthlyScheduler } from './monthly-scheduler.service';
import { HrModule } from '@modules/hr/hr.module';

@Module({
  imports: [ScheduleModule.forRoot(), RedisModule, forwardRef(() => HrModule)],
  providers: [DailyScheduler, MonthlyScheduler],
  exports: [DailyScheduler, MonthlyScheduler],
})
export class SchedulerModule {}
