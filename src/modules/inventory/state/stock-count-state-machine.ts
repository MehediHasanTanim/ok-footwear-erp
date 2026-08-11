export type StockCountStatus =
  | 'open'
  | 'counting'
  | 'variance_review'
  | 'approved'
  | 'cancelled';

export const STOCK_COUNT_TRANSITIONS: Record<StockCountStatus, StockCountStatus[]> = {
  open: ['counting', 'cancelled'],
  counting: ['variance_review', 'cancelled'],
  variance_review: ['approved', 'cancelled'],
  approved: [],
  cancelled: [],
};

export function canTransitionStockCount(
  from: StockCountStatus,
  to: StockCountStatus,
): boolean {
  return (STOCK_COUNT_TRANSITIONS[from] ?? []).includes(to);
}
