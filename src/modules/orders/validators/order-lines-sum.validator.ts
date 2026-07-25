// =============================================================================
// @ValidateOrderLinesSum — Custom class-validator decorator
// =============================================================================
// OK Footwear ERP — Sprint 3, Orders Module
//
// Validates that sum(orderLines[*].quantity) === totalQuantity on
// CreateOrderDto. Produces a field-level validation error on orderLines
// when the sum mismatches.
//
// This is reusable and independently unit-testable — see
// tc_orders_val_u_001.spec.ts for isolated tests.
// =============================================================================

import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

export interface OrderLineInput {
  sizeLabel: string;
  quantity: number;
  unitPrice: number;
}

export interface OrderWithLines {
  totalQuantity: number;
  orderLines: OrderLineInput[];
}

@ValidatorConstraint({ name: 'validateOrderLinesSum', async: false })
export class OrderLinesSumConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const obj = args.object as OrderWithLines;
    const lines = obj.orderLines;

    if (!Array.isArray(lines) || lines.length === 0) {
      // Let @ArrayMinSize handle the "no lines" case
      return true;
    }

    const sum = lines.reduce((acc, line) => acc + (Number(line.quantity) || 0), 0);
    return sum === Number(obj.totalQuantity);
  }

  defaultMessage(args: ValidationArguments): string {
    const obj = args.object as OrderWithLines;
    const lines = obj.orderLines ?? [];
    const sum = lines.reduce((acc, line) => acc + (Number(line.quantity) || 0), 0);
    return `Sum of orderLines quantities (${sum}) must equal totalQuantity (${obj.totalQuantity})`;
  }
}

export function ValidateOrderLinesSum(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: OrderLinesSumConstraint,
    });
  };
}
