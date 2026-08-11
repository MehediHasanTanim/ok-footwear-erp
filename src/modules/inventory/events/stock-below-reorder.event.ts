export class StockBelowReorderEvent {
  itemId!: string;
  warehouseId?: string;
  quantity!: number;
  reorderLevel!: number;
  totalQty!: number;

  constructor(partial: Partial<StockBelowReorderEvent>) {
    Object.assign(this, partial);
  }
}
