// =============================================================================
// QuotationsController — Route registration unit tests
// =============================================================================
// Ensures static path `conversion-rate` is registered before `:quotationId`
// so Nest does not capture the KPI segment as a quotation UUID.
// =============================================================================

import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { QuotationsController } from '@modules/orders/controllers/quotations.controller';

describe('QuotationsController route order', () => {
  it('registers GET conversion-rate before GET :quotationId', () => {
    const proto = QuotationsController.prototype as Record<string, unknown>;
    const getHandlers: { name: string; path: string }[] = [];

    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor') continue;
      const handler = proto[name];
      if (typeof handler !== 'function') continue;

      const method = Reflect.getMetadata(METHOD_METADATA, handler);
      const path = Reflect.getMetadata(PATH_METADATA, handler);
      if (method === RequestMethod.GET && typeof path === 'string') {
        getHandlers.push({ name, path });
      }
    }

    const conversionIdx = getHandlers.findIndex((h) => h.path === 'conversion-rate');
    const detailIdx = getHandlers.findIndex((h) => h.path === ':quotationId');

    expect(conversionIdx).toBeGreaterThanOrEqual(0);
    expect(detailIdx).toBeGreaterThanOrEqual(0);
    expect(conversionIdx).toBeLessThan(detailIdx);
  });
});
