/** LOP salary deduction: (basic / workingDays) × lopDays */
export function computeLopDeduction(
  basicSalary: number,
  workingDays: number,
  lopDays: number,
): number {
  if (workingDays <= 0) {
    throw new Error('workingDays must be positive');
  }
  return Math.round((basicSalary / workingDays) * lopDays * 100) / 100;
}
