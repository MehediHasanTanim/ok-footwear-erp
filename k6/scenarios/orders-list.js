/**
 * TC-PERF-001: Orders list — normal load
 * 50 VUs × 3m → p95 < 300ms, error rate < 0.1%
 *
 * Run (manual / staging — requires k6 binary):
 *   k6 run -e BASE_URL=http://localhost:7100 -e TOKEN=<jwt> k6/scenarios/orders-list.js
 *   npm run perf:orders
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:7100';
const TOKEN = __ENV.TOKEN || '';

export const options = {
  scenarios: {
    normal: { executor: 'constant-vus', vus: 50, duration: '3m' },
  },
  thresholds: {
    http_req_duration: ['p(95)<300', 'p(99)<500'],
    http_req_failed: ['rate<0.001'],
  },
};

export default function () {
  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    Accept: 'application/json',
  };

  const res = http.get(`${BASE_URL}/api/v1/orders?page=1&limit=20`, { headers });

  check(res, {
    'status 200': (r) => r.status === 200,
    'has data array': (r) => {
      try {
        return JSON.parse(String(r.body)).data !== undefined;
      } catch {
        return false;
      }
    },
  });

  sleep(randomIntBetween(1, 3));
}
