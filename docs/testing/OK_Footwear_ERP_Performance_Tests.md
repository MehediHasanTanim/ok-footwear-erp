# OK Footwear ERP — Performance Test Cases
**Scope:** Load, stress, and spike tests using k6 against the staging environment. Validates that SLA thresholds are maintained under realistic and peak load conditions.

---

## SLA Targets

| Metric | Normal Load (50 VUs) | Peak Load (200 VUs) | Spike (500 VUs) |
|---|---|---|---|
| p50 latency | < 100ms | < 200ms | < 400ms |
| p95 latency | < 300ms | < 500ms | < 1000ms |
| p99 latency | < 500ms | < 1000ms | < 2000ms |
| Error rate | < 0.1% | < 1% | < 2% |
| Throughput | ≥ 500 req/s | ≥ 1000 req/s | ≥ 500 req/s |

---

## TC-PERF-001: Orders list — normal load
```javascript
// k6/scenarios/orders-list.js
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
  const res = http.get(`${BASE_URL}/api/orders?page=1&limit=20`, { headers });
  check(res, {
    'status 200': r => r.status === 200,
    'has data array': r => JSON.parse(r.body).data !== undefined,
    'response under 300ms': r => r.timings.duration < 300,
  });
  sleep(randomIntBetween(1, 3));
}
```

## TC-PERF-002: Dashboard KPI widgets — normal load
```javascript
export default function () {
  const endpoints = [
    '/api/dashboard/kpi/orders-summary',
    '/api/dashboard/kpi/production-efficiency',
    '/api/dashboard/kpi/stock-alerts',
    '/api/dashboard/kpi/payroll-summary',
  ];
  endpoints.forEach(url => {
    const res = http.get(`${BASE_URL}${url}`, { headers });
    check(res, { 'status 200': r => r.status === 200, 'under 200ms': r => r.timings.duration < 200 });
  });
  sleep(2);
}
```

## TC-PERF-003: Employee search (trigram) — concurrent users
```javascript
const searchTerms = ['Karim', 'Rahim', 'Fatema', 'Ahmed', 'Begum'];

export const options = {
  scenarios: { search: { executor: 'constant-vus', vus: 100, duration: '2m' } },
  thresholds: { http_req_duration: ['p(95)<200'] },
};

export default function () {
  const term = searchTerms[Math.floor(Math.random() * searchTerms.length)];
  const res = http.get(`${BASE_URL}/api/employees?search=${term}`, { headers });
  check(res, { 'status 200': r => r.status === 200, 'returns array': r => Array.isArray(JSON.parse(r.body).data) });
  sleep(1);
}
```

## TC-PERF-004: Stock summary read — peak load
```javascript
export const options = {
  scenarios: {
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 200 },
        { duration: '2m', target: 200 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/api/inventory/stock-summary`, { headers });
  check(res, { 'status 200': r => r.status === 200 });
  sleep(randomIntBetween(1, 2));
}
```

## TC-PERF-005: GL account balance query — finance module
```javascript
export const options = {
  scenarios: { gl_read: { executor: 'constant-vus', vus: 30, duration: '3m' } },
  thresholds: { http_req_duration: ['p(95)<400'] },
};

export default function () {
  const accounts = ['1010', '4001', '5010', '6110'];
  const account = accounts[Math.floor(Math.random() * accounts.length)];
  const res = http.get(`${BASE_URL}/api/finance/accounts/${account}/balance?from=2026-01-01&to=2026-05-31`, { headers });
  check(res, { 'status 200': r => r.status === 200, 'has balance': r => JSON.parse(r.body).data.balance !== undefined });
  sleep(2);
}
```

## TC-PERF-006: Concurrent payroll report downloads — background jobs
```javascript
export const options = {
  scenarios: { reports: { executor: 'constant-vus', vus: 20, duration: '2m' } },
  thresholds: { http_req_duration: ['p(95)<2000'] }, // reports take longer
};

export default function () {
  // Trigger report generation
  const trigger = http.post(`${BASE_URL}/api/reports/payroll-summary`, JSON.stringify({ month: 5, year: 2026 }), { headers });
  check(trigger, { 'accepted': r => r.status === 202 });

  const jobId = JSON.parse(trigger.body).data.jobId;
  // Poll until ready (max 30s)
  let attempts = 0;
  while (attempts < 30) {
    const poll = http.get(`${BASE_URL}/api/reports/jobs/${jobId}`, { headers });
    const status = JSON.parse(poll.body).data.status;
    if (status === 'completed') break;
    sleep(1);
    attempts++;
  }
  check({ attempts }, { 'completed within 30s': a => a.attempts < 30 });
}
```

## TC-PERF-007: Spike test — sudden burst of login requests
```javascript
export const options = {
  scenarios: {
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 500 }, // sudden spike
        { duration: '1m',  target: 500 }, // sustain
        { duration: '10s', target: 0   }, // recover
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(99)<2000'],
    http_req_failed: ['rate<0.02'],
  },
};

export default function () {
  const res = http.post(`${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: `user${__VU}@okfootwear.com`, password: 'Test@123' }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(res, { 'login succeeded or handled': r => [200, 401, 429].includes(r.status) });
  sleep(1);
}
```

## TC-PERF-008: Attendance sync endpoint — biometric device simulation
```javascript
const DEVICES = 10; // simulating 10 biometric devices

export const options = {
  scenarios: { biometric: { executor: 'constant-vus', vus: DEVICES, duration: '5m' } },
  thresholds: { http_req_duration: ['p(95)<200'] },
};

export default function () {
  // Each VU simulates one device pushing punch records every ~5 seconds
  const punch = {
    employeeId: `EMP-${String(Math.floor(Math.random() * 500)).padStart(6, '0')}`,
    timestamp: new Date().toISOString(),
    direction: Math.random() > 0.5 ? 'IN' : 'OUT',
    deviceId: `DEVICE-${__VU}`,
  };
  const res = http.post(`${BASE_URL}/api/attendance/biometric`,
    JSON.stringify(punch),
    { headers: { 'Content-Type': 'application/json', 'X-Device-Key': DEVICE_KEY } }
  );
  check(res, { 'accepted': r => r.status === 201 });
  sleep(5);
}
```

---

## TC-PERF-009: Soak test — sustained load over 30 minutes
```javascript
export const options = {
  scenarios: {
    soak: { executor: 'constant-vus', vus: 50, duration: '30m' },
  },
  thresholds: {
    http_req_duration: ['p(95)<300'],
    http_req_failed: ['rate<0.001'],
  },
};

// Mixed workload simulating real user behaviour
export default function () {
  const flow = Math.random();
  if (flow < 0.3) {
    http.get(`${BASE_URL}/api/orders?page=1&limit=10`, { headers });
  } else if (flow < 0.5) {
    http.get(`${BASE_URL}/api/inventory/stock-summary`, { headers });
  } else if (flow < 0.7) {
    http.get(`${BASE_URL}/api/employees?page=1&limit=20`, { headers });
  } else if (flow < 0.85) {
    http.get(`${BASE_URL}/api/dashboard/kpi/orders-summary`, { headers });
  } else {
    http.get(`${BASE_URL}/api/notifications`, { headers });
  }
  sleep(randomIntBetween(1, 5));
}
```

---

*Total performance test scenarios: 9 | Tool: k6 | Runs on merge to main*
