import { PipeTransform, Injectable } from '@nestjs/common';

/**
 * Trims leading and trailing whitespace from string values.
 *
 * Usage: @Body(new TrimPipe()) body: CreateOrderDto
 *
 * Applied per-property; skips non-string values.
 */
@Injectable()
export class TrimPipe implements PipeTransform {
  transform(value: unknown): unknown {
    if (typeof value === 'string') {
      return value.trim();
    }
    if (Array.isArray(value)) {
      return value.map((v) => (typeof v === 'string' ? v.trim() : v));
    }
    if (typeof value === 'object' && value !== null) {
      for (const key of Object.keys(value as Record<string, unknown>)) {
        const val = (value as Record<string, unknown>)[key];
        if (typeof val === 'string') {
          (value as Record<string, unknown>)[key] = val.trim();
        }
      }
    }
    return value;
  }
}
