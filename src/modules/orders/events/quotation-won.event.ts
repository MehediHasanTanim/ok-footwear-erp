// =============================================================================
// QuotationWonEvent — Domain Event
// =============================================================================
// OK Footwear ERP — Sprint 4, Orders Module
//
// Emitted AFTER the quotation close transaction commits (post-commit pattern).
// Future Finance module will listen to create a pro-forma invoice.
// =============================================================================

export class QuotationWonEvent {
  quotationId: string;
  orderId: string;
  quotedPrice: number | null;

  constructor(partial: Partial<QuotationWonEvent>) {
    Object.assign(this, partial);
  }
}
