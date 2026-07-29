// =============================================================================
// Future Date Validator
// =============================================================================
// OK Footwear ERP — Sprint 3, Orders Module
//
// Rejects delivery dates that are today or in the past (UTC calendar date).
// =============================================================================

import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'isFutureDate', async: false })
export class IsFutureDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' && !(value instanceof Date)) {
      return false;
    }

    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return false;
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const delivery = new Date(parsed);
    delivery.setUTCHours(0, 0, 0, 0);

    return delivery.getTime() > today.getTime();
  }

  defaultMessage(): string {
    return 'deliveryDate must be a future date';
  }
}

export function IsFutureDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsFutureDateConstraint,
    });
  };
}
