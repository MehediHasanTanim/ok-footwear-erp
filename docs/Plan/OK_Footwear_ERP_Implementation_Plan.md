# OK Footwear ERP — Technical Implementation Plan
**Phase-wise Sprint Breakdown | Backend · Frontend · Test Cases**

> Version 1.0 | May 2025 | Confidential — Internal Use Only

---

## Implementation Overview

The OK Footwear ERP is delivered in **3 phases over 12 months** using **2-week sprints**. Every sprint contains detailed backend tasks, frontend tasks, and test cases mapped to the Testing Strategy document. No sprint closes without its associated tests passing in CI at the coverage gate (≥80% overall).

| Phase | Sprints | Duration | Modules Delivered | BE Tasks | FE Tasks | Test Cases |
|---|---|---|---|---|---|---|
| Phase 1 — Core Ops | S1–S8 | Months 1–4 | Infrastructure, Auth, Orders, Procurement, Inventory, Finance Core | ~110 | ~85 | 85+ |
| Phase 2 — Production & HR | S9–S14 | Months 5–8 | Manufacturing (BOM/Prod/QC), HR, Payroll, ESS/MSS Portal | ~95 | ~80 | 65+ |
| Phase 3 — Compliance | S15–S20 | Months 9–12 | Import/Export, Fixed Assets, Board Governance, Compliance, Analytics | ~80 | ~65 | 32+ |
| **Total** | **20** | **12 months** | **All 12 modules + infrastructure** | **~285** | **~230** | **182+** |

---

# PHASE 1 — Core Operations (Months 1–4)

Phase 1 establishes the project infrastructure and delivers the core operational cycle: authentication & RBAC, order management, procurement, inventory, and finance GL core. At the end of Phase 1 the system can process the full procure-to-dispatch workflow.

---

## Sprint 1 · Weeks 1–2 · Infrastructure Setup, DevOps & Project Scaffolding

### Backend Tasks

| Task | Details / Deliverable | Est. |
|---|---|---|
| Initialize NestJS project | TypeScript strict, Express adapter, path aliases (@/modules, @/common, @/shared), module structure per architecture doc | 4h |
| Prisma v5 + multi-schema setup | schema.prisma previewFeatures=["multiSchema"]; 8 schemas created; PgBouncer transaction mode 20 connections | 3h |
| PostgreSQL 16 baseline migration | Create all 8 schemas via prisma migrate; extensions: uuid-ossp, pg_trgm, pgcrypto, btree_gin | 2h |
| Redis 7 configuration | ioredis client; DB0=queues, DB1=auth, DB2=cache; connection health check on startup | 2h |
| BullMQ queue module | 5 named queues: payroll, pdf, email, sms, report; dead-letter after 3 retries; Bull Board admin UI | 3h |
| nestjs-pino logger | Correlation-id (UUID v7) injected via AsyncLocalStorage; X-Correlation-ID response header; JSON structured format | 3h |
| @nestjs/config + Joi validation | Namespaced configs: DatabaseConfig, RedisConfig, AuthConfig, AwsConfig, SmsConfig; fail-fast on startup | 2h |
| HttpExceptionFilter | RFC 7807 problem+json: type, title, status, detail, instance, correlationId, errors[] | 3h |
| ResponseInterceptor | Wrap all 2xx responses in `{ data, timestamp }` standard envelope | 1h |
| CORS + Helmet + Throttler | CORS whitelist from env; Helmet security headers; Redis sliding-window ThrottlerGuard | 2h |
| Docker multi-stage Dockerfile | node:20-alpine builder + runner; non-root user; .dockerignore; target image < 200MB | 3h |
| docker-compose.yml | PG16 + Redis7 + MinIO + PgBouncer + NestJS + Nginx; single command local startup | 3h |
| GitHub Actions CI/CD pipeline | lint → type-check → unit → integration (testcontainers) → docker build → ECR push → k8s deploy | 4h |
| Jest + testcontainers setup | ts-jest; testcontainers PG+Redis; coverage thresholds (80/75/80) enforced; transaction rollback pattern | 3h |
| sys.document_sequences DDL | Table + `sys.next_doc_number()` function with row-level lock; seed: order, po, grn, payroll prefixes | 2h |

### Frontend Tasks

| Task | Details / Deliverable | Est. |
|---|---|---|
| React 18 + Vite 5 scaffold | TypeScript strict, ESLint + Prettier, path aliases (@/components, @/hooks, @/lib, @/stores) | 3h |
| Tailwind CSS + shadcn/ui | tailwind.config.ts; install shadcn CLI; seed: Button, Input, Dialog, Sheet, Badge, Tabs, Toast | 2h |
| React Router v6 | createBrowserRouter; lazy imports per route; RoleGuard HOC; 403/404 pages; nested layouts | 3h |
| Axios API client | Base URL from env; request interceptor (JWT Bearer); 401 refresh + retry; typed DTOs; toast on error | 3h |
| TanStack Query v5 | QueryClient (staleTime 30s, retry 1); ReactQueryDevtools in dev; default error handler to toast | 2h |
| Zustand stores | authStore (userId, permissions[], accessToken); uiStore (locale, theme); notifStore (SSE unread count) | 3h |
| i18next EN/BN setup | /locales/en.json + bn.json; lazy-loaded; useTranslation; LanguageSwitcher; date/number formatting | 2h |
| MSW + Vitest + RTL | MSW handlers directory; vitest.config.ts; setupTests.ts; jsdom; coverage thresholds; test utilities | 3h |
| Playwright setup | playwright.config.ts; Chromium + Firefox; staging baseURL; loginAs() + seedOrder() helpers | 3h |
| AppShell (Layout) | Collapsible sidebar; topbar with user menu; notification bell; breadcrumb; responsive mobile drawer | 4h |
| RoleGuard HOC | Reads authStore.permissions; can(module,action); redirects to /403; wraps all protected pages | 2h |
| DataTable base component | TanStack Table v8; sortable columns; pagination; global search; column visibility toggle; export | 4h |
| useAuth hook | can(module, action) from permissions[]; logout(); currentUser; permission-aware render helper | 2h |

### Test Cases — Sprint 1

| Test ID | Type | Description |
|---|---|---|
| TC-DB-SYS-001 | Database | `sys.next_doc_number()` returns formatted number (ORD-000001 format) |
| TC-DB-SYS-002 | Database | Counter increments by 1 on each invocation |
| TC-DB-SYS-003 | Database | 20 concurrent calls produce no duplicate document numbers |
| TC-SEC-SESS-002 | Security | All API responses include HSTS, CSP, X-Frame-Options, X-Content-Type-Options headers |
| TC-SEC-SESS-003 | Security | CORS rejects requests from unknown origins |
| TC-SEC-SESS-004 | Security | CORS allows requests from whitelisted application origin |
| TC-SEC-AUTH-008 | Security | Refresh token cookie has HttpOnly, Secure, SameSite=Strict flags |

---

## Sprint 2 · Weeks 3–4 · System Module — Auth, RBAC, Users, Audit, Notifications

### Backend Tasks

| Task | Details / Deliverable | Est. |
|---|---|---|
| Schema: sys tables DDL | users (with failed_attempts, locked_until), roles, permissions, user_roles, role_permissions, refresh_tokens | 3h |
| Schema: audit_logs partition | Yearly date-range partition; GIN index on new_value JSONB; composite index (table_name, record_id) | 2h |
| Schema: notifications partition | Yearly partition; partial index on (user_id, is_read) for fast unread badge count query | 2h |
| Schema: compliance_items | expiry_date, responsible_user_id, alert_days, status; partial index on status=valid | 1h |
| AuthService.login() | argon2.verify; failed_attempts increment; lockout at 5 (locked_until = now + 30min); generateTokens() | 4h |
| AuthService.generateTokens() | accessToken (8h JWT HS256); refreshToken (30d); store refresh token hash to DB | 2h |
| AuthService.refresh() | Validate token; check not in Redis blacklist; rotate (blacklist old token TTL=remaining life) | 3h |
| AuthService.getPermissions() | DB query user→roles→permissions; JSON.stringify; Redis setex 300s; key: `permissions:{userId}` | 2h |
| TotpService | authenticator.generateSecret(); AES-256-GCM encrypt secret; verify(token, decryptedSecret) | 3h |
| AuthController | POST /auth/login, /logout, /refresh, /2fa/setup, /2fa/verify, /2fa/disable | 2h |
| UsersService + Controller | CRUD; role assignment endpoint; GET /users/me; soft-delete; employee account link | 3h |
| RolesService + Controller | CRUD roles + permission matrix; invalidate Redis permission cache on change | 2h |
| AuditInterceptor | Intercept all mutating requests (POST/PATCH/PUT/DELETE); record to audit_logs with old+new JSONB | 4h |
| NotificationsService + SSE | EventSource /notifications/stream per user; BullMQ email+SMS dispatch; unread count endpoint | 4h |
| ComplianceService + cron | Nightly 02:00: query items expiring within alert_days; send email to responsible_user | 3h |

### Frontend Tasks

| Task | Details / Deliverable | Est. |
|---|---|---|
| Login page (complete) | React Hook Form + Zod; password visibility toggle; server error→field mapping; redirect after login | 4h |
| 2FA verification page | 6-digit OTP input with auto-submit on 6th digit; countdown timer; resend code link | 3h |
| Users management page | DataTable; Create/Edit user dialog; role assignment multi-select dropdown; status badge | 4h |
| Roles & permissions page | Role list; PermissionMatrix CheckboxGrid (module × action); select-all per row; optimistic save | 5h |
| Audit log viewer page | DataTable with date/module/user filters; row expand shows old↔new JSON diff viewer | 4h |
| Notification centre dropdown | Bell icon + badge; SSE connected indicator; mark-all-read; list of notifications with timestamp | 4h |
| Compliance register page | DataTable; expiry traffic-light (green/amber/red by days remaining); countdown badge | 3h |
| Profile page | Change password form; 2FA enable/QR code display; active sessions list with revoke button | 4h |
| useNotifications hook | SSE EventSource; auto-reconnect on close; parse event data; update notifStore unread count | 3h |
| PermissionMatrix component | Checkbox grid controlled; select-all per row; disabled for system-protected permissions | 4h |

### Test Cases — Sprint 2

| Test ID | Type | Description |
|---|---|---|
| TC-AUTH-U-001 | Unit | generateTokens() returns accessToken (8h) and sets httpOnly refresh cookie |
| TC-AUTH-U-002 | Unit | Login throws UnauthorizedException on incorrect password |
| TC-AUTH-U-003 | Unit | failed_attempts incremented; locked_until set when count reaches 5 |
| TC-AUTH-U-004 | Unit | Locked account rejected even with correct password |
| TC-AUTH-U-005 | Unit | TOTP verification passes with valid OTP code |
| TC-AUTH-U-006 | Unit | TOTP verification fails with expired/invalid code |
| TC-AUTH-U-007 | Unit | Permission cache miss triggers DB lookup + Redis caching (300s TTL) |
| TC-AUTH-U-008 | Unit | Refresh token rotation blacklists old token in Redis |
| TC-GUARD-U-001 | Unit | RbacGuard returns true when user has required module:action permission |
| TC-GUARD-U-002 | Unit | RbacGuard throws ForbiddenException when permission absent |
| TC-GUARD-U-003 | Unit | ValidationPipe strips unknown properties (whitelist: true) |
| TC-GUARD-U-004 | Unit | ThrottlerGuard throws ThrottlerException after limit exceeded |
| TC-AUTH-I-001 | Integration | POST /api/auth/login → 200 with accessToken + httpOnly refreshToken cookie |
| TC-AUTH-I-002 | Integration | POST /api/auth/login → 401 with RFC 7807 body on wrong password |
| TC-AUTH-I-003 | Integration | POST /api/auth/refresh → new accessToken + rotated cookie |
| TC-AUTH-I-004 | Integration | POST /api/auth/logout → session cleared; old refresh token rejected on retry |
| TC-FE-H-003 | Frontend | useAuth.can() returns true for matching permission in authStore |
| TC-FE-H-004 | Frontend | useAuth.can() returns false for missing permission |
| TC-FE-H-005 | Frontend | useAuth.logout() clears store and navigates to /login |
| TC-SEC-AUTH-001 | Security | Tampered JWT signature → 401 |
| TC-SEC-AUTH-002 | Security | Expired access token → 401 with "Token expired" detail |
| TC-SEC-AUTH-003 | Security | JWT signed with wrong secret → 401 |
| TC-SEC-AUTH-005 | Security | Account locked (429) after 5 consecutive failed logins |
| TC-SEC-AUTH-007 | Security | Old refresh token rejected (401) after rotation |
| TC-SEC-AUTHZ-001 | Security | employee_ess cannot access payroll endpoint → 403 |
| TC-E2E-AUTH-001 | E2E | Login with correct credentials → dashboard |
| TC-E2E-AUTH-002 | E2E | Wrong password → error message, stay on /login |
| TC-E2E-AUTH-003 | E2E | Account locked after 5 failed attempts |
| TC-E2E-AUTH-004 | E2E | MD role prompted for TOTP after password entry |

---

## Sprint 3 · Weeks 5–6 · Orders Module — Core CRUD, Status Machine, Buyers, Articles

### Backend Tasks

| Task | Details / Deliverable | Est. |
|---|---|---|
| Schema: ord.buyers + articles | buyers (name, currency, payment_terms, credit_limit, country); articles (code, description, size_system, category) | 2h |
| Schema: ord.orders + order_lines | orders (status, sample_approved, total_quantity, delivery_date, currency); order_lines (size_label, quantity) | 2h |
| Schema: ord.order_milestones | 6 milestone types auto-generated on confirm; planned_date calculated backward from delivery_date | 1h |
| BuyersService + Controller | CRUD; GIN trigram search; GET /buyers (dropdown); soft-delete; currency config | 3h |
| ArticlesService + Controller | CRUD; category/season filter; size_system link; GIN trigram search | 3h |
| OrdersService.create() | Validate: line qty sum = totalQuantity; call next_doc_number(); set status=draft; link buyer+article | 3h |
| OrdersService state machine | STATUS_TRANSITIONS map; sample gate (confirmed→in_production); OrderConfirmedEvent on confirm | 4h |
| OrdersService.generateMilestones() | 6 types: material_booking, pp_sample, bulk_start, qc, packing, shipment; backward from delivery_date | 3h |
| OrdersController | GET list (paginated+filtered), GET detail (with lines), POST, PATCH, PATCH status, DELETE cancel | 2h |
| OrderConfirmedEvent | Typed class with orderId, deliveryDate, buyerId, confirmedBy; emit after successful confirmation | 1h |
| CreateOrderDto + validation | orderLines sum = totalQuantity; unitPrice > 0; deliveryDate future; currency ISO4217 | 2h |
| OrderResponseDto | @Exclude/@Expose; embedded buyer + article + orderLines; next-allowed-states included | 2h |

### Frontend Tasks

| Task | Details / Deliverable | Est. |
|---|---|---|
| Orders list page | DataTable: order#, buyer, article, qty, delivery, status badge; filter by status/buyer/date range | 4h |
| Order detail page | Master-detail: header info + milestone timeline + size breakdown + action buttons by status | 5h |
| Create order wizard | Step 1: buyer+article+dates; Step 2: SizeRunInputGrid; Step 3: summary+submit | 6h |
| SizeRunInputGrid component | Controlled grid; size cols from article size_system; running total; keyboard Tab navigation | 4h |
| OrderStatusBadge component | Status → label + Tailwind colour; used in list and detail pages; with tooltip | 1h |
| OrderStatusActions component | Contextual buttons by current status; confirm modal for irreversible actions | 3h |
| MilestoneTimeline component | Vertical timeline; planned vs actual dates; overdue = red; completed = green checkmark | 3h |
| Buyers management page | DataTable; create/edit slide-over panel; currency selector | 3h |
| Articles management page | DataTable; create/edit form; size system selector; category tree | 3h |
| useOrders hook | TanStack Query: list, detail, create, transitionStatus — optimistic updates on status change | 3h |

### Test Cases — Sprint 3

| Test ID | Type | Description |
|---|---|---|
| TC-ORD-U-001 | Unit | Order number auto-generated in ORD-NNNNNN format from document sequence |
| TC-ORD-U-002 | Unit | Status machine: draft → confirmed is a valid transition |
| TC-ORD-U-003 | Unit | Invalid transition draft → in_production rejected with message |
| TC-ORD-U-004 | Unit | confirmed → in_production blocked when sample_approved=false |
| TC-ORD-U-005 | Unit | OrderConfirmedEvent fired with correct orderId payload on confirmation |
| TC-ORD-U-006 | Unit | 6 milestone records auto-generated with correct planned_dates |
| TC-ORD-I-001 | Integration | POST /api/orders → 201 with auto-generated order number and status=draft |
| TC-ORD-I-002 | Integration | POST /api/orders → 422 when orderLines sum ≠ totalQuantity |
| TC-ORD-I-003 | Integration | GET /api/orders → paginated list with data[] + meta (page, limit, totalCount) |
| TC-ORD-I-004 | Integration | PATCH /api/orders/:id/status → 200 on valid draft→confirmed transition |
| TC-ORD-I-005 | Integration | PATCH /api/orders/:id/status → 422 when sample not approved for in_production |
| TC-ORD-I-006 | Integration | GET /api/orders/:id → 404 with RFC 7807 body for non-existent order |
| TC-ORD-I-007 | Integration | employee_ess POST /api/orders → 403 Forbidden |
| TC-FE-C-001 | Frontend | OrderStatusBadge: all 5 statuses render correct label and CSS class |
| TC-FE-C-008 | Frontend | SizeRunInputGrid: running total computed correctly from size inputs |
| TC-FE-C-009 | Frontend | SizeRunInputGrid: non-numeric input rejected |
| TC-FE-Z-001 | Frontend | createOrderSchema: valid payload accepted without errors |
| TC-FE-Z-002 | Frontend | createOrderSchema: empty orderLines array rejected |
| TC-FE-Z-003 | Frontend | createOrderSchema: unitPrice=0 rejected with descriptive message |
| TC-E2E-ORD-001 | E2E | Order manager creates order with full size breakdown on factory tablet |
| TC-E2E-ORD-003 | E2E | in_production button disabled when sample_approved=false |

---

## Sprint 4 · Weeks 7–8 · Orders — Quotations, Samples, Complaints & CAPA

### Backend Tasks

| Task | Details / Deliverable | Est. |
|---|---|---|
| Schema: ord.quotations | quotation_number, status (draft/sent/won/lost), bom_version_id, win_probability, outcome_reason | 2h |
| Schema: ord.samples | round_number, sample_type enum (PP/counter/size_set/TOP), dispatch_date, approval_status | 1h |
| Schema: ord.complaints + capa | complaints (type, severity, root_cause); capa_actions (description, owner_id, due_date, status) | 2h |
| QuotationsService | create; auto-populate cost from approved BOM; close (won/lost); conversion rate KPI | 4h |
| SamplesService | multi-round CRUD; approveSample() → sets sampleApproved=true on parent order | 3h |
| ComplaintsService + CapaActionsService | create complaint; link to order; create/update CAPA actions; auto-close when all CAPA done | 4h |
| Quotation + Sample + Complaint controllers | CRUD + workflow endpoints; nested under /orders/:id/ | 3h |

### Frontend Tasks

| Task | Details / Deliverable | Est. |
|---|---|---|
| Quotations tab (order detail) | Quotation list; create drawer with cost-sheet auto-populate; win/loss close modal | 4h |
| Sample tracking tab | Multi-round timeline; per-round status; approve button with confirmation dialog | 3h |
| Complaints & CAPA tab | Complaint form; CAPA action items with owner picker + due-date; progress badges | 4h |
| E2E order test helpers | Playwright: createAndConfirmOrder(), approveAllSamples(), completeProductionCycle() | 2h |

### Test Cases — Sprint 4

| Test ID | Type | Description |
|---|---|---|
| TC-ORD-U-007 | Unit | Quotation marks as lost with outcome_reason correctly stored |
| TC-ORD-U-008 | Unit | CAPA action with past due_date rejected with validation error |
| TC-E2E-ORD-002 | E2E | Full lifecycle: draft→confirmed→in_production→packed→delivered |
| TC-SEC-INJ-005 | Security | Unknown DTO properties stripped by ValidationPipe whitelist |

---

## Sprint 5 · Weeks 9–10 · Procurement Module — Vendors, POs, GRN, Vendor Invoices

### Backend Tasks

| Task | Details / Deliverable | Est. |
|---|---|---|
| Schema: prc all tables | vendor_categories, vendors, purchase_orders, po_lines, goods_receipts, gr_lines, gr_line_photos, vendor_invoices | 3h |
| VendorsService | CRUD; approved/blacklisted enforcement; performance_rating auto-avg from GRN quality scores | 3h |
| PurchaseOrdersService | Multi-level approval by amount threshold (config-driven); total_amount calc from lines; status machine | 4h |
| GoodsReceiptsService | Create against PO; per-line accepted/rejected qty; QC photos S3 upload; fire GrnApprovedEvent on approve | 4h |
| GrnApprovedEvent | Payload: grnId, lines[{itemId, warehouseId, acceptedQty, unitCost}]; handled by InventoryModule | 1h |
| VendorInvoicesService | Three-way match (PO≥GRN≥invoice); TDS auto-deduct; link to GL AP posting; partial payment tracking | 4h |
| Procurement controllers (all) | All CRUD + workflow actions; nested routes for PO lines, GRN lines, invoice matching | 3h |
| PO approval workflow | Config-driven thresholds: <50k line mgr, <500k manager, <5M finance, >5M MD; email notification per step | 3h |

### Frontend Tasks

| Task | Details / Deliverable | Est. |
|---|---|---|
| Vendor list + detail page | DataTable; status badge (approved/pending/blacklisted); performance score gauge; cert documents tab | 4h |
| PO creation wizard | Step 1: vendor + expected_date + currency; Step 2: line items (item search, qty, price); Step 3: review | 5h |
| PO approval queue page | Pending POs list; amount + threshold badge; approve/reject with mandatory reason; email trail | 3h |
| GRN entry form | PO line items pre-loaded; per-line accepted/rejected qty; QC note; receipt photo upload | 4h |
| Vendor invoice matching page | Three-way match visual (PO amount / GRN qty / invoice); tolerance % gauge; approve button | 4h |

### Test Cases — Sprint 5

| Test ID | Type | Description |
|---|---|---|
| TC-PRC-U-001 | Unit | PO total_amount = sum of (quantity × unit_price) across all lines |
| TC-PRC-U-002 | Unit | PO creation rejected for vendor with status=blacklisted |
| TC-PRC-U-003 | Unit | Vendor invoice rejected when amount exceeds three-way match tolerance |
| TC-PRC-U-004 | Unit | GrnApprovedEvent fired with item details on GRN approval |
| TC-PRC-U-005 | Unit | GRN: accepted + rejected qty cannot exceed received qty |
| TC-SEC-AUTHZ-004 | Security | finance_manager cannot access board module endpoints (403) |
| TC-SEC-INJ-001 | Security | SQL injection in search parameter returns empty result, no data leaked |
| TC-SEC-INJ-002 | Security | Non-UUID path parameter returns 400 Bad Request |

---

## Sprint 6 · Weeks 11–12 · Inventory Module — Transactions, Balances, Counts

### Backend Tasks

| Task | Details / Deliverable | Est. |
|---|---|---|
| Schema: inv all tables | stock_items, warehouses, stock_transactions (yearly partition), stock_balances, stock_counts, stock_count_lines | 3h |
| Trigger: inv.update_stock_balance | AFTER INSERT on stock_transactions; upsert stock_balances (qty += direction×qty); recalc weighted avg cost | 4h |
| CHECK: non-negative balance | `CONSTRAINT chk_balance_non_negative CHECK (quantity >= 0)` on inv.stock_balances | 1h |
| GrnApprovedHandler | @OnEvent grn.approved; insert stock_transactions (direction=+1) for each GRN line | 3h |
| StockItemsService + Controller | CRUD; category filter; GIN trigram search; reorder level config; below-reorder flag | 3h |
| StockTransactionsService | recordMovement() — INSERT only, never UPDATE/DELETE; emit StockBelowReorderEvent when needed | 3h |
| StockCountsService | Create count sheet (snapshot system_qty); enter physical_qty; variance calc; approval workflow | 4h |
| inv.stock_summary mat. view | CREATE MATERIALIZED VIEW CONCURRENTLY; total_qty, avg_cost, total_value, below_reorder; refresh daily cron | 2h |
| Stock controllers + DTOs | All endpoints; paginated transaction history; GET /stock-summary (from materialized view) | 3h |

### Frontend Tasks

| Task | Details / Deliverable | Est. |
|---|---|---|
| Stock items list page | DataTable; below-reorder badge in amber; category filter; reorder level column; edit drawer | 3h |
| Stock balance view | Per-warehouse balance table; movements history accordion; avg_cost and total_value columns | 3h |
| Stock count sheet page | Per-item physical count input grid; variance column (physical−system); colour-coded by variance % | 4h |
| Warehouse management page | CRUD; warehouse type (raw/FG/packing/accessories); location text; active/inactive status | 2h |
| Inventory KPI widget | Below-reorder count, pending stock counts, total SKUs — dashboard KPI cards with links | 3h |

### Test Cases — Sprint 6

| Test ID | Type | Description |
|---|---|---|
| TC-DB-INV-001 | Database | Trigger: GRN insert increments balance by received qty |
| TC-DB-INV-002 | Database | Trigger: production issue decrements balance correctly |
| TC-DB-INV-003 | Database | Multiple transactions accumulate balance correctly (100+50−30=120) |
| TC-DB-INV-004 | Database | CHECK constraint raises error when stock would go negative |
| TC-DB-INV-005 | Database | Weighted average cost recalculated correctly on two-batch receipt |
| TC-DB-INV-006 | Database | Average cost unchanged on stock-out (only changes on receipt) |
| TC-DB-MV-002 | Database | inv.stock_summary below_reorder=true when qty ≤ reorder_level after refresh |
| TC-INV-U-001 | Unit | StockTransactionsService calls create() — never update() or delete() |
| TC-INV-U-002 | Unit | StockBelowReorderEvent fired when balance ≤ reorder_level |
| TC-INV-U-003 | Unit | No StockBelowReorderEvent fired when balance above threshold |
| TC-INV-U-004 | Unit | Variance = physical_qty − system_qty computed correctly |
| TC-INV-I-001 | Integration | POST transaction → balance updated via trigger (verified in response) |
| TC-INV-I-002 | Integration | GET stock-summary → returns total_qty and below_reorder flag |
| TC-E2E-INV-001 | E2E | Approved GRN immediately reflects in stock balance screen |
| TC-E2E-INV-002 | E2E | Stock count variance: store officer submits → Finance Manager approves |

---

## Sprint 7 · Weeks 13–14 · Finance Core — GL, Chart of Accounts, Periods, AP/AR, Delivery

### Backend Tasks

| Task | Details / Deliverable | Est. |
|---|---|---|
| Schema: fin core tables | chart_of_accounts (hierarchy), gl_periods, gl_entries, gl_entry_lines (yearly partition), bank_accounts | 3h |
| Schema: fin AR/AP tables | buyer_invoices (AR), delivery_challans, challan_lines | 2h |
| Trigger: fin.check_period_open | BEFORE INSERT on gl_entry_lines; EXCEPTION if parent period status IN (closed, locked) | 2h |
| FinanceService.postJournal() | Validate debit=credit; check period open; bulk INSERT gl_entry_lines; assign correlation to source document | 4h |
| GlService | CRUD journals; trial balance query; account balance (date range) using CTEs; period open/close/lock workflow | 4h |
| ChartOfAccountsService | CRUD with parent_account_id hierarchy; prevent delete if has transactions; account type enum | 3h |
| BankAccountsService | CRUD; link to GL cash account; statement import CSV/OFX; reconciliation status | 3h |
| BuyerInvoicesService | AR invoices; ageing buckets; collection recording; dispute workflow; link to delivery challan | 3h |
| DeliveryChallansService | Create from order; POD recording (photo+date); trigger AR invoice generation on confirmed delivery | 3h |
| PayrollDisbursedHandler | @OnEvent payroll.disbursed; call FinanceService.postJournal() for salary expense + net payable GL entries | 2h |

### Frontend Tasks

| Task | Details / Deliverable | Est. |
|---|---|---|
| GL journal entry page | Form: narration, period picker, debit/credit line items; real-time balance indicator (must = 0 to submit) | 5h |
| GL viewer / journal list | DataTable; expand row to see lines; filter by period/account/type/amount range; export to Excel | 4h |
| Trial balance page | Account hierarchy tree; debit/credit columns; opening+movement+closing; period selector; Excel export | 4h |
| AR aging page | Buyer invoices grouped by bucket (0-30, 31-60, 61-90, 90+d); colour-coded; collection entry panel | 4h |
| GL periods management | List; open/close/lock buttons; confirm irreversible lock modal; unlock requires MD permission | 3h |
| Chart of accounts tree | Expandable hierarchy; inline add child account; edit dialog; transaction count badge (no-delete guard) | 4h |
| Delivery challans page | Create from confirmed order; POD photo upload; mark-delivered button; AR invoice auto-created | 3h |

### Test Cases — Sprint 7

| Test ID | Type | Description |
|---|---|---|
| TC-FIN-U-001 | Unit | GL journal rejected when total debit ≠ total credit |
| TC-FIN-U-002 | Unit | Balanced journal (debit=credit) posts successfully |
| TC-FIN-U-003 | Unit | Posting to locked period throws UnprocessableEntityException |
| TC-DB-FIN-001 | Database | Trigger: posting to open period succeeds |
| TC-DB-FIN-002 | Database | Trigger: posting to closed period raises exception |
| TC-DB-FIN-003 | Database | Trigger: posting to locked period raises exception |
| TC-DB-CON-001 | Database | GL line: debit and credit cannot both be non-zero |
| TC-DB-CON-002 | Database | GL line: debit and credit cannot both be zero |
| TC-FIN-I-001 | Integration | POST /api/gl/entries → 201 with status=posted for balanced journal |
| TC-FIN-I-002 | Integration | POST /api/gl/entries → 422 for unbalanced journal with error detail |
| TC-FIN-I-003 | Integration | POST /api/gl/entries → 422 when posting to locked period |
| TC-PERF-001 | Performance | Orders list: 50 VUs × 3min → p95 < 300ms, error rate < 0.1% |

> **Sprint 8 (Week 15–16):** Phase 1 regression sweep, staging deployment, UAT preparation. All Phase 1 test cases re-executed in CI. k6 baseline benchmarks captured.

---

# PHASE 2 — Production & HR (Months 5–8)

Phase 2 delivers manufacturing operations (BOM versioning, production scheduling, daily output tracking, QC), the full HR and payroll engine compliant with Bangladesh Labour Act 2006, and the ESS/MSS self-service portals.

---

## Sprint 9 · Ph2 Weeks 1–2 · Manufacturing — BOM Versioning, Cost Sheets

### Backend Tasks

| Task | Details / Deliverable | Est. |
|---|---|---|
| Schema: mfg BOM tables | bom_headers (article_id, version, status, approved_by), bom_lines (item_id, qty_per_unit, wastage_pct), bom_size_overrides | 3h |
| Schema: mfg.cost_sheets | material_cost, labour_cost, overhead_cost, target_margin_pct, selling_price (computed); links to bom_header | 2h |
| BomService.create() | New version per article; status=draft on create; duplicate from previous version option; approval workflow | 4h |
| BomService.approve() | Set status=approved; only one active version per article enforced; previous versions archived | 3h |
| ProductionBlockGuard | Check approved BOM exists for article before allowing production order creation | 2h |
| CostSheetsService | Auto-generate from BOM × latest vendor rates; material/labour/overhead split; selling price with margin | 4h |
| BOM + CostSheet controllers | CRUD; GET /articles/:id/bom; GET /bom/:id/cost-sheet; POST /bom/:id/approve; version history list | 3h |

### Frontend Tasks

| Task | Details / Deliverable | Est. |
|---|---|---|
| BOM viewer page | Tree/table view of BOM lines; wastage % column; size overrides section; version history tabs; compare versions | 5h |
| BOM create/edit form | Component line items with item search + qty + wastage_pct; size override per SKU; duplicate version button | 4h |
| BOM approval UI | Submit-for-approval button; approver review with comment; approved/pending/rejected badge; audit trail | 3h |
| Cost sheet page | Auto-calculated breakdown; margin % slider → selling price real-time update; print/Excel export | 4h |

### Test Cases — Sprint 9

| Test ID | Type | Description |
|---|---|---|
| TC-MFG-U-001 | Unit | BOM ConflictException when same article+version already exists |
| TC-MFG-U-002 | Unit | Production order blocked without approved BOM for article |
| TC-MFG-U-005 | Unit | Cost sheet: selling_price = total_cost × (1 + marginPct/100) |
| TC-DB-CON-003 | Database | Order line quantity=0 rejected by positive CHECK constraint |
| TC-DB-CON-004 | Database | Duplicate size_label in same order rejected by UNIQUE constraint |

---

## Sprints 10–11 · Ph2 Weeks 3–6 · Manufacturing — Production Orders, Daily Entry, QC, Machines

### Backend Tasks

| Task | Details / Deliverable | Est. |
|---|---|---|
| Schema: mfg production tables | production_orders, daily_productions (yearly partition), qc_results (defects JSONB), machines, machine_maintenance, scrap_records | 3h |
| DailyScheduler: nightly lock | 02:00 BDT cron: UPDATE daily_productions SET locked=true WHERE prod_date < today AND locked=false | 2h |
| ProductionOrdersService | Create from sales order + BOM version; planned_qty per size; status machine; link to factory line | 3h |
| DailyProductionService | Record per-operation per-shift output; efficiency_pct generated column; locked check | 3h |
| QcResultsService | AQL sampling size auto-calc; defect entry per type (JSONB); verdict pass/fail/rework; link to production order | 3h |
| MachineService | CRUD; maintenance log; downtime_hours generated column (sum maintenance durations); link to fixed asset | 2h |
| ScrapService | Record by type + production order; disposal auth workflow; disposal method enum | 2h |
| ProductionCompletedEvent | Fired when production order QC passes; handled by OrdersModule to update order status | 1h |
| Production controllers (all) | Full CRUD + workflow for production orders, daily entry, QC, machines, scrap | 3h |

### Frontend Tasks

| Task | Details / Deliverable | Est. |
|---|---|---|
| Production schedule page | Calendar + list view; planned vs actual qty progress bars; status filters; drill into daily entries | 4h |
| Daily production entry (tablet) | Touch-optimised; large tap targets; per-shift entry; running total vs target; locked-day indicator | 5h |
| QC form page | AQL sampling: sample size auto-calculated; defect entry by type; pass/fail/rework verdict + notes | 4h |
| QC analytics page | Defect frequency chart (Recharts bar); first-pass yield trend; top 5 defect types doughnut | 4h |
| Machine register page | List; maintenance schedule; downtime log entry form; utilisation % KPI card; link to asset | 3h |
| Production efficiency widget | Real-time efficiency % per factory line; target vs actual grouped bar chart; drill-down to daily | 3h |

### Test Cases — Sprints 10–11

| Test ID | Type | Description |
|---|---|---|
| TC-MFG-U-003 | Unit | efficiency_pct = (produced / target) × 100 as generated column |
| TC-MFG-U-004 | Unit | efficiency_pct is NULL when target_qty is 0 |
| TC-MFG-U-006 | Unit | Locked daily production entry throws exception on update attempt |
| TC-DB-PART-001 | Database | 2025-dated rows route to the 2025 partition child table |
| TC-DB-PART-002 | Database | 2025 rows excluded when querying with WHERE txn_date >= 2026-01-01 |

---

## Sprints 12–13 · Ph2 Weeks 7–10 · HR Module — Employees, Leave, Attendance, PF, Gratuity

### Backend Tasks

| Task | Details / Deliverable | Est. |
|---|---|---|
| Schema: hr core tables | departments, designations, employees, employee_secrets (BYTEA for NID/passport/bank AES-256), employment_events | 3h |
| Schema: hr leave tables | leave_types, leave_policies, leave_balances, leave_requests; partial index on status=pending | 2h |
| Schema: hr attendance tables | attendance_records (yearly partition); biometric_sync_log; manual_corrections table | 2h |
| Schema: hr PF + gratuity | pf_accounts, pf_transactions, gratuity_provisions; hr.compute_gratuity() function with Labour Act formula | 3h |
| hr.compute_gratuity() function | Basic × (30/26) × years; ≥6 months rounds up to next year; < 1 year returns 0 | 3h |
| EmployeesService | Full lifecycle; AES-256-GCM encrypt NID/bank/passport at write; decrypt only when explicitly requested | 4h |
| LeaveService | apply() with conflict detection (overlapping check); balance deduction; accrual engine; carry-forward | 5h |
| AttendanceService | biometricSync() upsert; manualCorrection() with reason; calculateLop(month) for payroll use | 4h |
| PfService | Monthly contribution calculation (10%+10%); annual interest credit cron; statement generation | 3h |
| GratuityService | Monthly provision via compute_gratuity(); accrue to gratuity_provisions; GL expense posting | 3h |
| HR controllers/DTOs (all) | All endpoints for employees, leave, attendance, PF, gratuity | 4h |

### Frontend Tasks

| Task | Details / Deliverable | Est. |
|---|---|---|
| Employee directory page | DataTable with avatar, dept, designation, join date, status; click → detail page | 4h |
| Employee detail/edit page | Tabs: personal, employment, salary, leave, attendance, documents; edit each section in slide-over | 5h |
| Leave management page (HR) | Balance overview by type; leave request list; approval queue; team leave calendar heatmap | 4h |
| Attendance dashboard | Monthly grid heatmap; P/A/L/LOP per cell; LOP days count; manual correction form | 4h |
| Leave type config page | CRUD leave types; policy settings (accrual rate, max days, carry-forward limit, encashment) | 3h |
| Org chart + departments page | OrgChartTree component; CRUD departments; designation management; headcount KPI | 3h |
| PF account statement page | Per-employee: monthly contributions, interest, balance; CSV export; employer contribution breakdown | 3h |

### Test Cases — Sprints 12–13

| Test ID | Type | Description |
|---|---|---|
| TC-HR-U-001 | Unit | LOP deduction proportional: basic/workingDays × lopDays (3 parametric cases) |
| TC-HR-U-002 | Unit | PF deduction at 10% of basic salary |
| TC-HR-U-005 | Unit | Gratuity formula: 6yr, 5y6m, 5y5m, <1yr — all correct |
| TC-HR-U-006 | Unit | Leave application rejected when available balance < requested days |
| TC-HR-U-007 | Unit | Half-day leave deducts 0.5 days from balance |
| TC-HR-U-008 | Unit | Overlapping leave request detected and rejected |
| TC-HR-U-009 | Unit | Salary advance instalment = amount / recoveryMonths |
| TC-DB-HR-001 | Database | hr.compute_gratuity(): 6 years → correct BDT amount to 2dp |
| TC-DB-HR-002 | Database | hr.compute_gratuity(): 5y 6m rounds up to 6 years |
| TC-DB-HR-003 | Database | hr.compute_gratuity(): 5y 5m stays at 5 years |
| TC-DB-HR-004 | Database | hr.compute_gratuity(): < 1 year returns 0 |
| TC-DB-CON-005 | Database | factory_category required for factory employee type |
| TC-FE-Z-004 | Frontend | leaveRequestSchema: endDate before startDate rejected with message |
| TC-SEC-ENC-001 | Security | NID stored as BYTEA (not plain text) in employee_secrets |
| TC-SEC-ENC-002 | Security | Bank account field unreadable from DB without decryption key |

---

## Sprint 14 · Ph2 Weeks 11–14 · Payroll Engine, Bank File Export, ESS/MSS Portal

### Backend Tasks

| Task | Details / Deliverable | Est. |
|---|---|---|
| Schema: hr payroll tables | payroll_runs (status machine), payroll_entries (per employee), salary_structures, salary_components | 2h |
| PayrollService.initiateRun() | Validate no duplicate, prior GL period closed, attendance locked; enqueue BullMQ payroll job | 3h |
| PayrollProcessor (BullMQ) | Per employee: basic+allowances−LOP−PF_employee−TDS+OT+festival_bonus; 30-min timeout; progress % | 6h |
| PayrollService GL posting | On Finance Manager approval: FinanceService.postJournal() for salary expense + net payable | 3h |
| Bank disbursement file export | BRAC Bank / Dutch-Bangla / IBBL format; configurable column mapping; CSV/fixed-width download | 4h |
| PDF payslip BullMQ job | Handlebars template → Puppeteer render → S3 stream → return presigned URL (15min TTL) | 4h |
| ESS scoped endpoints | /ess/leave, /ess/payslip, /ess/expense, /ess/attendance, /ess/advance — scoped to req.user.employeeId | 4h |
| MSS approval queue endpoints | Scoped to manager direct reports; leave/attendance/expense/OT; SLA overdue flag; bulk approve | 4h |
| ExpensesService + SalaryAdvancesService | Expense claim with receipt S3 upload; advance request with recovery schedule; approval workflow | 3h |

### Frontend Tasks

| Task | Details / Deliverable | Est. |
|---|---|---|
| Payroll run wizard | 4-step: period selection → pre-run checks → computation (polling) → approve + bank file download | 6h |
| Payroll run detail page | Employee-wise entries; LOP/OT/PF/TDS breakdown columns; expand per-employee; approve button | 4h |
| ESS dashboard | Leave balance cards; upcoming holidays; payslip download shortcut; expense pending count | 3h |
| ESS leave application page | Type selector; date range picker with calendar; half-day toggle; balance indicator; history list | 4h |
| ESS payslip page | Monthly list; Download PDF button using usePayslipDownload hook; loading spinner; toast on error | 3h |
| ESS expense claim page | Claim form with receipt photo upload; item description; claim history with status badge | 3h |
| ESS attendance self-view | Monthly calendar; P/A/L/LOP per day; correction request form with reason | 3h |
| MSS approval queue page | Items by type (leave/expense/OT); unread badge; SLA overdue highlight in red; bulk select+approve | 5h |
| MSS team calendar page | Monthly calendar showing all team members leave; conflict detection overlay with warning | 4h |

### Test Cases — Sprint 14

| Test ID | Type | Description |
|---|---|---|
| TC-HR-U-003 | Unit | Festival bonus: included in Eid month, zero in non-qualifying months |
| TC-HR-I-001 | Integration | POST /api/payroll/runs → 202 Accepted, queues BullMQ job |
| TC-HR-I-002 | Integration | POST /api/payroll/runs → 409 when run already exists for period |
| TC-HR-I-003 | Integration | POST /api/leave-requests → 201 with status=pending |
| TC-HR-I-004 | Integration | PATCH /api/leave-requests/:id/approve → 200 with status=manager_approved |
| TC-HR-I-005 | Integration | Employee cannot GET another employee payslips → 403 |
| TC-FE-C-006 | Frontend | Payroll wizard: step 1 requires period selection before proceeding to step 2 |
| TC-FE-C-007 | Frontend | Processing step polls every 5 seconds until status=Processed |
| TC-FE-H-001 | Frontend | usePayslipDownload: success fetches URL and triggers browser download |
| TC-FE-H-002 | Frontend | usePayslipDownload: API error → status=error + destructive toast |
| TC-SEC-AUTHZ-002 | Security | Employee IDOR: cannot access another employee payslip by ID substitution |
| TC-SEC-AUTHZ-003 | Security | Manager cannot view employees from another department (403) |
| TC-E2E-PAY-001 | E2E | Full payroll run: HR initiates → Finance approves → employee downloads payslip PDF |
| TC-E2E-PAY-002 | E2E | Duplicate run for same month shows conflict error |
| TC-E2E-LEAVE-001 | E2E | Leave apply → manager approve → balance visibly decremented |
| TC-E2E-LEAVE-002 | E2E | Insufficient balance blocks leave submission at form level |
| TC-CONT-HR-001 | Contract | GET /api/employees/:id — Pact consumer+provider contract verified |
| TC-CONT-HR-002 | Contract | GET payslip presigned URL — Pact shape matches consumer expectation |
| TC-PERF-006 | Performance | Concurrent payroll report downloads: 20 VUs × 2min, all complete within 30s |

---

# PHASE 3 — Compliance & Analytics (Months 9–12)

Phase 3 completes the full ERP: import/export LC lifecycle, fixed assets with depreciation, budget management, board governance (Companies Act 1994 full compliance), the compliance register, and the analytics dashboard.

---

## Sprints 15–16 · Ph3 Weeks 1–4 · Import/Export LCs, Fixed Assets, Depreciation, Budgets

### Backend Tasks

| Task | Details / Deliverable | Est. |
|---|---|---|
| Schema: fin.import_lcs + export_lcs | LC lifecycle tables; document_submission tracking; tolerance_pct; payment_terms; landed_cost_lines | 3h |
| Schema: fin.fixed_assets | category_id, purchase_date, original_cost, salvage_value, useful_life_years, depreciation_method, net_book_value (generated) | 2h |
| Schema: fin.budgets + budget_lines | Annual budget header (year, type); monthly line items per account; version control | 2h |
| ImportLcService | Full lifecycle: open → utilise → customs → landed cost → settlement; landed cost allocation by weight/value | 4h |
| ExportLcService | Open → negotiate → present docs → bank acceptance → payment → BB repatriation; tolerance check | 4h |
| FixedAssetsService | CRUD; SL/DB depreciation computation; disposal with gain/loss; link to GL fixed asset account | 4h |
| MonthlyScheduler: depreciation | 1st month cron: compute monthly depreciation per active asset; postJournal() for depreciation expense | 3h |
| BudgetService | Annual OPEX/CAPEX budgets; monthly lines; budget vs actual variance endpoint (from GL actuals) | 4h |
| LC + Asset + Budget controllers | All CRUD + workflow endpoints; document upload to S3; depreciation schedule report endpoint | 3h |

### Frontend Tasks

| Task | Details / Deliverable | Est. |
|---|---|---|
| Import LC lifecycle page | Stepper: open→utilise→customs→landed cost→settlement; document checklist; landed cost breakdown table | 5h |
| Export LC management page | Document submission tracker; tolerance gauge; repatriation status; overdue highlight | 4h |
| Fixed assets register page | DataTable: code, category, NBV, depreciation method; depreciation schedule modal; disposal form | 4h |
| Budget vs actual page | Monthly comparison table; variance column (favourable=green, adverse=red); drill-down to GL | 4h |
| Finance dashboard (complete) | GL period status, AP/AR aging charts, fixed asset NBV KPI, budget variance summary cards | 4h |

### Test Cases — Sprints 15–16

| Test ID | Type | Description |
|---|---|---|
| TC-FIN-U-004 | Unit | SL depreciation: (originalCost − salvageValue) / usefulLifeYears / 12 |
| TC-FIN-U-005 | Unit | DB depreciation: netBookValue × annualRate / 12 |
| TC-FIN-U-006 | Unit | Budget variance: negative (adverse) when actual > budget |
| TC-PERF-005 | Performance | GL account balance query: 30 VUs × 3min → p95 < 400ms |

---

## Sprints 17–18 · Ph3 Weeks 5–8 · Board Governance — Directors, Shares, Meetings, Resolutions, AGM, Dividends

### Backend Tasks

| Task | Details / Deliverable | Est. |
|---|---|---|
| Schema: brd all tables | directors, shareholders, share_transactions (append-only), board_meetings, meeting_agenda, meeting_attendees, resolutions, agms, dividends, dividend_payments, related_parties | 4h |
| brd.current_shareholding mat. view | Aggregate share_transactions; pct_held computed; CONCURRENTLY refresh; partial index for lookups | 2h |
| DirectorsService | CRUD; RJSC DIN; AES-256-GCM encrypt NID/passport; appointment/resignation with Companies Act tracking | 3h |
| ShareholdersService + share register | CRUD; share certificate issuance; append-only share_transactions (allotment/transfer/buyback) | 3h |
| BoardMeetingsService | Create meeting; quorum_required config; attendee check-in; quorum validation blocks minutes finalisation | 4h |
| ResolutionsService | Draft → pass; SHA-256 hash of signed PDF; DocuSign envelope send; webhook callback handler | 4h |
| AgmService | 15-month interval enforcement; overdue alert; notice dispatch tracking (statutory 14 days); proxy register | 3h |
| DividendsService | Declare per_share amount; auto-compute per shareholder from mat. view; WHT deduction per NBR rate | 3h |
| ResolutionSignedEvent handler | Verify DocuSign HMAC-SHA256 webhook; download signed PDF; store S3; record sha256_hash in DB | 3h |
| RelatedPartiesService | IAS 24 register; transaction alert when other modules involve related parties; disclosure report | 2h |
| Board controllers/DTOs (all) | All endpoints for directors, shareholders, meetings, resolutions, AGM, dividends, related parties | 4h |

### Frontend Tasks

| Task | Details / Deliverable | Est. |
|---|---|---|
| Director register page | DataTable; appointment/resignation history; encrypted fields visible to Company Secretary only | 4h |
| Shareholder register page | Register of Members; transfer history; certificate issuance form; current % holdings from mat. view | 4h |
| Shareholding chart | Doughnut chart of current share % from materialized view; click slice → shareholder detail | 3h |
| Board meetings page | Meeting creation; agenda builder; attendee check-in (QR or manual); quorum indicator badge | 5h |
| Meeting minutes + resolutions | Rich text editor for minutes; resolution drafting form; pass/defer/withdraw actions | 4h |
| Resolution detail with hash | Signed PDF viewer; SHA-256 hash displayed; DocuSign signing status badge; tamper indicator | 3h |
| AGM management page | AGM schedule list; days-since-last-AGM counter (red if >14 months); notice dispatch checklist | 3h |
| Dividend declaration page | Per-share amount input; shareholder breakdown table with WHT column; gross/net split; approve button | 4h |
| Related parties register page | IAS 24 register; recent transaction alert badge; disclosure summary report export | 3h |

### Test Cases — Sprints 17–18

| Test ID | Type | Description |
|---|---|---|
| TC-BRD-U-001 | Unit | Board meeting minutes blocked when attendee count < quorum_required |
| TC-BRD-U-002 | Unit | SHA-256 hash stored correctly on resolution signing |
| TC-BRD-U-003 | Unit | Dividend WHT deducted correctly at configured % (parametric: 10%, 15%) |
| TC-BRD-U-004 | Unit | AGM flagged overdue when > 15 months since last AGM date |
| TC-DB-MV-001 | Database | brd.current_shareholding reflects allotments after REFRESH MATERIALIZED VIEW |
| TC-SEC-SESS-006 | Security | Audit log written for every employee update (AuditInterceptor test) |
| TC-E2E-BRD-001 | E2E | Full board resolution: schedule meeting → pass resolution → Chairman eSign → hash recorded |

---

## Sprints 19–20 · Ph3 Weeks 9–12 · Compliance, Analytics Dashboard, Full Regression & Handover

### Backend Tasks

| Task | Details / Deliverable | Est. |
|---|---|---|
| ComplianceService (complete) | Licence/cert register; nightly expiry check cron; email notification N days before expiry | 3h |
| Analytics KPI endpoints | Order fill rate, production efficiency, stock turnover, payroll cost trend, AR collection rate | 4h |
| Report generation jobs (all) | ExcelJS .xlsx: payroll summary, trial balance, inventory valuation, HR headcount, compliance status | 4h |
| Full Swagger documentation review | All endpoints annotated; OpenAPI 3.0 spec exported; request/response examples complete | 3h |
| Performance profiling + N+1 fixes | Prisma query logging; identify slow queries; add missing indexes; optimize heavy CTE queries | 4h |
| Grafana dashboards finalization | All custom dashboards set up; alert thresholds configured; PagerDuty/Slack webhook tests | 3h |
| Mutation testing (Stryker) | Run Stryker on all service files; identify weak assertions; fix test gaps; report to team | 5h |

### Frontend Tasks

| Task | Details / Deliverable | Est. |
|---|---|---|
| Analytics dashboard (main) | KPI grid: open orders, production efficiency, stock alerts, payroll cost, AR overdue, GL status, compliance | 6h |
| Order analytics page | Fill rate trend chart; buyer-wise analysis table; on-time delivery %; complaint rate trend | 4h |
| Compliance register page (complete) | Expiry traffic lights; days-remaining countdown; responsible user assignment; bulk export | 3h |
| Report centre page | Scheduled + on-demand reports list; download button (presigned URL); schedule email delivery option | 3h |
| Chromatic visual regression finalization | All Storybook stories complete; push to Chromatic; approve all visual baselines | 3h |
| Accessibility audit (WCAG 2.1 AA) | Run axe-core on all pages; fix violations; keyboard navigation; screen reader labels | 3h |
| Full Bangla translation review | Native speaker review all bn.json strings; date/number formatting; placeholder translations | 2h |

### Test Cases — Sprints 19–20 (Full Regression)

| Test ID | Type | Description |
|---|---|---|
| TC-PERF-001 | Performance | Orders list: 50 VUs × 3min → p95 < 300ms, error rate < 0.1% |
| TC-PERF-002 | Performance | Dashboard KPI: all 4 endpoints under 200ms at normal load |
| TC-PERF-003 | Performance | Employee search: 100 VUs × 2min → p95 < 200ms |
| TC-PERF-004 | Performance | Stock summary: 200 VU ramp-up → p95 < 500ms sustained |
| TC-PERF-007 | Performance | Spike test: 500 VU login burst → p99 < 2s, error rate < 2% |
| TC-PERF-008 | Performance | Biometric sync: 10 devices × 5min → p95 < 200ms per punch |
| TC-PERF-009 | Performance | 30-minute soak test: 50 VUs → no memory leak, p95 < 300ms throughout |
| TC-SEC-INJ-003 | Security | XSS payload in remarks field not reflected in API response |
| TC-SEC-INJ-004 | Security | Oversized 11MB payload rejected with 413 response |
| TC-SEC-SESS-001 | Security | Rate limiting: 429 returned after >100 requests/minute per user |
| TC-SEC-SESS-005 | Security | passwordHash and totpSecret never appear in any API response |
| TC-CONT-ORD-001 | Contract | GET /api/orders/:id — Pact consumer+provider contract verified |
| TC-CONT-ORD-002 | Contract | GET /api/orders paginated list shape verified |
| TC-CONT-ORD-003 | Contract | POST /api/orders 422 RFC 7807 error shape verified |
| TC-CONT-AUTH-001 | Contract | POST /api/auth/login success shape verified |
| TC-CONT-AUTH-002 | Contract | POST /api/auth/login 401 error shape verified |
| TC-CONT-INV-001 | Contract | GET /api/inventory/stock-summary shape verified |
| TC-CONT-SSE-001 | Contract | SSE notification event structure verified |
| TC-E2E-RBAC | E2E | All RBAC matrix entries: blocked roles cannot access restricted pages/APIs |
| **Full regression** | **All types** | **All 182 test cases pass; overall coverage ≥ 80%; zero Sentry regressions on staging** |

---

## Implementation Summary

| Phase | Sprints | Duration | Modules | BE Tasks | FE Tasks | Test Cases |
|---|---|---|---|---|---|---|
| Phase 1 — Core Ops | S1–S8 | Months 1–4 | Infrastructure, Auth+RBAC, Orders, Procurement, Inventory, Finance Core | ~110 | ~85 | 85+ |
| Phase 2 — Production+HR | S9–S14 | Months 5–8 | Manufacturing (BOM/Prod/QC), HR, Payroll, ESS/MSS | ~95 | ~80 | 65+ |
| Phase 3 — Compliance | S15–S20 | Months 9–12 | LCs, Fixed Assets, Budgets, Board Governance, Analytics | ~80 | ~65 | 32+ |
| **TOTAL** | **20 sprints** | **12 months** | **All 12 modules + infrastructure** | **~285** | **~230** | **182+** |

Every sprint delivers: fully passing test suite at the coverage gate (≥80% overall), a staging deployment, and a sprint review with business stakeholders. No sprint closes without its associated test cases passing in CI.

---

*OK Footwear ERP — Technical Implementation Plan · Version 1.0 · May 2025*
