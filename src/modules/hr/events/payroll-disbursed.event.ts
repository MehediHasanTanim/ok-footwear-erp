/**
 * Emitted by HR after payroll disbursement is approved.
 * Finance listens via PayrollDisbursedHandler (@OnEvent('payroll.disbursed')).
 */
export class PayrollDisbursedEvent {
  static readonly NAME = 'payroll.disbursed';

  readonly payrollRunId: string;
  readonly periodId: string;
  readonly entryDate: string;
  readonly totalGross: number;
  readonly totalNet: number;
  readonly disbursedBy: string;

  constructor(params: {
    payrollRunId: string;
    periodId: string;
    entryDate: string;
    totalGross: number;
    totalNet: number;
    disbursedBy: string;
  }) {
    this.payrollRunId = params.payrollRunId;
    this.periodId = params.periodId;
    this.entryDate = params.entryDate;
    this.totalGross = params.totalGross;
    this.totalNet = params.totalNet;
    this.disbursedBy = params.disbursedBy;
  }
}
