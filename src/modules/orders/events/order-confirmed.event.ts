// =============================================================================
// OrderConfirmedEvent — Domain Event
// =============================================================================
// OK Footwear ERP — Sprint 3, Orders Module
//
// Emitted AFTER the confirming transaction commits (not inside it).
// Listeners in other modules (Procurement, Manufacturing) will subscribe
// to this event in future sprints to trigger downstream workflows:
//
//   - Procurement: auto-generate material requirements based on BOM
//   - Manufacturing: create production order, schedule capacity
//   - Finance: create proforma invoice, track LC status
//
// Emitted via EventEmitter2.emit() in OrdersService.confirm().
// =============================================================================

export class OrderConfirmedEvent {
  /**
   * The ID of the order that was just confirmed.
   */
  orderId: string;

  /**
   * The confirmed delivery date (for production scheduling).
   */
  deliveryDate: Date;

  /**
   * The buyer who placed the order.
   */
  buyerId: string;

  /**
   * The user ID of the person who confirmed the order.
   */
  confirmedBy: string;

  constructor(partial: Partial<OrderConfirmedEvent>) {
    Object.assign(this, partial);
  }
}
