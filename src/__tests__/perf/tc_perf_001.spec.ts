// =============================================================================
// TC-PERF-001 — k6 orders-list harness is present and matches SLA (CI gate)
// Full 50 VU × 3m run remains manual: npm run perf:orders
// =============================================================================

import { readFileSync } from 'fs';
import { join } from 'path';

describe('TC-PERF-001 Orders list k6 scenario', () => {
  const script = readFileSync(
    join(__dirname, '../../../k6/scenarios/orders-list.js'),
    'utf8',
  );

  it('uses 50 VUs for 3 minutes with p95 < 300ms and error rate < 0.1%', () => {
    expect(script).toContain("vus: 50");
    expect(script).toContain("duration: '3m'");
    expect(script).toContain("p(95)<300");
    expect(script).toContain("rate<0.001");
  });

  it('hits GET /api/v1/orders?page=1&limit=20', () => {
    expect(script).toContain('/api/v1/orders?page=1&limit=20');
  });
});
