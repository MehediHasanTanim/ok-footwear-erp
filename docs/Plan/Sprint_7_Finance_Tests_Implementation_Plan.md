# Sprint 7 Test Cases — Implementation Plan

> Status: Implemented  
> Baseline: No `src/__tests__/finance/`; no `k6/` directory

Mirror Sprint 6 inventory test layout. Assert against **implemented** exception messages and routes.

---

## Locked decisions

| Decision | Choice |
|---|---|
| Unit target | Real `FinanceService.postJournal` with mocked Prisma + DocNumber |
| Assertion strings | `"Journal must balance…"`, ``Cannot post to a ${status} GL period`` |
| HTTP path | `POST /finance/gl/entries` (no global prefix in Nest test app) |
| I-00x body | RFC 7807 `detail`; journal `status === 'posted'` |
| DB suite | `ensureFinLedger()` redeploys partitions + trigger (db push skips migration SQL) |
| TC-PERF-001 | `k6/scenarios/orders-list.js` → `/api/v1/orders` |

---

## File layout

```
src/__tests__/finance/tc_fin_u.spec.ts
src/__tests__/finance/integration/tc_db_fin.spec.ts
src/__tests__/finance/integration/tc_fin_i.spec.ts
k6/scenarios/orders-list.js
k6/README.md
```

---

## Verify

```bash
npx jest --selectProjects unit --testPathPattern="tc_fin_u" --no-coverage
npx jest --selectProjects integration --testPathPattern="tc_db_fin|tc_fin_i" --no-coverage --runInBand
k6 run -e BASE_URL=... -e TOKEN=... k6/scenarios/orders-list.js
```

---

## Acceptance

- [x] U-001..003 unit specs
- [x] DB-FIN-001..003 + DB-CON-001..002
- [x] I-001..003 HTTP integration
- [x] k6 PERF-001 harness + npm script
