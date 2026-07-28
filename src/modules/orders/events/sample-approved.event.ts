// =============================================================================
// SampleApprovedEvent — Domain Event
// =============================================================================
// OK Footwear ERP — Sprint 4, Orders Module
//
// Emitted AFTER the sample approval transaction commits.
//
// IDEMPOTENCY NOTE (Design Decision D):
//   If multiple sample rounds are approved for the same order, this event
//   fires for EACH approval. orders.sample_approved is already true after
//   the first approval — subsequent approvals set it to true again (no-op).
//   Downstream listeners (Manufacturing, QC) MUST handle duplicate events
//   idempotently — check whether they've already acted on this sampleId
//   before processing.
// =============================================================================

export class SampleApprovedEvent {
  sampleId: string;
  orderId: string;
  approvedBy: string;
  sampleType: string;

  constructor(partial: Partial<SampleApprovedEvent>) {
    Object.assign(this, partial);
  }
}
