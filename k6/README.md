# k6 performance scenarios

Sprint 7 includes **TC-PERF-001** (Orders list, normal load). These scripts are **manual / staging** — they are not run by Jest CI.

## Prerequisites

- [k6](https://k6.io/docs/get-started/installation/) installed locally
- API reachable (e.g. `http://localhost:7100` or staging)
- A valid JWT with `orders:read` (or equivalent) in `TOKEN`

## TC-PERF-001 — Orders list

```bash
k6 run \
  -e BASE_URL=http://localhost:7100 \
  -e TOKEN=$TOKEN \
  k6/scenarios/orders-list.js
```

Or via npm:

```bash
BASE_URL=http://localhost:7100 TOKEN=$TOKEN npm run perf:orders
```

### Thresholds

| Metric | Target |
|---|---|
| VUs × duration | 50 × 3m |
| p95 latency | < 300ms |
| p99 latency | < 500ms |
| Error rate | < 0.1% (`rate<0.001`) |

Endpoint: `GET /api/v1/orders?page=1&limit=20`
