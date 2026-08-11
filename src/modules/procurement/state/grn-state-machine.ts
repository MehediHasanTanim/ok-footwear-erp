export type GoodsReceiptStatus = 'draft' | 'qc_pending' | 'approved' | 'rejected';

export const GRN_STATUS_TRANSITIONS: Record<GoodsReceiptStatus, GoodsReceiptStatus[]> = {
  draft: ['qc_pending', 'rejected'],
  qc_pending: ['approved', 'rejected'],
  approved: [],
  rejected: [],
};

export function canTransitionGrn(from: GoodsReceiptStatus, to: GoodsReceiptStatus): boolean {
  return (GRN_STATUS_TRANSITIONS[from] ?? []).includes(to);
}
