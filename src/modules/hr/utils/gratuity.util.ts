/**
 * Bangladesh Labour Act gratuity mirror (JS) — Basic × (30/26) × completed years.
 * Fractional years: >= 6 months rounds up; < 1 year returns 0.
 */
export function computeGratuityAmount(
  joinDate: string | Date,
  exitDate: string | Date,
  basicSalary: number,
): number {
  const join = joinDate instanceof Date ? joinDate : new Date(joinDate);
  const exit = exitDate instanceof Date ? exitDate : new Date(exitDate);

  let months =
    (exit.getFullYear() - join.getFullYear()) * 12 +
    (exit.getMonth() - join.getMonth());
  if (exit.getDate() < join.getDate()) {
    months -= 1;
  }

  const years =
    Math.trunc(months / 12) + (months % 12 >= 6 ? 1 : 0);
  if (years < 1) {
    return 0;
  }

  return Math.round(basicSalary * (30 / 26) * years * 100) / 100;
}
