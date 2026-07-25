// =============================================================================
// TC-ORD-SM — Order State Machine Unit Tests
// =============================================================================
// OK Footwear ERP — Sprint 3
//
// Acceptance Tests Covered:
//   3. confirmed → in_production fails when sample_approved=false, succeeds when true
//   6. Terminal states reject transitions; draft/confirmed → cancelled works
//   10. nextAllowedStates matches STATUS_TRANSITIONS for every status
// =============================================================================

import {
  STATUS_TRANSITIONS,
  nextAllowedStates,
  canTransition,
  validateTransition,
  OrderStatus,
  SAMPLE_GATED_TRANSITION,
} from '@modules/orders/services/order-state-machine';
import { BadRequestException } from '@nestjs/common';

// ---------------------------------------------------------------------------
// Helper: all valid statuses
// ---------------------------------------------------------------------------

const ALL_STATUSES: OrderStatus[] = [
  'draft',
  'confirmed',
  'in_production',
  'qc',
  'packed',
  'delivered',
  'cancelled',
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Order State Machine', () => {
  // =========================================================================
  // STATUS_TRANSITIONS map
  // =========================================================================

  describe('STATUS_TRANSITIONS', () => {
    it('should define transitions for every status', () => {
      ALL_STATUSES.forEach((status) => {
        expect(STATUS_TRANSITIONS).toHaveProperty(status);
        expect(Array.isArray(STATUS_TRANSITIONS[status])).toBe(true);
      });
    });

    it('should have empty arrays for terminal states', () => {
      expect(STATUS_TRANSITIONS['delivered']).toEqual([]);
      expect(STATUS_TRANSITIONS['cancelled']).toEqual([]);
    });

    it('should allow draft → confirmed and draft → cancelled', () => {
      expect(STATUS_TRANSITIONS['draft']).toContain('confirmed');
      expect(STATUS_TRANSITIONS['draft']).toContain('cancelled');
      expect(STATUS_TRANSITIONS['draft']).toHaveLength(2);
    });

    it('should allow confirmed → in_production and confirmed → cancelled', () => {
      expect(STATUS_TRANSITIONS['confirmed']).toContain('in_production');
      expect(STATUS_TRANSITIONS['confirmed']).toContain('cancelled');
      expect(STATUS_TRANSITIONS['confirmed']).toHaveLength(2);
    });

    it('should define linear progression for production states', () => {
      expect(STATUS_TRANSITIONS['in_production']).toEqual(['qc']);
      expect(STATUS_TRANSITIONS['qc']).toEqual(['packed']);
      expect(STATUS_TRANSITIONS['packed']).toEqual(['delivered']);
    });
  });

  // =========================================================================
  // nextAllowedStates()
  // =========================================================================

  describe('nextAllowedStates()', () => {
    it('should return the same as STATUS_TRANSITIONS[currentStatus]', () => {
      ALL_STATUSES.forEach((status) => {
        expect(nextAllowedStates(status)).toEqual(STATUS_TRANSITIONS[status]);
      });
    });

    it('should return empty array for unknown status', () => {
      expect(nextAllowedStates('nonexistent' as OrderStatus)).toEqual([]);
    });
  });

  // =========================================================================
  // canTransition()
  // =========================================================================

  describe('canTransition()', () => {
    // --- Valid transitions ---
    it('should allow draft → confirmed', () => {
      expect(canTransition('draft', 'confirmed', false)).toBe(true);
    });

    it('should allow draft → cancelled', () => {
      expect(canTransition('draft', 'cancelled', false)).toBe(true);
    });

    // --- Sample approval gate ---
    it('should BLOCK confirmed → in_production when sample_approved = false', () => {
      expect(canTransition('confirmed', 'in_production', false)).toBe(false);
    });

    it('should ALLOW confirmed → in_production when sample_approved = true', () => {
      expect(canTransition('confirmed', 'in_production', true)).toBe(true);
    });

    it('should allow confirmed → cancelled regardless of sample_approved', () => {
      expect(canTransition('confirmed', 'cancelled', false)).toBe(true);
      expect(canTransition('confirmed', 'cancelled', true)).toBe(true);
    });

    // --- Terminal states ---
    it('should reject any transition from delivered', () => {
      ALL_STATUSES.forEach((to) => {
        expect(canTransition('delivered', to, true)).toBe(false);
      });
    });

    it('should reject any transition from cancelled', () => {
      ALL_STATUSES.forEach((to) => {
        expect(canTransition('cancelled', to, true)).toBe(false);
      });
    });

    // --- Invalid jumps ---
    it('should reject draft → delivered (skip all production)', () => {
      expect(canTransition('draft', 'delivered', true)).toBe(false);
    });

    it('should reject in_production → delivered (skip qc + packed)', () => {
      expect(canTransition('in_production', 'delivered', true)).toBe(false);
    });

    it('should reject confirmed → delivered', () => {
      expect(canTransition('confirmed', 'delivered', true)).toBe(false);
    });

    // --- Self-transition ---
    it('should reject transition to same status', () => {
      ALL_STATUSES.forEach((status) => {
        if (STATUS_TRANSITIONS[status]?.includes(status)) {
          // If self-transition is in the map, it's by design; skip
          return;
        }
        expect(canTransition(status, status, true)).toBe(false);
      });
    });
  });

  // =========================================================================
  // validateTransition() — throws on invalid
  // =========================================================================

  describe('validateTransition()', () => {
    it('should not throw for valid transitions', () => {
      expect(() => validateTransition('draft', 'confirmed', false)).not.toThrow();
      expect(() => validateTransition('draft', 'cancelled', false)).not.toThrow();
      expect(() => validateTransition('confirmed', 'in_production', true)).not.toThrow();
      expect(() => validateTransition('in_production', 'qc', false)).not.toThrow();
      expect(() => validateTransition('qc', 'packed', false)).not.toThrow();
      expect(() => validateTransition('packed', 'delivered', false)).not.toThrow();
    });

    it('should throw BadRequestException for terminal state', () => {
      expect(() => validateTransition('delivered', 'draft', true)).toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for invalid from→to', () => {
      expect(() => validateTransition('draft', 'delivered', true)).toThrow(
        BadRequestException,
      );
    });

    it('should throw with sample-not-approved message', () => {
      try {
        validateTransition('confirmed', 'in_production', false);
        fail('Should have thrown');
      } catch (e) {
        const err = e as BadRequestException;
        const resp = err.getResponse() as Record<string, unknown>;
        expect(resp['message']).toBe('Sample approval required');
        expect(resp['detail']).toContain('sample must be approved');
      }
    });

    it('should throw with descriptive detail for invalid transition', () => {
      try {
        validateTransition('packed', 'draft', true);
        fail('Should have thrown');
      } catch (e) {
        const err = e as BadRequestException;
        const resp = err.getResponse() as Record<string, unknown>;
        expect(resp['message']).toBe('Invalid state transition');
        expect(resp['detail']).toContain('packed');
        expect(resp['detail']).toContain('delivered');
      }
    });
  });

  // =========================================================================
  // SAMPLE_GATED_TRANSITION constant
  // =========================================================================

  describe('SAMPLE_GATED_TRANSITION', () => {
    it('should be confirmed → in_production', () => {
      expect(SAMPLE_GATED_TRANSITION.from).toBe('confirmed');
      expect(SAMPLE_GATED_TRANSITION.to).toBe('in_production');
    });
  });
});
