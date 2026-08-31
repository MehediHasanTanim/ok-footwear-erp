import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { FinanceModule } from '@modules/finance/finance.module';
import { SystemModule } from '@modules/system/system.module';

import { DepartmentsController } from './controllers/departments.controller';
import { DesignationsController } from './controllers/designations.controller';
import { EmployeesController } from './controllers/employees.controller';
import {
  LeaveBalancesController,
  LeaveRequestsController,
  LeaveTypesController,
} from './controllers/leave.controller';
import { AttendanceController } from './controllers/attendance.controller';
import { PfAccountsController } from './controllers/pf-accounts.controller';
import { GratuityController } from './controllers/gratuity.controller';

import { DepartmentsService } from './services/departments.service';
import { DesignationsService } from './services/designations.service';
import { EmployeesService } from './services/employees.service';
import { LeaveService } from './services/leave.service';
import { AttendanceService } from './services/attendance.service';
import { PfService } from './services/pf.service';
import { GratuityService } from './services/gratuity.service';

/**
 * HR module — Sprint 12–13: employees, leave, attendance, PF, gratuity.
 */
@Module({
  imports: [
    FinanceModule,
    SystemModule,
    JwtModule.register({
      secret: process.env['JWT_SECRET'] ?? 'dev-secret-do-not-use-in-production',
      signOptions: {
        expiresIn: (process.env['JWT_ACCESS_TTL'] ?? '8h') as unknown as number,
      },
    }),
  ],
  controllers: [
    DepartmentsController,
    DesignationsController,
    EmployeesController,
    LeaveTypesController,
    LeaveRequestsController,
    LeaveBalancesController,
    AttendanceController,
    PfAccountsController,
    GratuityController,
  ],
  providers: [
    DepartmentsService,
    DesignationsService,
    EmployeesService,
    LeaveService,
    AttendanceService,
    PfService,
    GratuityService,
  ],
  exports: [
    EmployeesService,
    LeaveService,
    AttendanceService,
    PfService,
    GratuityService,
  ],
})
export class HrModule {}
