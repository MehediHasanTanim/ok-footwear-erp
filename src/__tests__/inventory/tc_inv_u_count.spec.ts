// =============================================================================
// TC-INV-U-004 — Stock count variance = physical − system
// =============================================================================

import { StockCountsService } from '@modules/inventory/services/stock-counts.service';

describe('StockCountsService.computeVariance (TC-INV-U-004)', () => {
  it('computes variance as physical_qty - system_qty', () => {
    const service = Object.create(StockCountsService.prototype) as StockCountsService;
    const variance = service.computeVariance(200, 185);
    expect(variance).toBe(-15);
  });

  it('computes surplus when physical exceeds system', () => {
    const service = Object.create(StockCountsService.prototype) as StockCountsService;
    expect(service.computeVariance(100, 110)).toBe(10);
  });
});
