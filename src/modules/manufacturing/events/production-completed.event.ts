export class ProductionCompletedEvent {
  productionOrderId!: string;
  orderId!: string;
  qcResultId!: string;
  completedBy!: string;

  constructor(partial: Partial<ProductionCompletedEvent>) {
    Object.assign(this, partial);
  }
}
