export class GrnApprovedEvent {
  grnId!: string;
  /** GRN approver — used as created_by on inventory stock_transactions */
  approvedBy!: string;
  lines!: Array<{
    itemId: string;
    warehouseId: string;
    acceptedQty: number;
    unitCost: number;
  }>;

  constructor(partial: Partial<GrnApprovedEvent>) {
    Object.assign(this, partial);
  }
}
