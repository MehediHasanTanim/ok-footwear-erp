export class ProductionStartedEvent {
  productionOrderId!: string;
  orderId!: string;
  startedBy!: string;

  constructor(partial: Partial<ProductionStartedEvent>) {
    Object.assign(this, partial);
  }
}
