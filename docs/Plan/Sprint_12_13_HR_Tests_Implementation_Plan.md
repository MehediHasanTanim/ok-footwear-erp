# Sprint 12–13 HR Test Cases — Implementation Plan

> Status: Implemented  
> Baseline: Sprint 12–13 HR module per [`Sprint_12_13_HR_Implementation_Plan.md`](Sprint_12_13_HR_Implementation_Plan.md)

Mirror [`Sprint_10_11_Manufacturing_Tests_Implementation_Plan.md`](Sprint_10_11_Manufacturing_Tests_Implementation_Plan.md): named TC IDs, assert against **implemented** messages and DB objects.

---

## Mapping

| ID | File | Assert |
|---|---|---|
| TC-HR-U-001 | [`src/__tests__/hr/tc_hr_u.spec.ts`](../../src/__tests__/hr/tc_hr_u.spec.ts) | `computeLopDeduction(basic, workingDays, lopDays)` — 3 `it.each` rows (30k/26/2 → 2307.69, etc.) |
| TC-HR-U-002 | same | `PfService.calculateContribution(30_000)` → `{ employee: 3000, employer: 3000 }` |
| TC-HR-U-005 | same | `computeGratuityAmount(join, exit, basic)` — 4 gratuity fixtures (6yr, 5y6m, 5y5m, <1yr) |
| TC-HR-U-006 | same | `LeaveService.apply` with balance 2.5, request 5 days → 422 + `Insufficient leave balance` |
| TC-HR-U-007 | same | Half-day `apply({ halfDay: 'morning' })` → `totalDays === 0.5` |
| TC-HR-U-008 | same | Overlap mock → 422 + `Overlapping leave request exists for this date range` |
| TC-HR-U-009 | same | `computeAdvanceInstalment(30_000, 3) === 10_000` |
| TC-DB-HR-001 | [`src/__tests__/hr/integration/tc_db_hr.spec.ts`](../../src/__tests__/hr/integration/tc_db_hr.spec.ts) | `hr.compute_gratuity()` — 6 completed years → **207,692.31** |
| TC-DB-HR-002 | same | 5y 6m rounds up to 6 years → **207,692.31** |
| TC-DB-HR-003 | same | 5y 5m stays 5 years → **173,076.92** |
| TC-DB-HR-004 | same | < 1 year service (join 2025-05-01, exit 2025-10-01) → **0** |
| TC-DB-CON-005 | same | Factory employee with `factory_category: NULL` → `chk_factory_cat` violation |
| TC-SEC-ENC-001 | [`src/__tests__/hr/integration/tc_sec_hr_enc.spec.ts`](../../src/__tests__/hr/integration/tc_sec_hr_enc.spec.ts) | NID stored as BYTEA in `hr.employee_secrets`, not plaintext |
| TC-SEC-ENC-002 | same | Bank account hex blob ≠ plaintext; decrypt with test key returns original |

Production helpers: [`src/modules/hr/utils/`](../../src/modules/hr/utils/) (`lop.util.ts`, `gratuity.util.ts`, `salary-advance.util.ts`).

Integration DDL for `hr.compute_gratuity()`: [`src/__tests__/hr/helpers/deploy-hr-schema.ts`](../../src/__tests__/hr/helpers/deploy-hr-schema.ts) (`db push` does not create PG functions).

Fixtures: [`src/__tests__/hr/helpers/hr-fixtures.ts`](../../src/__tests__/hr/helpers/hr-fixtures.ts).

---

## Canonical values

**Gratuity** (basic = 30,000 BDT, join = 2020-01-01 unless noted):

| Exit date | Years | Expected |
|---|---|---|
| 2026-01-01 | 6 | 207,692.31 |
| 2025-07-01 | 6 (5y6m rounds up) | 207,692.31 |
| 2025-06-01 | 5 (5y5m stays 5) | 173,076.92 |
| 2025-10-01 (join 2025-05-01) | 0 | 0 |

**LOP deduction:** `(basic / workingDays) × lopDays` — see TC-HR-U-001 `it.each` table in spec.

---

## Verify

```bash
# Unit (TC-HR-U-001..009)
npx jest --selectProjects unit --testPathPattern="tc_hr_u" --no-coverage

# Integration (TC-DB-HR-001..004, TC-DB-CON-005, TC-SEC-ENC-001/002)
npx jest --selectProjects integration --testPathPattern="tc_db_hr|tc_sec_hr_enc" --no-coverage --runInBand

# Full HR suite
npm test -- --testPathPattern=hr --runInBand
```

**Prerequisites:** Docker (testcontainers); `HR_PII_ENCRYPTION_KEY` (64-char hex) set in SEC test `beforeAll`.

**Expected:** 14 named TCs green (12 unit + 5 DB/CON + 2 SEC).
