/**
 * Domain events module stub.
 *
 * Provides typed event classes and handlers for cross-module communication.
 * Built on @nestjs/event-emitter (EventEmitter2).
 *
 * Pattern: Modules publish events; handlers in other modules subscribe.
 * Example: OrdersModule publishes OrderConfirmedEvent →
 *   ProcurementModule's handler creates a PurchaseOrder.
 */
export class EventsModule {}
