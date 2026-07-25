// =============================================================================
// TC-ORD-DTO — DTO Validation Unit Tests
// =============================================================================
// OK Footwear ERP — Sprint 3
//
// Tests class-validator decorators on CreateOrderDto, StatusTransitionDto, etc.
// =============================================================================

import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreateOrderDto,
  OrderLineDto,
  StatusTransitionDto,
} from '@modules/orders/dto/orders.dto';

describe('CreateOrderDto validation', () => {
  // =========================================================================
  // OrderLines sum validation
  // =========================================================================

  it('should pass when sum(orderLines) === totalQuantity', async () => {
    const dto = plainToInstance(CreateOrderDto, {
      buyerId: '550e8400-e29b-41d4-a716-446655440000',
      articleId: '550e8400-e29b-41d4-a716-446655440001',
      totalQuantity: 1000,
      deliveryDate: '2026-12-31',
      currency: 'USD',
      orderLines: [
        { sizeLabel: '38', quantity: 500, unitPrice: 12.5 },
        { sizeLabel: '39', quantity: 500, unitPrice: 12.5 },
      ],
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail when sum(orderLines) !== totalQuantity', async () => {
    const dto = plainToInstance(CreateOrderDto, {
      buyerId: '550e8400-e29b-41d4-a716-446655440000',
      articleId: '550e8400-e29b-41d4-a716-446655440001',
      totalQuantity: 1000,
      deliveryDate: '2026-12-31',
      currency: 'USD',
      orderLines: [
        { sizeLabel: '38', quantity: 300, unitPrice: 12.5 },
        { sizeLabel: '39', quantity: 300, unitPrice: 12.5 },
      ],
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.property).toBe('orderLines');
    expect(errors[0]?.constraints?.['validateOrderLinesSum']).toContain('must equal totalQuantity');
  });

  // =========================================================================
  // unitPrice > 0
  // =========================================================================

  it('should fail when unitPrice <= 0', async () => {
    const dto = plainToInstance(CreateOrderDto, {
      buyerId: '550e8400-e29b-41d4-a716-446655440000',
      articleId: '550e8400-e29b-41d4-a716-446655440001',
      totalQuantity: 10,
      deliveryDate: '2026-12-31',
      currency: 'USD',
      orderLines: [
        { sizeLabel: '38', quantity: 10, unitPrice: 0 },
      ],
    });

    const errors = await validate(dto);

    // There should be errors on the nested orderLines
    const nestedErrors = errors.find((e) => e.property === 'orderLines');
    expect(nestedErrors).toBeDefined();

    if (nestedErrors?.children?.[0]) {
      const unitPriceErrors = nestedErrors.children[0].children?.find(
        (c) => c.property === 'unitPrice',
      );
      expect(unitPriceErrors).toBeDefined();
    }
  });

  // =========================================================================
  // Missing required fields
  // =========================================================================

  it('should fail when orderLines is empty', async () => {
    const dto = plainToInstance(CreateOrderDto, {
      buyerId: '550e8400-e29b-41d4-a716-446655440000',
      articleId: '550e8400-e29b-41d4-a716-446655440001',
      totalQuantity: 1000,
      deliveryDate: '2026-12-31',
      currency: 'USD',
      orderLines: [],
    });

    const errors = await validate(dto);
    const orderLinesError = errors.find((e) => e.property === 'orderLines');
    expect(orderLinesError).toBeDefined();
    expect(orderLinesError?.constraints?.['arrayMinSize']).toBeDefined();
  });

  // =========================================================================
  // StatusTransitionDto
  // =========================================================================

  describe('StatusTransitionDto', () => {
    it('should require toStatus', async () => {
      const dto = plainToInstance(StatusTransitionDto, {});
      const errors = await validate(dto);
      const toStatusError = errors.find((e) => e.property === 'toStatus');
      expect(toStatusError).toBeDefined();
    });
  });
});
