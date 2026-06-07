import { Module } from '@nestjs/common';

/**
 * HR module — employees, employment events, departments, payroll, leave,
 * attendance, salary structures, PF, gratuity, expenses, salary advances.
 *
 * Schema: `hr` (26 tables)
 * Core domain: Employee lifecycle → salary structure → monthly payroll run →
 *   leave management → attendance tracking → PF contribution →
 *   gratuity accrual → expense claims → salary advances.
 *
 * Controllers (Sprint 11+): employees, employment-events, departments,
 *   payroll-runs, payroll-entries, leave-types, leave-requests, leave-balances,
 *   attendance, salary-structures, salary-components, employee-salaries,
 *   pf-accounts, gratuity, expenses, salary-advances
 * Services (Sprint 11+): employees, employment-events, payroll, leave,
 *   attendance, salary-structures, pf, gratuity, expenses, salary-advances
 */
@Module({
  imports: [],
  controllers: [],
  providers: [],
  exports: [],
})
export class HrModule {}
