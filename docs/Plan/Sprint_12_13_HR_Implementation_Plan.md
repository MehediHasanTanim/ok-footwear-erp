# Sprint 12–13 — HR Module Backend Implementation Plan

> Status: Implemented  
> Baseline: empty `HrModule`, stub `hr.employees`, full DDL in design SQL

Employees, leave, attendance, PF, gratuity — backend only. Payroll (Sprint 14) out of scope.

---

## Deliverables

| Area | Location |
|---|---|
| Migration | `prisma/migrations/20260901000000_sprint12_13_hr_schema/migration.sql` |
| Prisma models | `prisma/schema.prisma` (hr section; no model for partitioned `attendance_records`) |
| Encryption | `src/shared/crypto/encryption.service.ts` — AES-256-GCM BYTEA via `HR_PII_ENCRYPTION_KEY` |
| Services | `src/modules/hr/services/` — employees, leave, attendance, pf, gratuity, departments, designations |
| Controllers | `src/modules/hr/controllers/` under `/api/v1/hr/…` |
| Scheduler | `src/infrastructure/scheduler/monthly-scheduler.service.ts` — leave accrual, gratuity, PF interest |
| CoA seed | `5200` Gratuity Expense, `2200` Gratuity Provision, `2110` PF Payable |
| Permissions | `hr:read|create|update|delete|approve` seeded in migration |

---

## Schema highlights

- **`hr.employees`** — replaces baseline stub; FKs to `departments`, `designations`
- **`hr.employee_secrets`** — NID/passport/bank as BYTEA (app-layer encrypt)
- **`hr.leave_policies`** — per department/category overrides
- **`hr.attendance_records`** — yearly partition (`check_date`); raw SQL in `AttendanceService`
- **`hr.compute_gratuity()`** — Basic × (30/26) × years; ≥6 months rounds up; <1 year → 0
- Deferred FKs: `sys.users.employee_id`, `fin.gl_entry_lines.department_id`, `hr.departments.head_id`

---

## API routes (all `@Permissions('hr:…')`)

| Route | Purpose |
|---|---|
| `hr/departments` | CRUD |
| `hr/designations` | CRUD |
| `hr/employees` | CRUD; `POST :id/secrets`; `GET :id/secrets/reveal` (approve) |
| `hr/leave-types` | CRUD |
| `hr/leave-requests/apply` | Apply leave with overlap + balance checks |
| `hr/leave-requests/:id/approve\|reject\|cancel` | Workflow |
| `hr/leave-balances` | Balance query; carry-forward |
| `hr/attendance/biometric-sync` | Batch upsert |
| `hr/attendance/corrections` | Manual correction + audit row |
| `hr/attendance/lop` | LOP calculation for payroll |
| `hr/pf-accounts/*` | Enroll, contributions, statement |
| `hr/gratuity/*` | Entitlement, provisions, monthly accrual |

---

## Verify

```bash
# Requires HR_PII_ENCRYPTION_KEY in .env.local (64-char hex)
docker compose up -d --build nestjs
curl http://localhost:7100/api/v1/health

npm run build
npx prisma migrate deploy   # if not using Docker entrypoint
```

Generate key: `openssl rand -hex 32`

---

## Out of scope (Sprint 14+)

Payroll runs, salary structures, ESS/MSS, expense claims, salary advances, holiday calendars.
