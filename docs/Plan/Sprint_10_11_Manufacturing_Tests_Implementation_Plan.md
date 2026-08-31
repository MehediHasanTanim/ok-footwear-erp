# Sprint 10–11 Test Cases — Implementation Plan

> Status: Implemented  
> Baseline: Sprint 10–11 production + [`DailyProductionService`](../../src/modules/manufacturing/services/daily-production.service.ts)

Mirror Sprint 9 test-plan layout. Assert against **implemented** exception messages and DB generated columns.

---

## Mapping

| ID | File | Assert |
|---|---|---|
| TC-MFG-U-003 | [`src/__tests__/manufacturing/tc_mfg_u.spec.ts`](../../src/__tests__/manufacturing/tc_mfg_u.spec.ts) | `DailyProductionService.record` maps DB `efficiency_pct: 80` → `efficiencyPct === 80` (target=100, produced=80) |
| TC-MFG-U-004 | same | `efficiency_pct: null` when `target_qty: 0` → `efficiencyPct === null` |
| TC-MFG-U-006 | same | `update()` on locked row → 422 + `Daily production entry is locked and cannot be updated`; only one `$queryRaw` (no UPDATE) |
| TC-MFG-U-003 (DB) | [`src/__tests__/manufacturing/integration/tc_db_mfg_part.spec.ts`](../../src/__tests__/manufacturing/integration/tc_db_mfg_part.spec.ts) | PostgreSQL GENERATED column: `efficiency_pct = 80` for target=100, produced=80 |
| TC-MFG-U-004 (DB) | same | INSERT with `target_qty=0` → `efficiency_pct IS NULL` |
| TC-MFG-U-006 (DB) | same | Real DB row with `locked=TRUE` → service `update()` throws 422 |
| TC-DB-PART-001 | same | 2025-dated row exists in `mfg.daily_productions_2025` |
| TC-DB-PART-002 | same | `prod_date >= '2026-01-01'` excludes 2025 rows (partition key is **`prod_date`**, not `txn_date`) |

Partition DDL for integration tests: [`src/__tests__/manufacturing/helpers/deploy-daily-productions.ts`](../../src/__tests__/manufacturing/helpers/deploy-daily-productions.ts) (mirrors migration; `db push` does not create partitioned tables).

---

## Verify

```bash
npx jest --selectProjects unit --testPathPattern="tc_mfg_u" --no-coverage
npx jest --selectProjects integration --testPathPattern="tc_db_mfg_part" --no-coverage --runInBand
npm test -- --testPathPattern=manufacturing --runInBand
```

Requires Docker (testcontainers for integration project).
