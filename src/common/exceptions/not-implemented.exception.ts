// =============================================================================
// NotImplementedException — Feature not yet implemented (Sprint-gated)
// =============================================================================
// OK Footwear ERP — Sprint 4
//
// Used for stubs that are intentionally unimplemented and will be filled in
// by a future sprint. Always includes the target sprint in the message so
// developers know exactly when to expect the feature.
//
// HTTP status: 501 Not Implemented (per RFC 7231 §6.6.2)
// =============================================================================

import { HttpException, HttpStatus } from '@nestjs/common';

export class NotImplementedException extends HttpException {
  constructor(feature: string, targetSprint: string) {
    super(
      {
        statusCode: HttpStatus.NOT_IMPLEMENTED,
        message: `${feature} is not yet implemented`,
        detail: `This feature is planned for ${targetSprint}. Check the implementation plan for timeline.`,
      },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }
}
