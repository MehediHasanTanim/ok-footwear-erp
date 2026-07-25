// =============================================================================
// Order State Machine — Single Source of Truth for Status Transitions
// =============================================================================
// OK Footwear ERP — Sprint 3, Orders Module
//
// This module defines the ONLY valid status transitions for orders.
// No controller, service, or guard should hardcode transition logic inline.
//
// Usage:
//   import { STATUS_TRANSITIONS, canTransition, validateTransition } from './order-state-machine';
//
//   if (!canTransition(order.status, toStatus, order.sampleApproved)) {
//     throw new BadRequestException(...);
//   }
// =============================================================================

import { BadRequestException } from '@nestjs/common';

// Re-export OrderStatus for convenience (the Prisma-generated enum is the source of truth)
// We define our own string union for independence from Prisma in tests.
export type OrderStatus =
  | 'draft'
  | 'confirmed'
  | 'in_production'
  | 'qc'
  | 'packed'
  | 'delivered'
  | 'cancelled';

/**
 * All valid status transitions.
 *
 * Map structure: Record<fromStatus, allowed_toStatus[]>
 *
 * Terminal states (delivered, cancelled) have empty arrays —
 * no further transitions are allowed.
 */
export const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['in_production', 'cancelled'],
  in_production: ['qc'],
  qc: ['packed'],
  packed: ['delivered'],
  delivered: [],
  cancelled: [],
};

/**
 * The specific transition that requires sample_approved = true.
 */
export const SAMPLE_GATED_TRANSITION: { from: OrderStatus; to: OrderStatus } = {
  from: 'confirmed',
  to: 'in_production',
};

/**
 * Determine the next valid states for a given current status.
 */
export function nextAllowedStates(currentStatus: OrderStatus): OrderStatus[] {
  return STATUS_TRANSITIONS[currentStatus] ?? [];
}

/**
 * Check whether a transition is valid.
 *
 * @param from  - Current order status
 * @param to    - Target status
 * @param sampleApproved - Whether the sample has been approved (only checked
 *                         for confirmed → in_production)
 * @returns true if the transition is allowed
 */
export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  sampleApproved: boolean,
): boolean {
  const allowed = STATUS_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    return false;
  }

  // Sample approval gate: confirmed → in_production blocked unless sample_approved = true
  if (
    from === SAMPLE_GATED_TRANSITION.from &&
    to === SAMPLE_GATED_TRANSITION.to &&
    !sampleApproved
  ) {
    return false;
  }

  return true;
}

/**
 * Validate a transition and throw a descriptive BadRequestException if invalid.
 *
 * This is the primary entry point for the OrdersService state-change method.
 * It produces RFC 7807-compatible error details.
 */
export function validateTransition(
  from: OrderStatus,
  to: OrderStatus,
  sampleApproved: boolean,
): void {
  const allowed = STATUS_TRANSITIONS[from];

  if (!allowed || allowed.length === 0) {
    throw new BadRequestException({
      statusCode: 400,
      message: 'Invalid state transition',
      detail: `Order status '${from}' is a terminal state and cannot be changed.`,
    });
  }

  if (!allowed.includes(to)) {
    throw new BadRequestException({
      statusCode: 400,
      message: 'Invalid state transition',
      detail: `Cannot transition from '${from}' to '${to}'. Allowed transitions: ${allowed.join(', ')}.`,
    });
  }

  // Sample approval gate
  if (
    from === SAMPLE_GATED_TRANSITION.from &&
    to === SAMPLE_GATED_TRANSITION.to &&
    !sampleApproved
  ) {
    throw new BadRequestException({
      statusCode: 400,
      message: 'Sample approval required',
      detail:
        'Cannot transition to in_production: sample must be approved first. Set sample_approved = true before confirming production.',
    });
  }
}
