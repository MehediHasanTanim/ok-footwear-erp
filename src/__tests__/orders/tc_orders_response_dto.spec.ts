// =============================================================================
// TC-ORD-RESPDTO — OrderResponseDto Tests
// =============================================================================
// OK Footwear ERP — Sprint 3
//
// Acceptance Test 10: OrderResponseDto.nextAllowedStates matches
// STATUS_TRANSITIONS[currentStatus] exactly for every status in the machine,
// including empty arrays for terminal states.
// =============================================================================

import { plainToInstance, instanceToPlain } from 'class-transformer';
import { OrderResponseDto } from '@modules/orders/dto/orders.dto';
import { STATUS_TRANSITIONS, OrderStatus } from '@modules/orders/services/order-state-machine';

const ALL_STATUSES: OrderStatus[] = [
  'draft',
  'confirmed',
  'in_production',
  'qc',
  'packed',
  'delivered',
  'cancelled',
];

describe('OrderResponseDto', () => {
  describe('nextAllowedStates', () => {
    it('should match STATUS_TRANSITIONS[currentStatus] for every status', () => {
      ALL_STATUSES.forEach((status) => {
        const dto = plainToInstance(OrderResponseDto, {
          id: 'order-1',
          orderNumber: 'ORD-000001',
          buyerId: 'buyer-1',
          articleId: 'article-1',
          status,
          sampleApproved: false,
          totalQuantity: 1000,
          deliveryDate: new Date('2026-12-31'),
          currency: 'USD',
          confirmedAt: null,
          confirmedBy: null,
          cancelledAt: null,
          cancellationReason: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          buyer: { name: 'Test', currency: 'USD' },
          article: { code: 'ART', description: 'Test' },
          orderLines: [],
        });

        expect(dto.nextAllowedStates).toEqual(STATUS_TRANSITIONS[status]);
      });
    });

    it('should return empty array for terminal states (delivered, cancelled)', () => {
      const deliveredDto = plainToInstance(OrderResponseDto, {
        id: 'order-1',
        orderNumber: 'ORD-000001',
        buyerId: 'buyer-1',
        articleId: 'article-1',
        status: 'delivered',
        sampleApproved: false,
        totalQuantity: 1000,
        deliveryDate: new Date('2026-12-31'),
        currency: 'USD',
        createdAt: new Date(),
        updatedAt: new Date(),
        buyer: null,
        article: null,
        orderLines: [],
      });

      expect(deliveredDto.nextAllowedStates).toEqual([]);

      const cancelledDto = plainToInstance(OrderResponseDto, {
        id: 'order-1',
        orderNumber: 'ORD-000001',
        buyerId: 'buyer-1',
        articleId: 'article-1',
        status: 'cancelled',
        sampleApproved: false,
        totalQuantity: 1000,
        deliveryDate: new Date('2026-12-31'),
        currency: 'USD',
        createdAt: new Date(),
        updatedAt: new Date(),
        buyer: null,
        article: null,
        orderLines: [],
      });

      expect(cancelledDto.nextAllowedStates).toEqual([]);
    });

    it('should reflect draft transitions (confirmed, cancelled)', () => {
      const dto = plainToInstance(OrderResponseDto, {
        id: 'order-1',
        orderNumber: 'ORD-000001',
        buyerId: 'buyer-1',
        articleId: 'article-1',
        status: 'draft',
        sampleApproved: false,
        totalQuantity: 1000,
        deliveryDate: new Date('2026-12-31'),
        currency: 'USD',
        createdAt: new Date(),
        updatedAt: new Date(),
        buyer: null,
        article: null,
        orderLines: [],
      });

      expect(dto.nextAllowedStates).toContain('confirmed');
      expect(dto.nextAllowedStates).toContain('cancelled');
      expect(dto.nextAllowedStates).toHaveLength(2);
    });

    it('should reflect confirmed transitions (in_production, cancelled)', () => {
      const dto = plainToInstance(OrderResponseDto, {
        id: 'order-1',
        orderNumber: 'ORD-000001',
        buyerId: 'buyer-1',
        articleId: 'article-1',
        status: 'confirmed',
        sampleApproved: true,
        totalQuantity: 1000,
        deliveryDate: new Date('2026-12-31'),
        currency: 'USD',
        confirmedAt: new Date(),
        confirmedBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        buyer: null,
        article: null,
        orderLines: [],
      });

      expect(dto.nextAllowedStates).toContain('in_production');
      expect(dto.nextAllowedStates).toContain('cancelled');
      expect(dto.nextAllowedStates).toHaveLength(2);
    });
  });

  describe('@Exclude/@Expose', () => {
    it('should expose public fields', () => {
      const order = {
        id: 'order-1',
        orderNumber: 'ORD-000001',
        buyerId: 'buyer-1',
        articleId: 'article-1',
        status: 'draft',
        sampleApproved: false,
        totalQuantity: 1000,
        deliveryDate: new Date('2026-12-31'),
        currency: 'USD',
        confirmedAt: null,
        confirmedBy: null,
        cancelledAt: null,
        cancellationReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        buyer: { name: 'Test', currency: 'USD' },
        article: { code: 'ART', description: 'Test' },
        orderLines: [],
      };

      const dto = plainToInstance(OrderResponseDto, order);
      const json = instanceToPlain(dto) as Record<string, unknown>;

      expect(json.id).toBe('order-1');
      expect(json.orderNumber).toBe('ORD-000001');
      expect(json.status).toBe('draft');
      expect(json.buyer).toEqual({ name: 'Test', currency: 'USD' });
      expect(json.article).toEqual({ code: 'ART', description: 'Test' });
      expect(json.nextAllowedStates).toBeDefined();
    });

    it('should include computed nextAllowedStates in JSON', () => {
      const dto = plainToInstance(OrderResponseDto, {
        id: 'order-1',
        orderNumber: 'ORD-000001',
        buyerId: 'buyer-1',
        articleId: 'article-1',
        status: 'draft',
        sampleApproved: false,
        totalQuantity: 1000,
        deliveryDate: new Date('2026-12-31'),
        currency: 'USD',
        createdAt: new Date(),
        updatedAt: new Date(),
        buyer: null,
        article: null,
        orderLines: [],
      });

      const json = instanceToPlain(dto) as Record<string, unknown>;
      expect(json.nextAllowedStates).toEqual(['confirmed', 'cancelled']);
    });
  });
});
