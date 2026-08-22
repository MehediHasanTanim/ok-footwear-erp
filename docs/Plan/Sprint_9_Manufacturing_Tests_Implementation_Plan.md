# Sprint 9 Test Cases — Implementation Plan

> Status: Implemented (aligned with testing docs)  
> Baseline: Suites already added with Sprint 9 BOM; this pass tightens assertions

Mirror Sprint 7 test-plan layout. Assert against **implemented** exception messages.

---

## Mapping

| ID | File | Assert |
|---|---|---|
| TC-MFG-U-001 | [`src/__tests__/manufacturing/tc_mfg_u.spec.ts`](../../src/__tests__/manufacturing/tc_mfg_u.spec.ts) | `BomService.create` → ConflictException + `BOM version 1.0 already exists for this article` |
| TC-MFG-U-002 | same | `assertApprovedBom` + `ProductionBlockGuard`; no production-order service (Sprint 10). Message: `Production is blocked: no approved BOM for this article`. Guard returns true when approved count ≥ 1 |
| TC-MFG-U-005 | same | `computeSellingPrice(10, 25) === 12.5` (plus 100/20 → 120) |
| TC-DB-CON-003 | [`src/__tests__/manufacturing/integration/tc_db_mfg.spec.ts`](../../src/__tests__/manufacturing/integration/tc_db_mfg.spec.ts) | qty=0 → `/chk_order_lines_quantity_positive/` |
| TC-DB-CON-004 | same | duplicate `size_label` → `/unique/i` |

`ensureConstraints()` re-applies CHECK after `prisma db push`.

---

## Verify

```bash
npx jest --selectProjects unit --testPathPattern="tc_mfg_u" --no-coverage
npx jest --selectProjects integration --testPathPattern="tc_db_mfg" --no-coverage --runInBand
```
