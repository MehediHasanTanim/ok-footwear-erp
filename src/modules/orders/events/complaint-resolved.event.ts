// =============================================================================
// ComplaintResolvedEvent — Domain Event
// =============================================================================
// OK Footwear ERP — Sprint 4, Orders Module
//
// Emitted AFTER the CAPA auto-close transaction commits (post-commit pattern).
// Future Board/Quality module will listen to track complaint resolution KPIs.
// =============================================================================

export class ComplaintResolvedEvent {
  complaintId: string;

  constructor(partial: Partial<ComplaintResolvedEvent>) {
    Object.assign(this, partial);
  }
}
