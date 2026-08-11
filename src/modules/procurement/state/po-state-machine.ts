export type PurchaseOrderStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'partially_received'
  | 'received'
  | 'cancelled';

export const PO_STATUS_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  draft: ['pending_approval', 'cancelled'],
  pending_approval: ['approved', 'cancelled'],
  approved: ['partially_received', 'received'],
  partially_received: ['received'],
  received: [],
  cancelled: [],
};

export function canTransitionPo(from: PurchaseOrderStatus, to: PurchaseOrderStatus): boolean {
  return (PO_STATUS_TRANSITIONS[from] ?? []).includes(to);
}

export type ApproverRole = 'line_manager' | 'manager' | 'finance' | 'md';

export function resolveApproverRole(
  totalAmount: number,
  thresholds: { lineMgr: number; manager: number; finance: number },
): ApproverRole {
  if (totalAmount < thresholds.lineMgr) return 'line_manager';
  if (totalAmount < thresholds.manager) return 'manager';
  if (totalAmount < thresholds.finance) return 'finance';
  return 'md';
}
