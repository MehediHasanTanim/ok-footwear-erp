/** Monthly recovery instalment for salary advance. */
export function computeAdvanceInstalment(
  amount: number,
  recoveryMonths: number,
): number {
  if (recoveryMonths <= 0) {
    throw new Error('recoveryMonths must be positive');
  }
  return Math.round((amount / recoveryMonths) * 100) / 100;
}
