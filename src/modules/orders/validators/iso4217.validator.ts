// =============================================================================
// ISO 4217 Currency Validator
// =============================================================================
// OK Footwear ERP — Sprint 3, Orders Module
//
// Whistlist of ISO 4217 currency codes commonly used in Bangladesh's
// footwear export industry. Used by class-validator decorators in
// Buyer and Order DTOs.
// =============================================================================

import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

// ---------------------------------------------------------------------------
// ISO 4217 whitelist — subset relevant to Bangladesh footwear export
// ---------------------------------------------------------------------------
// Full ISO 4217 has 170+ codes. We whitelist the ones actually used.
// Add more as needed when the business expands to new markets.

export const ISO4217_CURRENCIES = [
  'USD', // US Dollar (primary export currency)
  'EUR', // Euro
  'GBP', // British Pound
  'BDT', // Bangladeshi Taka (local)
  'JPY', // Japanese Yen
  'CAD', // Canadian Dollar
  'AUD', // Australian Dollar
  'CHF', // Swiss Franc
  'CNY', // Chinese Yuan
] as const;

export type Iso4217Currency = (typeof ISO4217_CURRENCIES)[number];

// ---------------------------------------------------------------------------
// Class-validator decorator
// ---------------------------------------------------------------------------

@ValidatorConstraint({ name: 'isIso4217Currency', async: false })
export class Iso4217CurrencyConstraint implements ValidatorConstraintInterface {
  validate(value: string): boolean {
    if (typeof value !== 'string') return false;
    return (ISO4217_CURRENCIES as readonly string[]).includes(value.toUpperCase());
  }

  defaultMessage(): string {
    return `currency must be a valid ISO 4217 code: ${ISO4217_CURRENCIES.join(', ')}`;
  }
}

export function IsIso4217Currency(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: Iso4217CurrencyConstraint,
    });
  };
}
