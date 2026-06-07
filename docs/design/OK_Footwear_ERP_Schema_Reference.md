# OK Footwear ERP — PostgreSQL Schema Reference

Complete field-level documentation for every table in the OK Footwear ERP database, organised by schema. Each entry covers the table's purpose, design archetype, and a description of every column.

---

## Document Information

| Property | Value |
|---|---|
| Schema file | `OK_Footwear_ERP_Schema.sql` |
| PostgreSQL version | 16+ |
| ORM | Prisma 5+ (multi-schema preview) |
| Total schemas | 8  (`sys` `ord` `prc` `mfg` `inv` `fin` `hr` `brd`) |
| Business tables | 67 |
| Partition children | 14 |
| Indexes | 81 |
| Triggers | 36 |
| Functions | 5 |
| Materialized views | 2 |
| Generated | May 2025 |

---

## Schema Organisation

| Schema | Tables | Domain |
|---|---|---|
| `sys` | 8 | Users, roles, permissions, audit log, compliance, notifications |
| `ord` | 9 | Orders, buyers, articles, quotations, samples, complaints |
| `prc` | 10 | Vendors, purchase orders, GRNs, vendor invoices |
| `mfg` | 15 | BOM, cost sheets, production, QC, machines, lasts & moulds, scrap |
| `inv` | 8 | Warehouses, stock items, transactions, balances, counts |
| `fin` | 19 | GL, bank, fixed assets, depreciation, budgets, LCs, AR/AP |
| `hr` | 26 | Employees, payroll, leave, attendance, PF, gratuity, expenses |
| `brd` | 13 | Directors, shareholders, board meetings, resolutions, AGM, dividends |

---

## Table Archetypes

| Icon | Archetype | Update | Delete | Notes |
|---|---|---|---|---|
| 🔵 | Mutable master data | Allowed (triggers `updated_at`) | Soft delete via `deleted_at` | Buyer, vendor, employee, article master tables |
| 🔴 | Append-only ledger | Never | Never | Stock transactions, GL lines, employment events, PF transactions |
| 🟡 | Status-machine record | Allowed (status transitions) | Never | Orders, POs, payroll runs, board meetings |
| ⚪ | Lookup / configuration | Infrequent | Never (deactivate) | Leave types, operations, warehouses, roles |
| 🟣 | Junction table | Never (delete + re-insert) | Cascade from parent | role_permissions, struct_components, meeting_attendees |
| 🟠 | Partitioned table | Partition-level rules | Detach partition | audit_logs, stock_transactions, attendance, GL lines |

---

## Design Conventions

**UUID primary keys** — All PKs are `UUID` via `gen_random_uuid()` (pgcrypto). No auto-increment integers.

**Monetary values** — `NUMERIC(15,2)` for amounts; `NUMERIC(12,4)` for unit prices requiring four decimal places. Never `FLOAT`.

**Timestamps** — All timestamps are `TIMESTAMPTZ` (UTC). Display conversion happens in the application layer.

**Soft delete** — Master data uses `deleted_at TIMESTAMPTZ`; active records are filtered by partial unique indexes `WHERE deleted_at IS NULL`.

**Status columns** — All `status` fields use `TEXT` with `CHECK` constraints (not PostgreSQL `ENUM`) for zero-downtime value additions.

**Sensitive fields** — NID, passport, and bank account numbers are stored as `BYTEA` (AES-256-GCM encrypted at app layer) in dedicated `*_secrets` tables.

**Generated columns** — Used for derived values that must stay in sync: `net_book_value`, `efficiency_pct`, `base_debit/base_credit`, `variance`, `downtime_hrs`.

---

## Schema: `sys` — System & Administration

Foundation tables shared by all modules: document numbering, authentication, RBAC, immutable audit logging, compliance tracking, and the notification system.

### `sys.document_sequences`

Stores auto-incrementing counters for generating human-readable business document numbers such as `ORD-000042`. The helper function `sys.next_doc_number(name)` atomically increments and formats the number.

⚪ **Lookup / configuration** — rarely changes once seeded

> **Note:** Seed one row per document type before go-live. Never truncate in production.

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `sequence_name` | `TEXT` | ✗ | `PK` | Unique name, e.g. `order`, `po`, `grn`, `gl_entry` |
| `prefix` | `TEXT` | ✗ |  | String prepended to the number, e.g. `ORD-`, `PO-` |
| `current_value` | `BIGINT` | ✗ |  | Last issued value; next call returns current_value + 1 |
| `pad_length` | `SMALLINT` | ✗ |  | Zero-pad width; 6 produces `000042` |

### `sys.roles`

Named roles assigned to users. System roles (`is_system = TRUE`) cannot be deleted.

⚪ **Lookup / configuration** — rarely changes once seeded

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `name` | `TEXT` | ✗ | `UK` | Unique role name, e.g. `finance_manager`, `factory_supervisor` |
| `description` | `TEXT` | ✓ |  | Human-readable explanation of the role's purpose |
| `is_system` | `BOOLEAN` | ✗ |  | TRUE means seeded at setup; must not be deleted |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |

### `sys.permissions`

Granular permission definitions: module + action. Seeded once; referenced by role-permission assignments.

⚪ **Lookup / configuration** — rarely changes once seeded

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `module` | `TEXT` | ✗ |  | Module the permission covers, e.g. `orders`, `payroll`, `board` |
| `action` | `TEXT` | ✗ |  | Allowed action: `read`, `create`, `update`, `delete`, or `approve`; UNIQUE per module-action |
| `description` | `TEXT` | ✓ |  | Plain-language description of what this permission grants |

### `sys.role_permissions`

Junction between roles and permissions. A user's effective permissions are the union of all permissions across all their roles.

🟣 **Junction table** — resolves many-to-many relationship

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `role_id` | `UUID` | ✗ | `PK FK` | References `sys.roles` |
| `permission_id` | `UUID` | ✗ | `PK FK` | References `sys.permissions` |

### `sys.users`

All system user accounts. Passwords hashed with Argon2id. TOTP secret AES-256 encrypted. Soft-deleted via `deleted_at`.

🔵 **Mutable master data** — supports update and soft delete

> **Note:** Unique index on `email` is partial: `WHERE deleted_at IS NULL`, so a deleted user's email can be reused.

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `email` | `TEXT` | ✗ | `UK` | Login email; unique among non-deleted users (case-insensitive partial index) |
| `full_name` | `TEXT` | ✗ |  | Display name shown in the UI and on documents |
| `password_hash` | `TEXT` | ✗ |  | Argon2id hash; never stored in plain text |
| `status` | `TEXT` | ✗ |  | Account state: `active`, `inactive`, or `locked` (after 5 failed attempts) |
| `failed_attempts` | `SMALLINT` | ✗ |  | Consecutive failed login count; resets to 0 on successful login |
| `locked_until` | `TIMESTAMPTZ` | ✓ |  | Account locked until this UTC time; NULL = not locked |
| `last_login_at` | `TIMESTAMPTZ` | ✓ |  | UTC timestamp of the most recent successful login |
| `totp_secret` | `BYTEA` | ✓ |  | AES-256-GCM encrypted TOTP secret; NULL if 2FA not yet enrolled |
| `totp_enabled` | `BOOLEAN` | ✗ |  | TRUE once the user has completed 2FA enrolment |
| `employee_id` | `UUID` | ✓ | `FK` | Link to `hr.employees`; NULL for IT admin accounts with no HR record |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | Auto-updated by trigger on every UPDATE |
| `deleted_at` | `TIMESTAMPTZ` | ✓ |  | Soft-delete timestamp; NULL = active account |

### `sys.user_roles`

Assigns roles to users with an audit trail of who granted each assignment.

🟣 **Junction table** — resolves many-to-many relationship

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `user_id` | `UUID` | ✗ | `PK FK` | References `sys.users` |
| `role_id` | `UUID` | ✗ | `PK FK` | References `sys.roles` |
| `granted_by` | `UUID` | ✗ | `FK` | User who granted this role; references `sys.users` |
| `granted_at` | `TIMESTAMPTZ` | ✗ |  | UTC timestamp of assignment |

### `sys.audit_logs`

Immutable append-only audit trail for every data-changing event. Partitioned by `created_at` (yearly). Never update or delete rows.

🔴 **Append-only ledger** — never UPDATE or DELETE; insert only

> **Note:** GIN index on `new_value` supports searching for specific field changes across all modules.

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC event timestamp; also the partition key |
| `user_id` | `UUID` | ✗ | `FK` | User who performed the action |
| `action` | `TEXT` | ✗ |  | Event type: `INSERT`, `UPDATE`, `DELETE`, `LOGIN`, or `EXPORT` |
| `schema_name` | `TEXT` | ✗ |  | PostgreSQL schema of the affected table, e.g. `hr` |
| `table_name` | `TEXT` | ✗ |  | Table name, e.g. `employees` |
| `record_id` | `UUID` | ✗ |  | Primary key of the affected row |
| `old_value` | `JSONB` | ✓ |  | Row snapshot before the change; NULL for INSERT |
| `new_value` | `JSONB` | ✓ |  | Row snapshot after the change; NULL for DELETE; GIN-indexed |
| `ip_address` | `INET` | ✓ |  | Client IP address at time of request |
| `session_id` | `TEXT` | ✓ |  | Application session ID for correlating events in one user action |

### `sys.compliance_items`

Centralised register for all regulatory licences, certificates, and compliance obligations. Expiry alerts generated nightly.

🔵 **Mutable master data** — supports update and soft delete

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `name` | `TEXT` | ✗ |  | Display name, e.g. `Factory Operating Licence`, `BGMEA Membership` |
| `category` | `TEXT` | ✗ |  | Classification: `license`, `certificate`, `membership`, or `audit` |
| `issuing_authority` | `TEXT` | ✓ |  | Government body or agency, e.g. `RJSC`, `BGMEA`, `NBR` |
| `reference_number` | `TEXT` | ✓ |  | Official registration or certificate number |
| `issue_date` | `DATE` | ✓ |  | Date the document was issued |
| `expiry_date` | `DATE` | ✗ |  | Expiry date; drives alert calculation |
| `alert_days` | `SMALLINT` | ✗ |  | Days before expiry to fire the first alert; default 30 |
| `status` | `TEXT` | ✗ |  | State: `valid`, `expiring_soon`, `expired`, or `renewed` |
| `document_url` | `TEXT` | ✓ |  | S3/MinIO URL of the scanned document |
| `responsible_user` | `UUID` | ✓ | `FK` | User responsible for renewal |
| `notes` | `TEXT` | ✓ |  | Renewal notes or instructions |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | Auto-updated by trigger |

### `sys.notifications`

All in-app, email, SMS, and push notifications. Partitioned by `created_at` (yearly).

🟠 **Partitioned table** — range-partitioned by date for performance

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp; also the partition key |
| `user_id` | `UUID` | ✗ | `FK` | Recipient user |
| `type` | `TEXT` | ✗ |  | Classification: `approval_request`, `alert`, or `info` |
| `title` | `TEXT` | ✗ |  | Short headline displayed in the notification inbox |
| `body` | `TEXT` | ✓ |  | Full notification message body |
| `link` | `TEXT` | ✓ |  | Deep-link URL to the relevant screen in the application |
| `is_read` | `BOOLEAN` | ✗ |  | FALSE until the user opens the notification |
| `channel` | `TEXT` | ✗ |  | Delivery channel: `in_app`, `email`, `sms`, or `push` |
| `sent_at` | `TIMESTAMPTZ` | ✓ |  | UTC dispatch timestamp; NULL if still queued |
| `source_module` | `TEXT` | ✓ |  | Module that triggered the notification |
| `source_id` | `UUID` | ✓ |  | Primary key of the source document |

---

## Schema: `ord` — Order Management

Manages the complete commercial lifecycle: buyer relationships, article/style catalogue, production orders, size breakdowns, milestone scheduling, sample tracking, quotations, and post-delivery complaint management.

### `ord.buyers`

Master record for every buyer. Stores commercial terms used to auto-populate orders and trigger credit limit alerts.

🔵 **Mutable master data** — supports update and soft delete

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `buyer_code` | `TEXT` | ✗ | `UK` | Short unique code, e.g. `BAY`, `LOTTO`, `WALKER` |
| `name` | `TEXT` | ✗ |  | Full legal or trade name; GIN-trigram indexed for search |
| `contact_name` | `TEXT` | ✓ |  | Primary contact person at the buyer's office |
| `email` | `TEXT` | ✓ |  | Buyer's primary email for order communications |
| `phone` | `TEXT` | ✓ |  | Buyer's primary phone number |
| `address` | `TEXT` | ✓ |  | Full postal address |
| `country` | `TEXT` | ✗ |  | Country of the buyer; defaults to `Bangladesh` for domestic buyers |
| `payment_terms` | `SMALLINT` | ✗ |  | Standard net payment days, e.g. 30, 60, 90 |
| `credit_limit` | `NUMERIC(15,2)` | ✗ |  | Maximum outstanding receivable before a credit warning is raised |
| `currency` | `CHAR(3)` | ✗ |  | Default invoice currency (ISO 4217), e.g. `USD`, `EUR`, `BDT` |
| `is_active` | `BOOLEAN` | ✗ |  | FALSE soft-deactivates without deleting history |
| `notes` | `TEXT` | ✓ |  | Internal notes about the buyer relationship |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | Auto-updated by trigger |
| `created_by` | `UUID` | ✗ | `FK` | User who created the record |

### `ord.articles`

Master catalogue of every shoe style. Each article links to one or more BOM versions in `mfg.bom_headers`.

🔵 **Mutable master data** — supports update and soft delete

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `article_code` | `TEXT` | ✗ | `UK` | Unique style code used across orders, BOM, and production |
| `description` | `TEXT` | ✗ |  | Full style description; GIN-trigram indexed |
| `category` | `TEXT` | ✗ |  | Primary category: `men`, `women`, `kids`, `safety`, or `sports` |
| `sub_category` | `TEXT` | ✓ |  | Secondary classification, e.g. `casual`, `formal`, `boot` |
| `gender` | `TEXT` | ✓ |  | Target gender if more specific than category |
| `season` | `TEXT` | ✓ |  | Production season, e.g. `SS25`, `AW25` |
| `size_system` | `TEXT` | ✗ |  | Primary size system: `EU`, `UK`, or `US` |
| `is_active` | `BOOLEAN` | ✗ |  | FALSE retires the article without deleting history |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | Auto-updated by trigger |
| `created_by` | `UUID` | ✗ | `FK` | User who created the record |

### `ord.orders`

Central order record linking a buyer to an article with commercial terms and delivery commitment. Drives the entire production and dispatch lifecycle.

🟡 **Status-machine record** — transitions enforced by CHECK constraints

> **Note:** Bulk production is gated by `sample_approved = TRUE`. The CHECK on `delivery_date` prevents orders being backdated by more than one day.

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `order_number` | `TEXT` | ✗ | `UK` | Auto-generated from sequence, e.g. `ORD-000042` |
| `buyer_id` | `UUID` | ✗ | `FK` | Buyer who placed the order; references `ord.buyers` |
| `article_id` | `UUID` | ✗ | `FK` | Style being ordered; references `ord.articles` |
| `order_type` | `TEXT` | ✗ |  | Nature: `bulk`, `sample`, `repeat`, or `trial` |
| `season` | `TEXT` | ✓ |  | Season this order is for |
| `status` | `TEXT` | ✗ |  | Lifecycle: `draft` → `confirmed` → `in_production` → `qc` → `packed` → `delivered` → `cancelled` |
| `currency` | `CHAR(3)` | ✗ |  | Agreed price currency; typically `USD` for export |
| `unit_price` | `NUMERIC(12,4)` | ✗ |  | Price per pair; CHECK >= 0 |
| `total_quantity` | `INTEGER` | ✗ |  | Total pairs ordered, summing all order_lines |
| `delivery_date` | `DATE` | ✗ |  | Committed delivery date; drives milestone auto-generation |
| `pi_number` | `TEXT` | ✓ | `UK` | Proforma Invoice number issued on order confirmation |
| `lc_number` | `TEXT` | ✓ |  | LC reference for LC-based orders |
| `sample_approved` | `BOOLEAN` | ✗ |  | Must be TRUE before status can move to `in_production` |
| `remarks` | `TEXT` | ✓ |  | Internal notes, buyer instructions, or special requirements |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | Auto-updated by trigger |
| `created_by` | `UUID` | ✗ | `FK` | User who registered the order |

### `ord.order_lines`

Size-wise quantity breakdown for each order. One row per size label. UNIQUE on (order_id, size_label).

🔵 **Mutable master data** — supports update and soft delete

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `order_id` | `UUID` | ✗ | `FK` | Parent order; CASCADE DELETE |
| `size_label` | `TEXT` | ✗ |  | Size in the order's system, e.g. `38`, `39`, `UK7` |
| `quantity` | `INTEGER` | ✗ |  | Pairs for this size; CHECK > 0 |
| `unit_price` | `NUMERIC(12,4)` | ✓ |  | Per-size override; NULL inherits from `ord.orders.unit_price` |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |

### `ord.order_milestones`

Auto-generated backward schedule from delivery date on order confirmation. One row per milestone type per order.

🟡 **Status-machine record** — transitions enforced by CHECK constraints

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `order_id` | `UUID` | ✗ | `FK` | Parent order; CASCADE DELETE |
| `milestone_type` | `TEXT` | ✗ |  | Stage: `material_booking`, `production_start`, `inline_qc`, `final_qc`, `packing`, or `shipment`; UNIQUE per order |
| `planned_date` | `DATE` | ✗ |  | Target date calculated from delivery date |
| `actual_date` | `DATE` | ✓ |  | Date milestone was actually achieved; NULL until completed |
| `status` | `TEXT` | ✗ |  | Progress: `pending`, `in_progress`, `completed`, or `overdue` |

### `ord.samples`

Pre-production sample rounds submitted to the buyer. Multiple rounds per order. Bulk release gated on at least one `approved` round.

🟡 **Status-machine record** — transitions enforced by CHECK constraints

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `order_id` | `UUID` | ✗ | `FK` | Parent order; CASCADE DELETE |
| `round` | `SMALLINT` | ✗ |  | Sequential round number starting at 1 |
| `sample_type` | `TEXT` | ✗ |  | Stage: `pp_sample`, `counter_sample`, `size_set`, or `top_of_production` |
| `dispatch_date` | `DATE` | ✓ |  | Date dispatched to the buyer |
| `courier` | `TEXT` | ✓ |  | Courier service used |
| `tracking_no` | `TEXT` | ✓ |  | Courier tracking number |
| `status` | `TEXT` | ✗ |  | Progress: `pending`, `dispatched`, `received`, `approved`, or `rejected` |
| `buyer_comment` | `TEXT` | ✓ |  | Buyer's written feedback on the sample |
| `approved_at` | `TIMESTAMPTZ` | ✓ |  | UTC timestamp of buyer approval |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | Auto-updated by trigger |

### `ord.quotations`

Buyer quotations before a formal order. Version-controlled. Accepted quotations convert to confirmed orders in one action.

🟡 **Status-machine record** — transitions enforced by CHECK constraints

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `quotation_number` | `TEXT` | ✗ | `UK` | Auto-generated, e.g. `QUO-000012` |
| `buyer_id` | `UUID` | ✗ | `FK` | Buyer being quoted |
| `article_id` | `UUID` | ✗ | `FK` | Article being priced |
| `version` | `SMALLINT` | ✗ |  | Revision number; increments on each amendment |
| `currency` | `CHAR(3)` | ✗ |  | Currency of the quoted price |
| `total_cost` | `NUMERIC(12,4)` | ✓ |  | Cost per pair from linked cost sheet; NULL until linked |
| `margin_pct` | `NUMERIC(5,2)` | ✓ |  | Margin percentage applied over total cost |
| `quoted_price` | `NUMERIC(12,4)` | ✗ |  | Final quoted price per pair presented to the buyer |
| `valid_until` | `DATE` | ✗ |  | Expiry date; expired quotations become read-only |
| `status` | `TEXT` | ✗ |  | Outcome: `draft`, `sent`, `won`, `lost`, or `expired` |
| `outcome_reason` | `TEXT` | ✓ |  | Reason quotation was lost or withdrawn; used for sales analysis |
| `order_id` | `UUID` | ✓ | `FK` | Linked order when quotation was won |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | Auto-updated by trigger |
| `created_by` | `UUID` | ✗ | `FK` | User who created the quotation |

### `ord.complaints`

Buyer complaints raised after delivery. Drives a CAPA (Corrective and Preventive Action) workflow.

🟡 **Status-machine record** — transitions enforced by CHECK constraints

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `complaint_no` | `TEXT` | ✗ | `UK` | Unique complaint reference number |
| `order_id` | `UUID` | ✗ | `FK` | Order the complaint relates to |
| `complaint_date` | `DATE` | ✗ |  | Date formally received from the buyer |
| `category` | `TEXT` | ✗ |  | Type: `quality_defect`, `wrong_style`, `wrong_size`, `short_shipment`, or `packaging` |
| `description` | `TEXT` | ✗ |  | Detailed description of the issue as reported |
| `quantity` | `INTEGER` | ✓ |  | Pairs affected, if applicable |
| `status` | `TEXT` | ✗ |  | State: `open`, `in_progress`, `resolved`, or `closed` |
| `root_cause` | `TEXT` | ✓ |  | Root cause identified during investigation |
| `resolved_at` | `TIMESTAMPTZ` | ✓ |  | UTC timestamp when resolved |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | Auto-updated by trigger |
| `created_by` | `UUID` | ✗ | `FK` | User who registered the complaint |

### `ord.capa_actions`

Individual Corrective and Preventive Actions linked to a complaint. Each has an owner and due date.

🟡 **Status-machine record** — transitions enforced by CHECK constraints

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `complaint_id` | `UUID` | ✗ | `FK` | Parent complaint |
| `action_type` | `TEXT` | ✗ |  | `corrective` (fix current issue) or `preventive` (prevent recurrence) |
| `description` | `TEXT` | ✗ |  | Full description of the action to be taken |
| `owner_user_id` | `UUID` | ✗ | `FK` | User responsible for completing this action |
| `due_date` | `DATE` | ✗ |  | Target completion date; overdue actions flagged in reports |
| `closed_at` | `TIMESTAMPTZ` | ✓ |  | UTC timestamp when action was completed and closed |
| `status` | `TEXT` | ✗ |  | State: `open` or `closed` |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |

---

## Schema: `prc` — Procurement Management

Complete procure-to-pay cycle: vendor qualification, purchase requisitions auto-generated from BOM, multi-level PO approval, goods receipt with quality inspection, and vendor invoice payment.

### `prc.vendor_categories`

Simple lookup for vendor category classification used in the approved vendor list.

⚪ **Lookup / configuration** — rarely changes once seeded

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `name` | `TEXT` | ✗ | `UK` | Category name, e.g. `Upper Materials`, `Sole & Outsole`, `Packaging` |
| `code` | `TEXT` | ✗ | `UK` | Short code for reports and filters |

### `prc.vendors`

Master record for every supplier. The `status` field controls PO eligibility. Rating is periodically recomputed from delivery and quality metrics.

🔵 **Mutable master data** — supports update and soft delete

> **Note:** GIN-trigram index on `name` enables fuzzy search. The `rating` (0–5) is computed by a background job from on-time delivery rate and rejection rate data.

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `vendor_code` | `TEXT` | ✗ | `UK` | Unique code, e.g. `VND-0042` |
| `name` | `TEXT` | ✗ |  | Full legal or trade name; GIN-trigram indexed |
| `type` | `TEXT` | ✗ |  | Supply type: `raw_material`, `sole`, `accessory`, `packaging`, `machine`, or `service` |
| `contact_name` | `TEXT` | ✓ |  | Primary sales or account contact |
| `email` | `TEXT` | ✓ |  | Primary contact email |
| `phone` | `TEXT` | ✓ |  | Primary contact phone |
| `address` | `TEXT` | ✓ |  | Full business address |
| `trade_license` | `TEXT` | ✓ |  | Trade licence number for compliance verification |
| `tin_number` | `TEXT` | ✓ |  | Tax Identification Number for TDS deduction |
| `bank_name` | `TEXT` | ✓ |  | Bank name for payment processing |
| `bank_account` | `TEXT` | ✓ |  | Bank account number (not encrypted — commercial, not personal) |
| `payment_terms` | `SMALLINT` | ✗ |  | Payment terms in days, e.g. 30, 45, 60 |
| `credit_limit` | `NUMERIC(12,2)` | ✗ |  | Max outstanding payable before an alert is raised |
| `status` | `TEXT` | ✗ |  | Eligibility: `approved`, `blacklisted`, or `under_review`. Only `approved` vendors receive POs |
| `rating` | `NUMERIC(3,1)` | ✓ |  | Computed vendor score 0.0–5.0; updated periodically |
| `notes` | `TEXT` | ✓ |  | Internal notes about the vendor relationship |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | Auto-updated by trigger |
| `created_by` | `UUID` | ✗ | `FK` | User who registered the vendor |

### `prc.approved_vendor_items`

Defines which vendors may supply which stock items. POs to non-listed vendors for a given item require manager override.

🟣 **Junction table** — resolves many-to-many relationship

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `vendor_id` | `UUID` | ✗ | `PK FK` | References `prc.vendors` |
| `item_id` | `UUID` | ✗ | `PK FK` | References `inv.stock_items` |
| `approved_at` | `TIMESTAMPTZ` | ✗ |  | UTC timestamp of approval |
| `approved_by` | `UUID` | ✗ | `FK` | Procurement manager who approved this vendor-item pairing |

### `prc.purchase_requisitions`

Aggregates material requirements for one or more orders. Can be auto-generated from BOM or created manually for ad-hoc purchases.

🟡 **Status-machine record** — transitions enforced by CHECK constraints

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `order_id` | `UUID` | ✓ | `FK` | Source order; NULL for ad-hoc requisitions |
| `status` | `TEXT` | ✗ |  | State: `pending`, `approved`, `po_created`, or `cancelled` |
| `notes` | `TEXT` | ✓ |  | Reason or special sourcing instructions |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | Auto-updated by trigger |
| `created_by` | `UUID` | ✗ | `FK` | User who raised the requisition |

### `prc.pr_lines`

Individual line items within a purchase requisition, one per stock item needed.

🔵 **Mutable master data** — supports update and soft delete

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `pr_id` | `UUID` | ✗ | `FK` | Parent requisition; CASCADE DELETE |
| `item_id` | `UUID` | ✗ | `FK` | Item required; references `inv.stock_items` |
| `required_qty` | `NUMERIC(12,3)` | ✗ |  | Quantity needed; CHECK > 0 |
| `required_by` | `DATE` | ✗ |  | Latest date the item must be in the warehouse |
| `preferred_vendor_id` | `UUID` | ✓ | `FK` | Optional vendor suggestion |
| `notes` | `TEXT` | ✓ |  | Line-specific notes such as quality specs or brand requirements |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |

### `prc.purchase_orders`

Formal purchase commitment sent to a vendor. POs above the configured threshold require MD approval.

🟡 **Status-machine record** — transitions enforced by CHECK constraints

> **Note:** Three-way match (PO ↔ GRN ↔ Invoice) is enforced at invoice payment stage.

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `po_number` | `TEXT` | ✗ | `UK` | Auto-generated, e.g. `PO-000031` |
| `vendor_id` | `UUID` | ✗ | `FK` | Vendor receiving the order |
| `status` | `TEXT` | ✗ |  | Lifecycle: `draft`, `pending_approval`, `approved`, `partially_received`, `received`, or `cancelled` |
| `currency` | `CHAR(3)` | ✗ |  | PO currency; typically `BDT` for local vendors |
| `total_amount` | `NUMERIC(15,2)` | ✗ |  | Sum of all PO line amounts |
| `delivery_date` | `DATE` | ✗ |  | Expected delivery date from the vendor |
| `approved_by` | `UUID` | ✓ | `FK` | User who approved; NULL until approved |
| `approved_at` | `TIMESTAMPTZ` | ✓ |  | UTC approval timestamp |
| `notes` | `TEXT` | ✓ |  | Special delivery instructions or terms |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | Auto-updated by trigger |
| `created_by` | `UUID` | ✗ | `FK` | User who created the PO |

### `prc.po_lines`

Individual line items in a PO. Tracks ordered vs received to compute fulfilment status.

🔵 **Mutable master data** — supports update and soft delete

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `po_id` | `UUID` | ✗ | `FK` | Parent PO; CASCADE DELETE |
| `item_id` | `UUID` | ✗ | `FK` | Item ordered; references `inv.stock_items` |
| `ordered_qty` | `NUMERIC(12,3)` | ✗ |  | Quantity in the PO; CHECK > 0 |
| `received_qty` | `NUMERIC(12,3)` | ✗ |  | Running total received across all GRNs; starts at 0 |
| `unit_price` | `NUMERIC(12,4)` | ✗ |  | Agreed price per unit; CHECK >= 0 |
| `uom` | `TEXT` | ✗ |  | Unit of measure matching `inv.stock_items.uom` |
| `delivery_date` | `DATE` | ✓ |  | Line-specific date if different from PO header |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |

### `prc.goods_receipts`

Records each physical delivery from a vendor. A PO may have multiple GRNs for batch deliveries. Triggers inventory update on approval.

🟡 **Status-machine record** — transitions enforced by CHECK constraints

> **Note:** Approved GRNs are read-only. Corrections require a new adjustment GRN.

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `grn_number` | `TEXT` | ✗ | `UK` | Auto-generated, e.g. `GRN-000019` |
| `po_id` | `UUID` | ✗ | `FK` | PO being received against |
| `receipt_date` | `DATE` | ✗ |  | Physical date goods arrived at the warehouse |
| `status` | `TEXT` | ✗ |  | State: `draft`, `qc_pending`, `approved`, or `rejected` |
| `received_by` | `UUID` | ✗ | `FK` | Warehouse officer who received the goods |
| `approved_by` | `UUID` | ✓ | `FK` | User who approved after QC pass |
| `approved_at` | `TIMESTAMPTZ` | ✓ |  | UTC approval timestamp |
| `vehicle_no` | `TEXT` | ✓ |  | Delivery vehicle registration number |
| `notes` | `TEXT` | ✓ |  | Notes about delivery condition or discrepancies |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | Auto-updated by trigger |

### `prc.gr_lines`

Item lines within a GRN. Captures received, accepted, and rejected quantities. Only accepted_qty posts to inventory.

🔵 **Mutable master data** — supports update and soft delete

> **Note:** CHECK ensures accepted_qty + rejected_qty ≤ received_qty to prevent entry errors.

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `grn_id` | `UUID` | ✗ | `FK` | Parent GRN; CASCADE DELETE |
| `po_line_id` | `UUID` | ✗ | `FK` | PO line being received |
| `received_qty` | `NUMERIC(12,3)` | ✗ |  | Total physical quantity received; CHECK > 0 |
| `accepted_qty` | `NUMERIC(12,3)` | ✗ |  | Quantity passed QC and added to inventory |
| `rejected_qty` | `NUMERIC(12,3)` | ✗ |  | Quantity failed QC and returned to vendor |
| `qc_status` | `TEXT` | ✗ |  | QC outcome: `pending`, `accepted`, `rejected`, or `hold` |
| `rejection_reason` | `TEXT` | ✓ |  | Why items were rejected; required when rejected_qty > 0 |
| `batch_lot` | `TEXT` | ✓ |  | Manufacturer batch reference for traceability |
| `unit_cost` | `NUMERIC(12,4)` | ✓ |  | Actual unit cost from vendor invoice if known at receipt |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |

### `prc.vendor_invoices`

Vendor invoices for accounts payable. Payment blocked until three-way match validated.

🟡 **Status-machine record** — transitions enforced by CHECK constraints

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `vendor_id` | `UUID` | ✗ | `FK` | Vendor who issued the invoice |
| `invoice_no` | `TEXT` | ✗ |  | Vendor's own invoice number; UNIQUE per vendor |
| `invoice_date` | `DATE` | ✗ |  | Date on the vendor's invoice |
| `due_date` | `DATE` | ✗ |  | Payment due: invoice_date + vendor payment_terms |
| `currency` | `CHAR(3)` | ✗ |  | Invoice currency |
| `gross_amount` | `NUMERIC(15,2)` | ✗ |  | Total invoice amount before TDS |
| `tds_amount` | `NUMERIC(12,2)` | ✗ |  | Withholding tax deducted per NBR rules |
| `net_payable` | `NUMERIC(15,2)` | ✗ |  | Amount payable: gross_amount − tds_amount |
| `paid_amount` | `NUMERIC(15,2)` | ✗ |  | Running total paid; starts at 0 |
| `status` | `TEXT` | ✗ |  | Payment state: `pending`, `partial`, `paid`, `disputed`, or `cancelled` |
| `grn_id` | `UUID` | ✓ | `FK` | GRN this invoice relates to |
| `gl_entry_id` | `UUID` | ✓ | `FK` | GL journal entry created when invoice posted to AP |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | Auto-updated by trigger |
| `created_by` | `UUID` | ✗ | `FK` | User who entered the invoice |

---

## Schema: `mfg` — Manufacturing & Production

Factory operations: Bill of Materials with version control, cost sheets, production planning, operation routing, daily output tracking, inline and final QC, machine management, shoe lasts and moulds, and scrap recording.

### `mfg.bom_headers`

Version-controlled BOM header per article. Multiple versions allowed; only one can be `approved` at a time for production use.

🟡 **Status-machine record** — transitions enforced by CHECK constraints

> **Note:** BOM approval requires both Production Manager and Finance sign-off. Superseded BOMs become read-only.

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `article_id` | `UUID` | ✗ | `FK` | Article this BOM describes; references `ord.articles` |
| `version` | `TEXT` | ✗ |  | Version label, e.g. `1.0`, `1.1`; UNIQUE per article |
| `status` | `TEXT` | ✗ |  | State: `draft`, `approved`, or `superseded` |
| `approved_by` | `UUID` | ✓ | `FK` | User who approved this version |
| `approved_at` | `TIMESTAMPTZ` | ✓ |  | UTC approval timestamp |
| `notes` | `TEXT` | ✓ |  | What changed in this version vs the previous one |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | Auto-updated by trigger |
| `created_by` | `UUID` | ✗ | `FK` | User who created this BOM version |

### `mfg.bom_lines`

Individual material components within a BOM. Each line specifies quantity per pair, optionally size-specific. Wastage percentage adds a buffer for procurement.

🔵 **Mutable master data** — supports update and soft delete

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `bom_id` | `UUID` | ✗ | `FK` | Parent BOM header; CASCADE DELETE |
| `item_id` | `UUID` | ✗ | `FK` | Stock item required; references `inv.stock_items` |
| `component_type` | `TEXT` | ✗ |  | Material role: `upper_material`, `lining`, `sole`, `insole`, `thread`, `adhesive`, `tag`, `label`, `sticker`, `box`, `polybag`, or `accessory` |
| `quantity_per_pair` | `NUMERIC(10,4)` | ✗ |  | Net quantity per pair; CHECK > 0 |
| `uom` | `TEXT` | ✗ |  | Unit of measure matching `inv.stock_items.uom` |
| `size_specific` | `BOOLEAN` | ✗ |  | TRUE if quantity varies by size |
| `size_label` | `TEXT` | ✓ |  | Specific size this line applies to; NULL = all sizes |
| `wastage_pct` | `NUMERIC(5,2)` | ✗ |  | Percentage wastage allowance added for procurement planning |
| `notes` | `TEXT` | ✓ |  | Specification, grade, or acceptable substitute notes |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |

### `mfg.cost_sheets`

Estimated and actual cost breakdown per order. The `variance` generated column shows cost overrun or saving after order completion.

🟡 **Status-machine record** — transitions enforced by CHECK constraints

> **Note:** `variance` is a GENERATED ALWAYS AS column — do not insert into it directly.

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `order_id` | `UUID` | ✓ | `FK` | Order this cost sheet is for; NULL for template sheets |
| `bom_id` | `UUID` | ✗ | `FK` | BOM version used as basis |
| `status` | `TEXT` | ✗ |  | State: `draft`, `approved`, or `finalised` |
| `material_cost` | `NUMERIC(12,4)` | ✗ |  | Total raw material cost per pair from BOM × vendor rates |
| `trims_cost` | `NUMERIC(12,4)` | ✗ |  | Total trims and accessories cost per pair |
| `labour_cost` | `NUMERIC(12,4)` | ✗ |  | Labour cost per pair from SAM and workforce cost rate |
| `overhead_cost` | `NUMERIC(12,4)` | ✗ |  | Allocated factory overhead per pair |
| `total_cost` | `NUMERIC(12,4)` | ✗ |  | Sum of all cost components per pair |
| `margin_pct` | `NUMERIC(5,2)` | ✗ |  | Target profit margin percentage over total cost |
| `selling_price` | `NUMERIC(12,4)` | ✗ |  | Derived price: total_cost × (1 + margin_pct/100) |
| `actual_cost` | `NUMERIC(12,4)` | ✓ |  | Actual cost per pair filled after order completion from GL |
| `variance` | `NUMERIC(12,4)` | ✓ |  | GENERATED: actual_cost − total_cost; positive = overrun; negative = saving |
| `approved_by` | `UUID` | ✓ | `FK` | User who approved the cost sheet |
| `approved_at` | `TIMESTAMPTZ` | ✓ |  | UTC approval timestamp |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | Auto-updated by trigger |
| `created_by` | `UUID` | ✗ | `FK` | User who created the cost sheet |

### `mfg.factory_lines`

Physical production lines in the factory. Daily pair capacity drives production planning and utilisation calculations.

⚪ **Lookup / configuration** — rarely changes once seeded

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `code` | `TEXT` | ✗ | `UK` | Short identifier, e.g. `LINE-A`, `LINE-B` |
| `name` | `TEXT` | ✗ |  | Descriptive name of the production line |
| `floor` | `TEXT` | ✓ |  | Factory floor or building where the line is located |
| `capacity_prs` | `INTEGER` | ✗ |  | Standard daily output capacity in pairs under normal conditions |
| `is_active` | `BOOLEAN` | ✗ |  | FALSE deactivates from planning without deleting history |

### `mfg.operations`

Master list of production process steps with standard times. Sequenced in `mfg.article_routings` to define the full workflow per article.

⚪ **Lookup / configuration** — rarely changes once seeded

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `code` | `TEXT` | ✗ | `UK` | Short code, e.g. `CUT`, `STCH`, `LAST`, `SOLE`, `FINISH` |
| `name` | `TEXT` | ✗ |  | Full name, e.g. `Cutting`, `Stitching`, `Lasting` |
| `section` | `TEXT` | ✗ |  | Factory section: `cutting`, `stitching`, `lasting`, `sole_attaching`, `finishing`, `qc`, or `packing` |
| `sam` | `NUMERIC(6,2)` | ✓ |  | Standard Allowed Minutes per pair; used for efficiency calculation |
| `sequence` | `SMALLINT` | ✗ |  | Default sequence in a standard production flow |

### `mfg.article_routings`

Ordered sequence of operations for each article. Production orders track WIP stage by stage using this routing.

🔵 **Mutable master data** — supports update and soft delete

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `article_id` | `UUID` | ✗ | `FK` | Article this routing applies to |
| `operation_id` | `UUID` | ✗ | `FK` | Operation at this step; references `mfg.operations` |
| `sequence` | `SMALLINT` | ✗ |  | Position in the flow; UNIQUE per article |
| `sam_override` | `NUMERIC(6,2)` | ✓ |  | Article-specific SAM if different from the operation master default |

### `mfg.production_orders`

Links a sales order to a factory line for production. Tracks planned vs produced quantities.

🟡 **Status-machine record** — transitions enforced by CHECK constraints

> **Note:** Cannot be created without an approved BOM for the article — enforced at application layer.

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `order_id` | `UUID` | ✗ | `FK` | Sales order being manufactured |
| `factory_line_id` | `UUID` | ✓ | `FK` | Line allocated; references `mfg.factory_lines` |
| `bom_id` | `UUID` | ✗ | `FK` | Approved BOM version used |
| `planned_qty` | `INTEGER` | ✗ |  | Target quantity in pairs; CHECK > 0 |
| `produced_qty` | `INTEGER` | ✗ |  | Cumulative produced so far; updated from daily entries |
| `start_date` | `DATE` | ✓ |  | Planned or actual production start date |
| `end_date` | `DATE` | ✓ |  | Planned or actual completion date |
| `status` | `TEXT` | ✗ |  | State: `planned`, `in_progress`, `completed`, or `on_hold` |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | Auto-updated by trigger |
| `created_by` | `UUID` | ✗ | `FK` | User who created the production order |

### `mfg.daily_productions`

Daily output per operation per shift. Partitioned by `prod_date` (yearly). The `efficiency_pct` is a generated column. Entries are locked at midnight.

🟠 **Partitioned table** — range-partitioned by date for performance

> **Note:** `locked = TRUE` after midnight cutoff prevents amendments without supervisor override.

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `production_order_id` | `UUID` | ✗ | `FK` | Production order being tracked |
| `prod_date` | `DATE` | ✗ |  | Date of production; also the partition key |
| `factory_line_id` | `UUID` | ✗ | `FK` | Line where production occurred |
| `operation_id` | `UUID` | ✗ | `FK` | Operation performed |
| `shift` | `TEXT` | ✗ |  | `day` or `night` |
| `target_qty` | `INTEGER` | ✗ |  | Daily target set by the supervisor |
| `produced_qty` | `INTEGER` | ✗ |  | Actual pairs completed |
| `rejected_qty` | `INTEGER` | ✗ |  | Pairs rejected and sent for rework or scrap |
| `efficiency_pct` | `NUMERIC(5,2)` | ✓ |  | GENERATED: (produced_qty / target_qty) × 100; NULL if target = 0 |
| `supervisor_id` | `UUID` | ✓ | `FK` | Supervisor who signed off the entry |
| `locked` | `BOOLEAN` | ✗ |  | TRUE after midnight; prevents further edits without override |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |

### `mfg.qc_results`

QC inspection outcomes at inline and final stages. Defect details stored as JSONB for flexible defect type tracking.

🔴 **Append-only ledger** — never UPDATE or DELETE; insert only

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `production_order_id` | `UUID` | ✗ | `FK` | Production order being inspected |
| `qc_date` | `DATE` | ✗ |  | Date of the QC inspection |
| `qc_type` | `TEXT` | ✗ |  | Stage: `inline` (during production) or `final` (before packing) |
| `operation_id` | `UUID` | ✓ | `FK` | For inline QC: the operation being checked; NULL for final QC |
| `inspected_qty` | `INTEGER` | ✗ |  | Pairs submitted for inspection |
| `passed_qty` | `INTEGER` | ✗ |  | Pairs that passed without issues |
| `failed_qty` | `INTEGER` | ✗ |  | Pairs that failed and require rework or rejection |
| `rework_qty` | `INTEGER` | ✗ |  | Pairs sent for rework; counted separately |
| `verdict` | `TEXT` | ✗ |  | Overall outcome: `pass`, `fail`, `rework`, or `conditional_pass` |
| `defect_details` | `JSONB` | ✓ |  | Array of defect objects: `[{"type":"sole_gap","qty":5,"section":"lasting"}]` |
| `inspector_id` | `UUID` | ✓ | `FK` | QC inspector who conducted the check |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |

### `mfg.machines`

Register of all production machines. Linked to `fin.fixed_assets` for depreciation tracking.

🔵 **Mutable master data** — supports update and soft delete

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `machine_code` | `TEXT` | ✗ | `UK` | Unique tag/barcode, e.g. `MCH-0021` |
| `name` | `TEXT` | ✗ |  | Machine name, e.g. `Skiving Machine`, `Sole Press` |
| `type` | `TEXT` | ✗ |  | Machine type or function |
| `model` | `TEXT` | ✓ |  | Model number from the manufacturer |
| `manufacturer` | `TEXT` | ✓ |  | Manufacturer name |
| `factory_line_id` | `UUID` | ✓ | `FK` | Line normally assigned to |
| `purchase_date` | `DATE` | ✓ |  | Date of purchase or import delivery |
| `status` | `TEXT` | ✗ |  | State: `active`, `under_maintenance`, `breakdown`, or `retired` |
| `asset_id` | `UUID` | ✓ | `FK` | Linked fixed asset in `fin.fixed_assets` for depreciation |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | Auto-updated by trigger |

### `mfg.machine_maintenance`

Log of every maintenance event. `downtime_hrs` is a generated column computed from start and end timestamps.

🔴 **Append-only ledger** — never UPDATE or DELETE; insert only

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `machine_id` | `UUID` | ✗ | `FK` | Machine maintained |
| `maint_type` | `TEXT` | ✗ |  | Type: `preventive` (scheduled), `breakdown` (unplanned), or `repair` (corrective) |
| `start_time` | `TIMESTAMPTZ` | ✗ |  | UTC start of downtime |
| `end_time` | `TIMESTAMPTZ` | ✓ |  | UTC end; NULL if still ongoing |
| `downtime_hrs` | `NUMERIC(6,2)` | ✓ |  | GENERATED: hours from start to end; NULL while ongoing |
| `description` | `TEXT` | ✓ |  | Fault description, work performed, or parts replaced |
| `cost` | `NUMERIC(10,2)` | ✓ |  | Cost including parts and labour |
| `performed_by` | `TEXT` | ✓ |  | Technician or contractor name |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |

### `mfg.lasts_moulds`

Register of all shoe lasts and moulds — high-value reusable tooling specific to each article and size. Tracks usage count against replacement threshold.

🔵 **Mutable master data** — supports update and soft delete

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `code` | `TEXT` | ✗ | `UK` | Unique identifier stamped on the physical last/mould |
| `type` | `TEXT` | ✗ |  | Physical type: `last`, `mould`, or `half_mould` |
| `article_id` | `UUID` | ✓ | `FK` | Article designed for; NULL if multi-use |
| `size_label` | `TEXT` | ✗ |  | Shoe size produced, e.g. `40`, `UK7` |
| `material` | `TEXT` | ✓ |  | Material: `aluminium`, `steel`, `plastic` |
| `supplier` | `TEXT` | ✓ |  | Supplier who made the tooling |
| `purchase_date` | `DATE` | ✓ |  | Purchase date |
| `purchase_cost` | `NUMERIC(10,2)` | ✓ |  | Original purchase cost |
| `usage_count` | `INTEGER` | ✗ |  | Number of production runs used for; incremented each assignment |
| `max_usage` | `INTEGER` | ✓ |  | Maximum recommended cycles before replacement; alert fires at threshold |
| `storage_location` | `TEXT` | ✓ |  | Physical storage location when not in use |
| `condition` | `TEXT` | ✗ |  | State: `good`, `worn`, `under_repair`, or `retired` |
| `current_order_id` | `UUID` | ✓ | `FK` | Production order currently assigned to; NULL when in storage |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | Auto-updated by trigger |

### `mfg.scrap_records`

Factory scrap and waste generated during production. Feeds scrap rate reports and disposal authorisation workflow.

🔴 **Append-only ledger** — never UPDATE or DELETE; insert only

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `production_order_id` | `UUID` | ✗ | `FK` | Production order the scrap came from |
| `scrap_date` | `DATE` | ✗ |  | Date recorded |
| `scrap_type` | `TEXT` | ✗ |  | Material type: `upper_offcut`, `rejected_sole`, `damaged_insole`, `adhesive_waste`, `packing_waste`, or `other` |
| `section` | `TEXT` | ✗ |  | Factory section where generated, e.g. `Cutting`, `Lasting` |
| `quantity` | `NUMERIC(10,3)` | ✗ |  | Quantity of scrap; CHECK > 0 |
| `uom` | `TEXT` | ✗ |  | Unit of measure |
| `unit_value` | `NUMERIC(10,4)` | ✓ |  | Estimated recoverable value per unit |
| `disposal_method` | `TEXT` | ✓ |  | How disposed: `sale`, `recycle`, or `landfill` |
| `disposal_authorised_by` | `UUID` | ✓ | `FK` | Officer authorising disposal |
| `sale_amount` | `NUMERIC(10,2)` | ✓ |  | Revenue received if sold |
| `notes` | `TEXT` | ✓ |  | Additional notes |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `created_by` | `UUID` | ✗ | `FK` | User who recorded the scrap |

---

## Schema: `inv` — Inventory Management

Multi-location stock management. Stock transactions form an immutable append-only ledger. A trigger maintains `stock_balances` running totals after every insert.

### `inv.warehouses`

Physical storage locations. Separate warehouses for different stock categories ensure accurate in-transit tracking.

⚪ **Lookup / configuration** — rarely changes once seeded

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `code` | `TEXT` | ✗ | `UK` | Short identifier, e.g. `RM-01`, `FG-01` |
| `name` | `TEXT` | ✗ |  | Full warehouse name |
| `location` | `TEXT` | ✓ |  | Floor or building within the facility |
| `type` | `TEXT` | ✗ |  | Category: `raw_material`, `accessories`, `finished_goods`, `packing`, or `general` |
| `is_active` | `BOOLEAN` | ✗ |  | FALSE removes from active operations without deleting history |

### `inv.stock_items`

Master catalogue of every item held in inventory. Reorder level and lead time drive automated replenishment alerts.

🔵 **Mutable master data** — supports update and soft delete

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `item_code` | `TEXT` | ✗ | `UK` | Unique SKU code |
| `name` | `TEXT` | ✗ |  | Full item name; GIN-trigram indexed |
| `category` | `TEXT` | ✗ |  | Classification: `raw_material`, `sole`, `accessory`, `packing`, or `finished_goods` |
| `sub_category` | `TEXT` | ✓ |  | More specific classification, e.g. `upper_leather`, `synthetic` |
| `uom` | `TEXT` | ✗ |  | Primary unit of measure: `PCS`, `MTR`, `KG`, `L`, `PAIR` |
| `reorder_level` | `NUMERIC(12,3)` | ✗ |  | Quantity at which replenishment alert fires |
| `min_stock` | `NUMERIC(12,3)` | ✗ |  | Absolute minimum; going below flags a critical shortage |
| `max_stock` | `NUMERIC(12,3)` | ✓ |  | Maximum desirable level for over-stock management; NULL = uncapped |
| `lead_time_days` | `SMALLINT` | ✗ |  | Typical supplier lead time in days |
| `hsn_code` | `TEXT` | ✓ |  | HSN/HS tariff code for customs and VAT classification |
| `is_active` | `BOOLEAN` | ✗ |  | FALSE retires item without deleting transaction history |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | Auto-updated by trigger |
| `created_by` | `UUID` | ✗ | `FK` | User who created the item master |

### `inv.stock_transactions`

Immutable append-only ledger of every stock movement. The trigger `inv.update_stock_balance` maintains running totals after every insert. Partitioned by `txn_date` (yearly).

🔴 **Append-only ledger** — never UPDATE or DELETE; insert only

> **Note:** Never UPDATE or DELETE. Corrections are posted as opposite transactions. `direction` (+1/-1) eliminates signed quantities.

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `txn_date` | `DATE` | ✗ |  | Movement date; also the partition key |
| `txn_number` | `TEXT` | ✗ | `UK` | Unique transaction reference |
| `txn_type` | `TEXT` | ✗ |  | Movement type: `grn`, `production_issue`, `production_return`, `delivery`, `return_from_buyer`, `transfer_in`, `transfer_out`, `adjustment_in`, `adjustment_out`, `opening_stock`, `write_off`, `outsource_issue`, `outsource_return` |
| `item_id` | `UUID` | ✗ | `FK` | Item being moved |
| `warehouse_id` | `UUID` | ✗ | `FK` | Warehouse affected |
| `quantity` | `NUMERIC(12,3)` | ✗ |  | Absolute quantity; always positive; CHECK > 0 |
| `direction` | `SMALLINT` | ✗ |  | +1 for stock-in, −1 for stock-out |
| `unit_cost` | `NUMERIC(12,4)` | ✓ |  | Cost per unit; used for weighted average cost update in trigger |
| `batch_lot` | `TEXT` | ✓ |  | Batch reference linked to GRN lot on receipt |
| `source_module` | `TEXT` | ✓ |  | Module that generated this: `prc`, `ord`, `mfg`, `out` |
| `source_id` | `UUID` | ✓ |  | Primary key of the source document |
| `remarks` | `TEXT` | ✓ |  | Required reason for adjustment transactions |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `created_by` | `UUID` | ✗ | `FK` | User who posted the transaction |

### `inv.stock_balances`

Running balance maintained by trigger `inv.update_stock_balance`. One row per item-warehouse combination. Never insert or update manually.

🔴 **Append-only ledger** — never UPDATE or DELETE; insert only

> **Note:** CHECK ensures quantity never goes negative. Weighted average cost is updated by the trigger on every receipt.

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `item_id` | `UUID` | ✗ | `PK FK` | Item tracked; references `inv.stock_items` |
| `warehouse_id` | `UUID` | ✗ | `PK FK` | Warehouse tracked; references `inv.warehouses` |
| `quantity` | `NUMERIC(12,3)` | ✗ |  | Current on-hand quantity; maintained by trigger; CHECK >= 0 |
| `avg_cost` | `NUMERIC(12,4)` | ✗ |  | Weighted average unit cost across all received lots |
| `last_updated` | `TIMESTAMPTZ` | ✗ |  | UTC timestamp of last balance update by the trigger |

### `inv.stock_counts`

Header for a physical stock count exercise at a specific warehouse.

🟡 **Status-machine record** — transitions enforced by CHECK constraints

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `count_date` | `DATE` | ✗ |  | Date the count was conducted |
| `warehouse_id` | `UUID` | ✗ | `FK` | Warehouse being counted |
| `status` | `TEXT` | ✗ |  | Progress: `open`, `counting`, `variance_review`, `approved`, or `cancelled` |
| `approved_by` | `UUID` | ✓ | `FK` | Finance Manager who approved the results |
| `approved_at` | `TIMESTAMPTZ` | ✓ |  | UTC approval timestamp |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `created_by` | `UUID` | ✗ | `FK` | User who initiated the count |

### `inv.stock_count_lines`

Individual item lines within a stock count. `variance` is a generated column: physical_qty − system_qty.

🔵 **Mutable master data** — supports update and soft delete

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `count_id` | `UUID` | ✗ | `FK` | Parent stock count; CASCADE DELETE |
| `item_id` | `UUID` | ✗ | `FK` | Item counted; UNIQUE per count |
| `system_qty` | `NUMERIC(12,3)` | ✗ |  | Quantity per system records when count sheet was generated |
| `physical_qty` | `NUMERIC(12,3)` | ✓ |  | Physically counted quantity; NULL until counted |
| `variance` | `NUMERIC(12,3)` | ✓ |  | GENERATED: physical_qty − system_qty; positive = surplus; negative = shortage |
| `variance_reason` | `TEXT` | ✓ |  | Explanation for variances above threshold; required for Finance sign-off |

---

## Schema: `fin` — Finance & Accounts

Complete financial system: double-entry general ledger, accounts payable and receivable, bank management, fixed asset register with automated depreciation, budget management, import/export LC tracking, delivery challans, and buyer invoicing.

### `fin.chart_of_accounts`

Hierarchical chart of accounts. Control accounts cannot receive direct postings — they aggregate from children only.

🔵 **Mutable master data** — supports update and soft delete

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `account_code` | `TEXT` | ✗ | `UK` | Unique code, e.g. `1010` (Cash), `4001` (Sales Revenue) |
| `name` | `TEXT` | ✗ |  | Account name as shown in financial statements |
| `account_type` | `TEXT` | ✗ |  | Classification: `asset`, `liability`, `equity`, `revenue`, or `expense` |
| `account_class` | `TEXT` | ✗ |  | Sub-class, e.g. `current_asset`, `fixed_asset`, `trade_payable` |
| `parent_id` | `UUID` | ✓ | `FK` | Parent account for hierarchy; NULL for root accounts |
| `is_control` | `BOOLEAN` | ✗ |  | TRUE prevents direct posting; shows rolled-up balances only |
| `currency` | `CHAR(3)` | ✗ |  | Functional currency; typically `BDT` |
| `is_active` | `BOOLEAN` | ✗ |  | FALSE retires without deleting historical balances |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | Auto-updated by trigger |

### `fin.gl_periods`

Accounting periods. `locked` prevents any further posting under any circumstance.

🟡 **Status-machine record** — transitions enforced by CHECK constraints

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `period_year` | `SMALLINT` | ✗ |  | Fiscal year; UNIQUE per year-month |
| `period_month` | `SMALLINT` | ✗ |  | Month 1–12; CHECK enforces range |
| `status` | `TEXT` | ✗ |  | State: `open`, `closed`, or `locked` |
| `closed_by` | `UUID` | ✓ | `FK` | User who closed the period |
| `closed_at` | `TIMESTAMPTZ` | ✓ |  | UTC closure timestamp |

### `fin.gl_entries`

Journal entry header. `source_module` and `source_id` trace auto-generated entries back to source documents.

🔴 **Append-only ledger** — never UPDATE or DELETE; insert only

> **Note:** Once posted, immutable. Corrections require a new `reversal` entry. Never UPDATE or DELETE posted entries.

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `entry_number` | `TEXT` | ✗ | `UK` | Auto-generated, e.g. `JV-0000142` |
| `period_id` | `UUID` | ✗ | `FK` | Accounting period; references `fin.gl_periods` |
| `entry_date` | `DATE` | ✗ |  | Effective accounting date |
| `entry_type` | `TEXT` | ✗ |  | Origin: `manual`, `system`, or `reversal` |
| `source_module` | `TEXT` | ✓ |  | Module that generated this: `payroll`, `grn`, `delivery`, `depreciation` |
| `source_id` | `UUID` | ✓ |  | Source document primary key for traceability |
| `narration` | `TEXT` | ✗ |  | Plain-language description of the entry |
| `status` | `TEXT` | ✗ |  | Lifecycle: `draft`, `posted`, or `reversed` |
| `reversal_of` | `UUID` | ✓ | `FK` | For reversals: the original entry being reversed |
| `posted_at` | `TIMESTAMPTZ` | ✓ |  | UTC posting timestamp |
| `posted_by` | `UUID` | ✓ | `FK` | User who posted the entry |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `created_by` | `UUID` | ✗ | `FK` | User who created the draft |

### `fin.gl_entry_lines`

Double-entry journal lines. Partitioned by `entry_date` (yearly). Every journal must balance: SUM(debit) = SUM(credit) — enforced by trigger on posting.

🔴 **Append-only ledger** — never UPDATE or DELETE; insert only

> **Note:** `base_debit` and `base_credit` are generated columns storing BDT equivalent after FX rate. CHECK ensures exactly one of debit/credit is non-zero per line.

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `gl_entry_id` | `UUID` | ✗ | `FK` | Parent journal; references `fin.gl_entries` |
| `account_id` | `UUID` | ✗ | `FK` | Account posted to; must not be a control account |
| `debit` | `NUMERIC(15,4)` | ✗ |  | Debit amount in transaction currency; 0 if credit > 0 |
| `credit` | `NUMERIC(15,4)` | ✗ |  | Credit amount in transaction currency; 0 if debit > 0 |
| `currency` | `CHAR(3)` | ✗ |  | Transaction currency; may differ from account currency for FX |
| `fx_rate` | `NUMERIC(12,6)` | ✗ |  | Exchange rate to BDT; 1.0 for BDT transactions |
| `base_debit` | `NUMERIC(15,4)` | ✓ |  | GENERATED: debit × fx_rate; BDT equivalent |
| `base_credit` | `NUMERIC(15,4)` | ✓ |  | GENERATED: credit × fx_rate; BDT equivalent |
| `department_id` | `UUID` | ✓ | `FK` | Department for cost centre reporting |
| `cost_center` | `TEXT` | ✓ |  | Cost centre code for sub-department granularity |
| `entry_date` | `DATE` | ✗ |  | Denormalised from parent; used as partition key |
| `narration` | `TEXT` | ✓ |  | Line-level note for additional context |

### `fin.bank_accounts`

Company bank accounts. `gl_account_id` links to chart of accounts for automatic reconciliation posting.

🔵 **Mutable master data** — supports update and soft delete

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `account_name` | `TEXT` | ✗ |  | Descriptive name, e.g. `BRAC Bank Current USD` |
| `bank_name` | `TEXT` | ✗ |  | Bank name |
| `branch` | `TEXT` | ✓ |  | Branch name or code |
| `account_number` | `TEXT` | ✗ |  | Bank account number (not encrypted — commercial account) |
| `account_type` | `TEXT` | ✗ |  | Type: `current`, `savings`, `od`, or `lc` |
| `currency` | `CHAR(3)` | ✗ |  | Account currency |
| `gl_account_id` | `UUID` | ✗ | `FK` | Linked GL account for reconciliation |
| `is_payroll` | `BOOLEAN` | ✗ |  | TRUE marks this as the salary disbursement account |
| `is_active` | `BOOLEAN` | ✗ |  | FALSE deactivates without removing history |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |

### `fin.bank_transactions`

Bank statement lines for reconciliation. Matched to GL entries via `gl_entry_id`.

🔵 **Mutable master data** — supports update and soft delete

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `bank_account_id` | `UUID` | ✗ | `FK` | Bank account this transaction belongs to |
| `txn_date` | `DATE` | ✗ |  | Date appeared on bank statement |
| `value_date` | `DATE` | ✓ |  | Value date; may differ from txn_date |
| `txn_type` | `TEXT` | ✗ |  | `debit` (out) or `credit` (in) |
| `amount` | `NUMERIC(15,2)` | ✗ |  | Transaction amount; CHECK > 0; sign from txn_type |
| `description` | `TEXT` | ✓ |  | Bank statement narration as provided by the bank |
| `reference_no` | `TEXT` | ✓ |  | Bank reference or cheque number |
| `is_reconciled` | `BOOLEAN` | ✗ |  | TRUE once matched to a GL entry |
| `gl_entry_id` | `UUID` | ✓ | `FK` | Linked GL journal after reconciliation |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |

### `fin.asset_categories`

Depreciation rules per asset class. Three GL account links drive automated monthly depreciation posting.

⚪ **Lookup / configuration** — rarely changes once seeded

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `name` | `TEXT` | ✗ | `UK` | Category name, e.g. `Machinery & Equipment`, `Office Furniture` |
| `depreciation_method` | `TEXT` | ✗ |  | `straight_line` (equal annual) or `diminishing_balance` (on declining NBV) |
| `useful_life_years` | `SMALLINT` | ✗ |  | Expected life in years |
| `depreciation_rate` | `NUMERIC(6,4)` | ✗ |  | Annual rate as decimal, e.g. 0.20 = 20% |
| `salvage_pct` | `NUMERIC(5,2)` | ✗ |  | Residual value as % of original cost; NBV never falls below this |
| `gl_asset_account` | `UUID` | ✗ | `FK` | Balance sheet asset account, e.g. `1210 Machinery` |
| `gl_depreciation_account` | `UUID` | ✗ | `FK` | P&L depreciation expense account |
| `gl_accum_dep_account` | `UUID` | ✗ | `FK` | Balance sheet accumulated depreciation account |

### `fin.fixed_assets`

Individual capitalised assets. Imported machinery auto-registered from `fin.import_lcs` at landed cost. `net_book_value` is a generated column.

🔵 **Mutable master data** — supports update and soft delete

> **Note:** `net_book_value` is GENERATED ALWAYS AS (original_cost − accumulated_dep). Do not insert into it directly.

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `asset_code` | `TEXT` | ✗ | `UK` | Auto-generated tag, e.g. `AST-00021` |
| `name` | `TEXT` | ✗ |  | Asset description, e.g. `Skiving Machine — Model XY200` |
| `category_id` | `UUID` | ✗ | `FK` | Asset category determining method and GL accounts |
| `department_id` | `UUID` | ✓ | `FK` | Department owning the asset |
| `location` | `TEXT` | ✓ |  | Physical location, e.g. `Factory Floor Line B` |
| `purchase_date` | `DATE` | ✗ |  | Purchase date; for imports: customs delivery date |
| `original_cost` | `NUMERIC(14,2)` | ✗ |  | Total capitalised cost; for imports: landed cost |
| `salvage_value` | `NUMERIC(12,2)` | ✗ |  | Estimated residual value at end of useful life |
| `useful_life_years` | `SMALLINT` | ✗ |  | Estimated useful life in years |
| `depreciation_method` | `TEXT` | ✗ |  | Can override the category default for this specific asset |
| `accumulated_dep` | `NUMERIC(14,2)` | ✗ |  | Running total depreciation charged; updated monthly |
| `net_book_value` | `NUMERIC(14,2)` | ✗ |  | GENERATED: original_cost − accumulated_dep |
| `status` | `TEXT` | ✗ |  | State: `active`, `disposed`, or `written_off` |
| `disposal_date` | `DATE` | ✓ |  | Date sold, scrapped, or written off |
| `disposal_proceeds` | `NUMERIC(12,2)` | ✓ |  | Cash received on disposal; used to compute gain/loss |
| `import_ref` | `TEXT` | ✓ |  | Import LC or shipment reference if imported |
| `notes` | `TEXT` | ✓ |  | Asset history or condition notes |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | Auto-updated by trigger |
| `created_by` | `UUID` | ✗ | `FK` | User who registered the asset |

### `fin.asset_depreciation`

Append-only monthly depreciation log. One row per asset per period. UNIQUE prevents double-posting.

🔴 **Append-only ledger** — never UPDATE or DELETE; insert only

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `asset_id` | `UUID` | ✗ | `FK` | Asset being depreciated; UNIQUE per period |
| `period_id` | `UUID` | ✗ | `FK` | GL period for this charge |
| `dep_amount` | `NUMERIC(12,4)` | ✗ |  | Depreciation charge for this period |
| `nbv_before` | `NUMERIC(14,2)` | ✗ |  | Net book value before this charge |
| `nbv_after` | `NUMERIC(14,2)` | ✗ |  | Net book value after this charge |
| `gl_entry_id` | `UUID` | ✓ | `FK` | GL journal created for this depreciation charge |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |

### `fin.budgets`

Budget header per fiscal year and type. `locked` prevents all further amendments.

🟡 **Status-machine record** — transitions enforced by CHECK constraints

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `budget_year` | `SMALLINT` | ✗ |  | Fiscal year; UNIQUE per year-type |
| `name` | `TEXT` | ✗ |  | Budget name, e.g. `FY2026 Operating Budget` |
| `budget_type` | `TEXT` | ✗ |  | Classification: `opex`, `capex`, or `consolidated` |
| `status` | `TEXT` | ✗ |  | State: `draft`, `submitted`, `approved`, or `locked` |
| `approved_by` | `UUID` | ✓ | `FK` | MD who approved |
| `approved_at` | `TIMESTAMPTZ` | ✓ |  | UTC approval timestamp |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | Auto-updated by trigger |
| `created_by` | `UUID` | ✗ | `FK` | Finance Manager who prepared the budget |

### `fin.budget_lines`

Individual budget line items per account, department, and month. Variance computed at query time against actual GL postings.

🔵 **Mutable master data** — supports update and soft delete

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `budget_id` | `UUID` | ✗ | `FK` | Parent budget; CASCADE DELETE |
| `account_id` | `UUID` | ✗ | `FK` | GL account being budgeted |
| `department_id` | `UUID` | ✓ | `FK` | Department; NULL for company-wide lines |
| `period_month` | `SMALLINT` | ✗ |  | Month 1–12; UNIQUE per budget-account-dept-month |
| `budgeted_amt` | `NUMERIC(15,2)` | ✗ |  | Original budget amount |
| `revised_amt` | `NUMERIC(15,2)` | ✓ |  | Mid-year revised amount; NULL if no revision |

### `fin.import_lcs`

Import Letters of Credit from opening through delivery and payment. Landed cost computed from all import charges.

🟡 **Status-machine record** — transitions enforced by CHECK constraints

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `lc_number` | `TEXT` | ✗ | `UK` | Bank-issued LC number |
| `issuing_bank` | `TEXT` | ✗ |  | Bangladeshi bank that issued the LC |
| `beneficiary` | `TEXT` | ✗ |  | Overseas supplier beneficiary |
| `po_id` | `UUID` | ✓ | `FK` | Purchase order this LC finances |
| `lc_amount` | `NUMERIC(15,2)` | ✗ |  | Total LC value in LC currency |
| `currency` | `CHAR(3)` | ✗ |  | LC currency; typically `USD` |
| `open_date` | `DATE` | ✗ |  | Date the LC was opened |
| `expiry_date` | `DATE` | ✗ |  | Expiry date; system alerts 30 days before |
| `shipment_last` | `DATE` | ✓ |  | Latest permitted shipment date under LC terms |
| `incoterm` | `TEXT` | ✓ |  | Trade term, e.g. `FOB`, `CIF`, `EXW` |
| `status` | `TEXT` | ✗ |  | Stage: `draft`, `open`, `shipment_confirmed`, `docs_received`, `customs_cleared`, `delivered`, or `settled` |
| `landed_cost` | `NUMERIC(15,2)` | ✓ |  | Total: product cost + freight + insurance + customs duty + port charges |
| `notes` | `TEXT` | ✓ |  | LC terms, amendments, or issue notes |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | Auto-updated by trigger |
| `created_by` | `UUID` | ✗ | `FK` | User who registered the LC |

### `fin.export_lcs`

Export LCs received from overseas buyers. Tracks document submission, negotiation, and foreign currency repatriation.

🟡 **Status-machine record** — transitions enforced by CHECK constraints

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `lc_number` | `TEXT` | ✗ | `UK` | Buyer's LC number |
| `buyer_id` | `UUID` | ✗ | `FK` | Buyer who opened the LC |
| `order_id` | `UUID` | ✓ | `FK` | Sales order covered by this LC |
| `advising_bank` | `TEXT` | ✓ |  | Bangladeshi advising bank |
| `lc_amount` | `NUMERIC(15,2)` | ✗ |  | LC face value |
| `currency` | `CHAR(3)` | ✗ |  | LC currency; typically `USD` |
| `open_date` | `DATE` | ✗ |  | Date received by OK Footwear |
| `expiry_date` | `DATE` | ✗ |  | LC expiry; system alerts 30 days before |
| `shipment_last` | `DATE` | ✓ |  | Latest permitted shipment date |
| `tolerance_pct` | `NUMERIC(4,1)` | ✗ |  | Permitted over/under-shipment %; typically ±5% |
| `status` | `TEXT` | ✗ |  | Stage: `received`, `docs_submitted`, `negotiated`, `payment_received`, `repatriated`, or `closed` |
| `repatriation_date` | `DATE` | ✓ |  | Date export proceeds were received; regulatory requirement |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | Auto-updated by trigger |
| `created_by` | `UUID` | ✗ | `FK` | User who registered |

### `fin.delivery_challans`

Shipment records to buyers. Linked to sales order and optionally export LC. Generates POD record on delivery confirmation.

🟡 **Status-machine record** — transitions enforced by CHECK constraints

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `dc_number` | `TEXT` | ✗ | `UK` | Auto-generated, e.g. `DC-000088` |
| `order_id` | `UUID` | ✗ | `FK` | Order being shipped |
| `export_lc_id` | `UUID` | ✓ | `FK` | Export LC covering this shipment |
| `dc_date` | `DATE` | ✗ |  | Date of physical dispatch |
| `vehicle_no` | `TEXT` | ✓ |  | Transport vehicle registration |
| `carrier` | `TEXT` | ✓ |  | Logistics carrier or freight forwarder |
| `dispatch_by` | `UUID` | ✓ | `FK` | User who dispatched |
| `status` | `TEXT` | ✗ |  | State: `draft`, `dispatched`, `delivered`, or `returned` |
| `pod_date` | `DATE` | ✓ |  | Confirmed delivery date at buyer's warehouse |
| `pod_receiver` | `TEXT` | ✓ |  | Person who signed for delivery |
| `pod_notes` | `TEXT` | ✓ |  | Notes on delivery condition |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | Auto-updated by trigger |
| `created_by` | `UUID` | ✗ | `FK` | User who created the challan |

### `fin.dc_lines`

Size-level line items within a delivery challan. `amount` is a generated column.

🔵 **Mutable master data** — supports update and soft delete

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `dc_id` | `UUID` | ✗ | `FK` | Parent challan; CASCADE DELETE |
| `order_line_id` | `UUID` | ✗ | `FK` | Order line (size) being shipped |
| `quantity` | `INTEGER` | ✗ |  | Pairs dispatched; CHECK > 0 |
| `unit_price` | `NUMERIC(12,4)` | ✗ |  | Price per pair at delivery |
| `amount` | `NUMERIC(14,4)` | ✗ |  | GENERATED: quantity × unit_price |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |

### `fin.buyer_invoices`

Buyer invoices (accounts receivable). GL entry created when invoice is posted.

🟡 **Status-machine record** — transitions enforced by CHECK constraints

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `invoice_no` | `TEXT` | ✗ | `UK` | Unique invoice reference |
| `buyer_id` | `UUID` | ✗ | `FK` | Buyer being invoiced |
| `dc_id` | `UUID` | ✗ | `FK` | Delivery challan this invoice covers |
| `invoice_date` | `DATE` | ✗ |  | Invoice issue date |
| `due_date` | `DATE` | ✗ |  | Payment due date |
| `currency` | `CHAR(3)` | ✗ |  | Invoice currency |
| `gross_amount` | `NUMERIC(15,2)` | ✗ |  | Total invoice value |
| `collected_amount` | `NUMERIC(15,2)` | ✗ |  | Running total collected; starts at 0 |
| `status` | `TEXT` | ✗ |  | Payment state: `unpaid`, `partial`, `paid`, or `disputed` |
| `gl_entry_id` | `UUID` | ✓ | `FK` | GL journal posting the AR |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | Auto-updated by trigger |
| `created_by` | `UUID` | ✗ | `FK` | User who created the invoice |

---

## Schema: `hr` — Human Resources & Payroll

Full employee lifecycle from hiring to exit, attendance and leave management, flexible salary structures, payroll processing, provident fund, gratuity, and Bangladesh Labour Act compliance.

### `hr.departments`

Self-referencing hierarchical org tree. A department can have a parent and a department head (employee).

🔵 **Mutable master data** — supports update and soft delete

> **Note:** `head_id` FK added after `hr.employees` to resolve circular dependency.

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `code` | `TEXT` | ✗ | `UK` | Short code, e.g. `PROD`, `FIN`, `HR` |
| `name` | `TEXT` | ✗ |  | Full department name |
| `parent_id` | `UUID` | ✓ | `FK` | Parent department; NULL for top-level |
| `head_id` | `UUID` | ✓ | `FK` | Department head employee; references `hr.employees` |
| `cost_center` | `TEXT` | ✓ |  | Cost centre code used in GL postings |
| `location` | `TEXT` | ✓ |  | Physical location, e.g. `Factory Floor`, `Head Office` |
| `is_active` | `BOOLEAN` | ✗ |  | FALSE deactivates; employees must be transferred out first |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | Auto-updated by trigger |

### `hr.job_titles`

Master list of job titles with seniority level classification.

⚪ **Lookup / configuration** — rarely changes once seeded

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `code` | `TEXT` | ✗ | `UK` | Short code, e.g. `LINE_SUP`, `QC_INSP`, `FIN_MGR` |
| `title` | `TEXT` | ✗ |  | Full job title shown on letters and payslips |
| `level` | `TEXT` | ✗ |  | Seniority band: `junior`, `mid`, `senior`, `lead`, `manager`, or `director` |

### `hr.pay_grades`

Salary bands per grade. Employee basic salary must fall within grade min-max (enforced by application logic).

⚪ **Lookup / configuration** — rarely changes once seeded

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `code` | `TEXT` | ✗ | `UK` | Pay grade code, e.g. `G1`, `G2`, `M1` |
| `name` | `TEXT` | ✗ |  | Grade name, e.g. `Entry Level`, `Mid-Level`, `Manager` |
| `min_salary` | `NUMERIC(12,2)` | ✗ |  | Minimum basic salary in BDT |
| `max_salary` | `NUMERIC(12,2)` | ✗ |  | Maximum basic salary; CHECK max >= min |
| `currency` | `CHAR(3)` | ✗ |  | Currency of the band; `BDT` for local staff |

### `hr.employees`

Core employee record. Non-sensitive employment and personal data. Sensitive fields (NID, passport, bank account) stored encrypted in `hr.employee_secrets`.

🔵 **Mutable master data** — supports update and soft delete

> **Note:** CHECK `chk_factory_cat` ensures factory employees always have `factory_category` set. `basic_salary` is a denormalised snapshot for fast payroll queries; full history in `hr.employee_salaries`.

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `employee_code` | `TEXT` | ✗ | `UK` | Unique HR code; partial index excludes deleted employees |
| `full_name` | `TEXT` | ✗ |  | Full legal name; GIN-trigram indexed for search |
| `date_of_birth` | `DATE` | ✗ |  | Used for age-based policy calculations |
| `gender` | `CHAR(1)` | ✗ |  | `M`, `F`, or `O`; CHECK enforces these values |
| `nationality` | `TEXT` | ✗ |  | Nationality, e.g. `Bangladeshi` |
| `religion` | `TEXT` | ✓ |  | Optional; may affect festival bonus eligibility |
| `marital_status` | `TEXT` | ✓ |  | `single`, `married`, `divorced`, or `widowed` |
| `join_date` | `DATE` | ✗ |  | Official joining date; used for service duration and gratuity |
| `confirmation_date` | `DATE` | ✓ |  | Date confirmed after probation; NULL while on probation |
| `department_id` | `UUID` | ✗ | `FK` | Current department |
| `job_title_id` | `UUID` | ✓ | `FK` | Current job title; references `hr.job_titles` |
| `pay_grade_id` | `UUID` | ✓ | `FK` | Pay grade for salary band enforcement |
| `designation` | `TEXT` | ✗ |  | Free-text designation shown on payslips and letters |
| `employment_type` | `TEXT` | ✗ |  | Contract: `full_time`, `contractor`, `intern`, or `part_time` |
| `employee_category` | `TEXT` | ✗ |  | `office` or `factory` |
| `factory_category` | `TEXT` | ✓ |  | Factory role: `operator`, `helper`, `qc_inspector`, `supervisor`, or `floor_incharge`; required when category = factory |
| `reporting_manager_id` | `UUID` | ✓ | `FK` | Direct line manager; self-referencing FK |
| `status` | `TEXT` | ✗ |  | State: `active`, `probation`, `notice_period`, `terminated`, or `resigned` |
| `basic_salary` | `NUMERIC(12,2)` | ✗ |  | Denormalised current basic for fast payroll queries |
| `last_working_date` | `DATE` | ✓ |  | Last day; set when notice is given or exit processed |
| `photo_url` | `TEXT` | ✓ |  | S3/MinIO URL of profile photo |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | Auto-updated by trigger |
| `deleted_at` | `TIMESTAMPTZ` | ✓ |  | Soft-delete timestamp; partial unique index excludes deleted |
| `created_by` | `UUID` | ✗ | `FK` | HR officer who created the record |

### `hr.employee_secrets`

Personally sensitive data encrypted at application layer (AES-256-GCM). No plain-text secrets ever touch the database wire.

🔵 **Mutable master data** — supports update and soft delete

> **Note:** JOIN this table only when the application specifically needs the sensitive field.

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `employee_id` | `UUID` | ✗ | `PK FK` | References `hr.employees`; CASCADE DELETE |
| `nid_encrypted` | `BYTEA` | ✓ |  | AES-256-GCM encrypted National ID number |
| `passport_encrypted` | `BYTEA` | ✓ |  | AES-256-GCM encrypted passport number |
| `bank_account_encrypted` | `BYTEA` | ✓ |  | AES-256-GCM encrypted bank account number |
| `bank_name` | `TEXT` | ✓ |  | Bank name; not sensitive |
| `bank_branch` | `TEXT` | ✓ |  | Branch name; not sensitive |
| `routing_number` | `TEXT` | ✓ |  | Routing or SWIFT code; not sensitive |
| `emergency_contact` | `JSONB` | ✓ |  | JSON: `{"name":"","relation":"","phone":"","address":""}` |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | UTC update timestamp |

### `hr.employment_events`

Append-only chronological log of all lifecycle events. Every promotion, transfer, salary revision, and exit creates a new row. Never updated.

🔴 **Append-only ledger** — never UPDATE or DELETE; insert only

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `employee_id` | `UUID` | ✗ | `FK` | Employee this event relates to |
| `event_type` | `TEXT` | ✗ |  | Type: `hire`, `transfer`, `promotion`, `demotion`, `salary_revision`, `confirmation`, `notice_period`, `termination`, or `resignation` |
| `effective_date` | `DATE` | ✗ |  | Date the change took effect |
| `old_department` | `UUID` | ✓ | `FK` | Department before transfer; NULL for non-transfer events |
| `new_department` | `UUID` | ✓ | `FK` | Department after transfer |
| `old_designation` | `TEXT` | ✓ |  | Designation before change |
| `new_designation` | `TEXT` | ✓ |  | Designation after change |
| `old_basic` | `NUMERIC(12,2)` | ✓ |  | Basic salary before revision |
| `new_basic` | `NUMERIC(12,2)` | ✓ |  | Basic salary after revision |
| `reason` | `TEXT` | ✓ |  | Business reason for the event |
| `notes` | `TEXT` | ✓ |  | Additional HR or management notes |
| `approved_by` | `UUID` | ✗ | `FK` | Manager or MD who approved the change |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `created_by` | `UUID` | ✗ | `FK` | HR officer who recorded the event |

### `hr.leave_types`

Defines every leave type with policy parameters including accrual, carry-forward, encashment, and documentation rules.

⚪ **Lookup / configuration** — rarely changes once seeded

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `code` | `TEXT` | ✗ | `UK` | Short code: `CL`, `SL`, `EL`, `ML`, `PL`, `UL`, `BL`, `CO` |
| `name` | `TEXT` | ✗ |  | Full name, e.g. `Casual Leave`, `Earned Leave` |
| `is_paid` | `BOOLEAN` | ✗ |  | TRUE for paid types; FALSE for unpaid |
| `accrual_type` | `TEXT` | ✗ |  | How balance accumulates: `annual`, `monthly`, or `none` |
| `annual_entitlement` | `NUMERIC(5,2)` | ✗ |  | Days per year; 0 for types with no accrual |
| `carry_forward_limit` | `NUMERIC(5,2)` | ✗ |  | Max days carried to next year; 0 = no carry-forward |
| `max_balance` | `NUMERIC(5,2)` | ✓ |  | Balance cap; excess lapses automatically; NULL = uncapped |
| `is_encashable` | `BOOLEAN` | ✗ |  | TRUE allows encashment on resignation or retirement |
| `requires_document` | `BOOLEAN` | ✗ |  | TRUE requires document upload, e.g. medical certificate for sick leave |
| `min_advance_days` | `SMALLINT` | ✗ |  | Minimum advance notice days; 0 for casual leave |
| `half_day_allowed` | `BOOLEAN` | ✗ |  | TRUE allows half-day applications for this type |
| `is_active` | `BOOLEAN` | ✗ |  | FALSE retires without deleting historical balances |

### `hr.holiday_calendars`

Groups holidays by year and location. Multiple calendars per year if different offices observe different holidays.

⚪ **Lookup / configuration** — rarely changes once seeded

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `year` | `SMALLINT` | ✗ |  | Calendar year; UNIQUE per year-location |
| `location` | `TEXT` | ✓ |  | Location this applies to; NULL = all locations |
| `name` | `TEXT` | ✗ |  | Name, e.g. `Bangladesh Public Holidays 2026` |

### `hr.holidays`

Individual holiday dates within a calendar.

⚪ **Lookup / configuration** — rarely changes once seeded

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `calendar_id` | `UUID` | ✗ | `FK` | Parent calendar; CASCADE DELETE |
| `holiday_date` | `DATE` | ✗ |  | Date of the holiday |
| `name` | `TEXT` | ✗ |  | Name, e.g. `Eid-ul-Fitr`, `Independence Day` |
| `type` | `TEXT` | ✗ |  | `public` = mandatory; `optional` = employee choice; `restricted` = from limited list |

### `hr.leave_balances`

Per-employee per-year per-leave-type balance. `balance` is a generated column: opening + accrued + adjusted − used.

🔵 **Mutable master data** — supports update and soft delete

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `employee_id` | `UUID` | ✗ | `FK` | Employee; UNIQUE per employee-type-year |
| `leave_type_id` | `UUID` | ✗ | `FK` | Leave type |
| `year` | `SMALLINT` | ✗ |  | Calendar year |
| `opening_bal` | `NUMERIC(6,2)` | ✗ |  | Opening balance including carry-forward from prior year |
| `accrued` | `NUMERIC(6,2)` | ✗ |  | Days accrued by the accrual engine during the year |
| `adjusted` | `NUMERIC(6,2)` | ✗ |  | Manual HR adjustments (positive = add; negative = deduct) |
| `used` | `NUMERIC(6,2)` | ✗ |  | Days consumed by approved leave requests |
| `balance` | `NUMERIC(6,2)` | ✗ |  | GENERATED: opening_bal + accrued + adjusted − used |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | UTC of last balance change |

### `hr.leave_requests`

Leave applications with multi-level approval workflow. Supports half-day and hourly leave.

🟡 **Status-machine record** — transitions enforced by CHECK constraints

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `employee_id` | `UUID` | ✗ | `FK` | Applying employee |
| `leave_type_id` | `UUID` | ✗ | `FK` | Type of leave applied for |
| `start_date` | `DATE` | ✗ |  | First day of leave |
| `end_date` | `DATE` | ✗ |  | Last day; CHECK ensures end_date >= start_date |
| `half_day` | `TEXT` | ✓ |  | `morning` or `afternoon` for half-day requests; NULL for full-day |
| `total_days` | `NUMERIC(5,2)` | ✗ |  | Total leave days; fractional for half-days |
| `reason` | `TEXT` | ✓ |  | Employee's stated reason |
| `status` | `TEXT` | ✗ |  | State: `pending`, `manager_approved`, `hr_approved`, `rejected`, or `cancelled` |
| `manager_id` | `UUID` | ✓ | `FK` | Line manager who approved or rejected |
| `manager_decision_at` | `TIMESTAMPTZ` | ✓ |  | UTC of manager's decision |
| `hr_decision_at` | `TIMESTAMPTZ` | ✓ |  | UTC of HR's decision if required for this leave type |
| `rejection_reason` | `TEXT` | ✓ |  | Reason if rejected |
| `document_url` | `TEXT` | ✓ |  | Supporting document URL in S3/MinIO |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | Auto-updated by trigger |

### `hr.attendance_records`

Daily attendance per employee. Partitioned by `check_date` (yearly). Status computed from clock times, leave records, and holiday calendar.

🟠 **Partitioned table** — range-partitioned by date for performance

> **Note:** UNIQUE on (employee_id, check_date) prevents duplicates. Biometric sync and web clock-in both write here.

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `employee_id` | `UUID` | ✗ | `FK` | Employee; UNIQUE per employee-date within partition |
| `check_date` | `DATE` | ✗ |  | Attendance date; also the partition key |
| `clock_in` | `TIMESTAMPTZ` | ✓ |  | UTC clock-in; NULL if absent or on leave |
| `clock_out` | `TIMESTAMPTZ` | ✓ |  | UTC clock-out; NULL if not yet clocked out or absent |
| `source` | `TEXT` | ✗ |  | How created: `web`, `biometric`, or `manual` |
| `status` | `TEXT` | ✗ |  | Computed: `present`, `absent`, `late`, `half_day`, `on_leave`, or `holiday` |
| `late_minutes` | `SMALLINT` | ✗ |  | Minutes arrived late; 0 if on time |
| `overtime_hrs` | `NUMERIC(4,2)` | ✗ |  | Approved overtime hours; subject to Labour Act daily/weekly limits |
| `lop_days` | `NUMERIC(3,2)` | ✗ |  | Loss-of-pay days deducted for this date; 0 for paid leave and holidays |
| `corrected_by` | `UUID` | ✓ | `FK` | HR officer who made a manual correction |
| `correction_reason` | `TEXT` | ✓ |  | Mandatory reason when manually corrected |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |

### `hr.salary_components`

Individual earning and deduction components. Can be fixed, percentage of another component, or evaluated formula expressions.

⚪ **Lookup / configuration** — rarely changes once seeded

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `code` | `TEXT` | ✗ | `UK` | Short code, e.g. `BASIC`, `HRA`, `PF_EMP`, `TDS` |
| `name` | `TEXT` | ✗ |  | Full name shown on payslip, e.g. `House Rent Allowance` |
| `component_type` | `TEXT` | ✗ |  | `earning`, `deduction`, or `benefit` |
| `calc_mode` | `TEXT` | ✗ |  | `fixed` (set amount), `pct_of` (% of another), or `formula` (custom expression) |
| `pct_of_component` | `TEXT` | ✓ |  | For `pct_of`: code of base component, e.g. `BASIC` |
| `pct_value` | `NUMERIC(6,4)` | ✓ |  | For `pct_of`: percentage as decimal, e.g. 0.40 for 40% |
| `formula_expr` | `TEXT` | ✓ |  | For `formula`: expression evaluated at payroll computation time |
| `sequence` | `SMALLINT` | ✗ |  | Processing order; dependents must have higher sequence than their base |
| `taxable` | `BOOLEAN` | ✗ |  | TRUE includes this component in TDS computation base |
| `is_active` | `BOOLEAN` | ✗ |  | FALSE retires from use in new structures |

### `hr.salary_structures`

Named bundles of salary components defining which components apply to a group of employees.

⚪ **Lookup / configuration** — rarely changes once seeded

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `code` | `TEXT` | ✗ | `UK` | Short code, e.g. `FAC_A`, `OFF_M` |
| `name` | `TEXT` | ✗ |  | Full name, e.g. `Factory Worker Grade A` |
| `currency` | `CHAR(3)` | ✗ |  | Salary currency; `BDT` for local employees |
| `is_active` | `BOOLEAN` | ✗ |  | FALSE retires; employees must be reassigned |

### `hr.struct_components`

Junction linking components to salary structures. `override_value` allows structure-level fixed override.

🟣 **Junction table** — resolves many-to-many relationship

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `structure_id` | `UUID` | ✗ | `PK FK` | References `hr.salary_structures` |
| `component_id` | `UUID` | ✗ | `PK FK` | References `hr.salary_components` |
| `sequence` | `SMALLINT` | ✗ |  | Processing order within this structure |
| `override_value` | `NUMERIC(12,2)` | ✓ |  | Fixed amount override; NULL uses the component's own calculation |

### `hr.employee_salaries`

Effective-dated salary assignments. Only `is_current = TRUE` used for payroll; others form history.

🔴 **Append-only ledger** — never UPDATE or DELETE; insert only

> **Note:** On revision: previous record gets `is_current = FALSE`, new record inserted. `hr.employment_events` records the business event; this table records the effective salary.

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `employee_id` | `UUID` | ✗ | `FK` | Employee; references `hr.employees` |
| `structure_id` | `UUID` | ✗ | `FK` | Salary structure for this assignment |
| `basic_salary` | `NUMERIC(12,2)` | ✗ |  | Basic salary; CHECK >= 0 |
| `effective_from` | `DATE` | ✗ |  | Date this salary takes effect |
| `effective_to` | `DATE` | ✓ |  | End date; NULL for current record |
| `is_current` | `BOOLEAN` | ✗ |  | TRUE for active salary; only one TRUE per employee at a time |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `created_by` | `UUID` | ✗ | `FK` | HR officer who created or revised this record |

### `hr.payroll_runs`

Monthly payroll batch header. Once `disbursed`, immutable — only correctable via a reversal run.

🟡 **Status-machine record** — transitions enforced by CHECK constraints

> **Note:** UNIQUE on (period_month, period_year) prevents duplicate runs. CHECK prevents payroll more than 31 days in the future.

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `period_month` | `SMALLINT` | ✗ |  | Month 1–12; UNIQUE per year-month |
| `period_year` | `SMALLINT` | ✗ |  | Payroll year |
| `status` | `TEXT` | ✗ |  | Lifecycle: `draft`, `processing`, `approved`, `disbursed`, or `reversed` |
| `total_gross` | `NUMERIC(16,2)` | ✗ |  | Sum of gross pay across all employees |
| `total_deductions` | `NUMERIC(16,2)` | ✗ |  | Sum of all deductions (PF, TDS, advance recoveries) |
| `total_net` | `NUMERIC(16,2)` | ✗ |  | Net payable: total_gross − total_deductions |
| `employee_count` | `INTEGER` | ✗ |  | Number of employees processed |
| `run_by` | `UUID` | ✗ | `FK` | HR officer who initiated computation |
| `approved_by` | `UUID` | ✓ | `FK` | Finance Manager who approved for disbursement |
| `approved_at` | `TIMESTAMPTZ` | ✓ |  | UTC approval timestamp |
| `disbursed_at` | `TIMESTAMPTZ` | ✓ |  | UTC when bank file was generated and run marked disbursed |
| `gl_entry_id` | `UUID` | ✓ | `FK` | GL journal posting payroll to the ledger |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | Auto-updated by trigger |

### `hr.payroll_entries`

Individual payroll result per employee per run. `components` JSONB stores full breakdown for payslip rendering.

🔴 **Append-only ledger** — never UPDATE or DELETE; insert only

> **Note:** UNIQUE on (payroll_run_id, employee_id) ensures one entry per employee per run. Format: `[{"code":"BASIC","name":"Basic","amount":15000,"type":"earning"}]`

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `payroll_run_id` | `UUID` | ✗ | `FK` | Parent payroll run; UNIQUE per run-employee |
| `employee_id` | `UUID` | ✗ | `FK` | Employee being paid |
| `basic_salary` | `NUMERIC(12,2)` | ✗ |  | Basic salary used for this computation |
| `gross_pay` | `NUMERIC(12,2)` | ✗ |  | Total gross: sum of all earning components |
| `total_deductions` | `NUMERIC(12,2)` | ✗ |  | Total deductions: PF, TDS, advance recovery, and others |
| `net_pay` | `NUMERIC(12,2)` | ✗ |  | Disbursed amount: gross_pay − total_deductions |
| `lop_days` | `NUMERIC(4,2)` | ✗ |  | Loss-of-pay days for unauthorised absences this month |
| `overtime_hours` | `NUMERIC(5,2)` | ✗ |  | Approved overtime hours for the month |
| `pf_employee` | `NUMERIC(10,2)` | ✗ |  | Employee PF contribution deducted |
| `pf_employer` | `NUMERIC(10,2)` | ✗ |  | Employer PF contribution credited to PF account |
| `tds_amount` | `NUMERIC(10,2)` | ✗ |  | Tax Deducted at Source for the month |
| `festival_bonus` | `NUMERIC(10,2)` | ✗ |  | Festival bonus if applicable in this run |
| `components` | `JSONB` | ✗ |  | Full component breakdown for payslip rendering |
| `bank_account_snapshot` | `BYTEA` | ✓ |  | AES-256 encrypted bank account snapshot at disbursement time |
| `disburse_status` | `TEXT` | ✗ |  | Individual outcome: `pending`, `disbursed`, `failed`, or `hold` |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |

### `hr.pf_accounts`

One PF account per enrolled employee. Tracks balance and contribution percentages.

🔵 **Mutable master data** — supports update and soft delete

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `employee_id` | `UUID` | ✗ | `UK` | Employee; UNIQUE — one PF account per employee |
| `employee_pct` | `NUMERIC(5,2)` | ✗ |  | Employee contribution as % of basic; typically 10% |
| `employer_pct` | `NUMERIC(5,2)` | ✗ |  | Employer matching contribution %; typically 10% |
| `enrolled_date` | `DATE` | ✗ |  | Date employee became eligible and was enrolled |
| `balance` | `NUMERIC(14,2)` | ✗ |  | Current PF balance; maintained by `hr.pf_transactions` inserts |
| `status` | `TEXT` | ✗ |  | State: `active`, `suspended`, or `settled` (closed on exit) |

### `hr.pf_transactions`

Append-only PF ledger: monthly contributions, annual interest credits, withdrawals, and settlement on exit.

🔴 **Append-only ledger** — never UPDATE or DELETE; insert only

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `pf_account_id` | `UUID` | ✗ | `FK` | PF account; references `hr.pf_accounts` |
| `txn_type` | `TEXT` | ✗ |  | Type: `employee_contrib`, `employer_contrib`, `interest`, `withdrawal`, or `settlement` |
| `period_month` | `SMALLINT` | ✓ |  | Month for contribution transactions; NULL for interest and settlements |
| `period_year` | `SMALLINT` | ✓ |  | Year for contribution transactions |
| `amount` | `NUMERIC(12,2)` | ✗ |  | Transaction amount; CHECK > 0; sign indicated by direction |
| `direction` | `SMALLINT` | ✗ |  | +1 for credits (contributions, interest); -1 for debits (withdrawals, settlement) |
| `balance_after` | `NUMERIC(14,2)` | ✗ |  | PF balance after this transaction; stored for statement generation |
| `payroll_run_id` | `UUID` | ✓ | `FK` | For contributions: the payroll run that triggered them |
| `gl_entry_id` | `UUID` | ✓ | `FK` | GL journal for PF expense posting |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |

### `hr.gratuity_provisions`

Monthly gratuity liability accrual per employee using Bangladesh Labour Act 2006 formula. UNIQUE per employee-date.

🔴 **Append-only ledger** — never UPDATE or DELETE; insert only

> **Note:** Stored function `hr.compute_gratuity(employee_id, exit_date)` encodes: Basic × (30/26) × completed_years; < 6 months ignored; ≥ 6 months rounds to 1 year.

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `employee_id` | `UUID` | ✗ | `FK` | Employee; UNIQUE per employee-date |
| `as_of_date` | `DATE` | ✗ |  | Date at which provision was computed; typically month-end |
| `service_years` | `NUMERIC(5,2)` | ✗ |  | Total completed service years as of as_of_date |
| `last_basic` | `NUMERIC(12,2)` | ✗ |  | Basic salary used as computation base |
| `provision_amount` | `NUMERIC(14,2)` | ✗ |  | Entitlement: basic × (30/26) × service_years |
| `cumulative_amount` | `NUMERIC(14,2)` | ✗ |  | Total cumulative provision posted to balance sheet so far |
| `period_charge` | `NUMERIC(12,2)` | ✗ |  | Incremental charge: provision_amount − prior period provision |
| `gl_entry_id` | `UUID` | ✓ | `FK` | GL journal for this period's gratuity expense charge |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |

### `hr.expense_claims`

Employee expense reimbursement claim header. Reimbursed via payroll or standalone transfer.

🟡 **Status-machine record** — transitions enforced by CHECK constraints

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `employee_id` | `UUID` | ✗ | `FK` | Claimant employee |
| `claim_date` | `DATE` | ✗ |  | Date the claim was submitted |
| `title` | `TEXT` | ✗ |  | Brief description, e.g. `Business Travel — Chittagong Oct 2025` |
| `total_amount` | `NUMERIC(12,2)` | ✗ |  | Sum of all expense line amounts |
| `status` | `TEXT` | ✗ |  | State: `draft`, `submitted`, `manager_approved`, `finance_approved`, `reimbursed`, `rejected`, or `cancelled` |
| `reimburse_via` | `TEXT` | ✗ |  | Payment method: `payroll` (next run) or `direct_transfer` |
| `payroll_run_id` | `UUID` | ✓ | `FK` | For payroll reimbursement: run in which this was settled |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | Auto-updated by trigger |

### `hr.expense_lines`

Individual expense items within a claim. Receipts stored as URLs in S3/MinIO.

🔵 **Mutable master data** — supports update and soft delete

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `claim_id` | `UUID` | ✗ | `FK` | Parent claim; CASCADE DELETE |
| `category` | `TEXT` | ✗ |  | Category: `Travel`, `Accommodation`, `Meals`, `Stationery` |
| `description` | `TEXT` | ✓ |  | Brief description of the expenditure |
| `amount` | `NUMERIC(10,2)` | ✗ |  | Expense amount; CHECK > 0 |
| `receipt_url` | `TEXT` | ✓ |  | Uploaded receipt image or PDF URL in S3/MinIO |
| `expense_date` | `DATE` | ✗ |  | Date the expense was incurred |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |

### `hr.salary_advances`

Salary advances to employees. Recovery automated across subsequent payroll runs.

🟡 **Status-machine record** — transitions enforced by CHECK constraints

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `employee_id` | `UUID` | ✗ | `FK` | Employee who received the advance |
| `request_date` | `DATE` | ✗ |  | Date advance was requested |
| `amount` | `NUMERIC(12,2)` | ✗ |  | Advance amount; CHECK > 0 |
| `reason` | `TEXT` | ✓ |  | Employee's stated reason |
| `recovery_months` | `SMALLINT` | ✗ |  | Payroll cycles over which to recover in equal instalments |
| `status` | `TEXT` | ✗ |  | State: `pending`, `approved`, `rejected`, or `settled` |
| `approved_by` | `UUID` | ✓ | `FK` | HR Manager who approved |
| `approved_at` | `TIMESTAMPTZ` | ✓ |  | UTC approval timestamp |
| `recovered_amount` | `NUMERIC(12,2)` | ✗ |  | Running total recovered so far; starts at 0 |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | Auto-updated by trigger |

---

## Schema: `brd` — Board & Corporate Governance

Manages all obligations of OK Footwear as a private limited company under Bangladesh Companies Act 1994: director register, register of members, board and AGM meetings, resolutions, dividends, and RJSC compliance.

### `brd.directors`

Statutory Register of Directors. Sensitive fields AES-256 encrypted. DIN is the RJSC Director Identification Number.

🔵 **Mutable master data** — supports update and soft delete

> **Note:** This IS the legal Register of Directors. Records must be retained permanently per Companies Act — never delete.

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `full_name` | `TEXT` | ✗ |  | Full legal name as on national ID |
| `father_name` | `TEXT` | ✓ |  | Father's name as required by RJSC forms |
| `din` | `TEXT` | ✓ | `UK` | Director Identification Number issued by RJSC; unique where set |
| `nid_encrypted` | `BYTEA` | ✓ |  | AES-256-GCM encrypted NID number |
| `passport_encrypted` | `BYTEA` | ✓ |  | AES-256-GCM encrypted passport for foreign directors |
| `date_of_birth` | `DATE` | ✓ |  | Required by RJSC registration |
| `nationality` | `TEXT` | ✗ |  | Typically `Bangladeshi` |
| `address` | `TEXT` | ✓ |  | Residential address as declared to RJSC |
| `email` | `TEXT` | ✓ |  | Contact email for board meeting notices |
| `phone` | `TEXT` | ✓ |  | Contact phone |
| `designation` | `TEXT` | ✗ |  | Board role: `chairman`, `managing_director`, `executive_director`, `independent_director`, `nominee_director`, or `non_executive_director` |
| `appointment_date` | `DATE` | ✗ |  | Date formally appointed; used for tenure calculation |
| `tenure_years` | `SMALLINT` | ✓ |  | Fixed term length; NULL for indefinite appointment |
| `resignation_date` | `DATE` | ✓ |  | Date of resignation or removal; NULL while active |
| `status` | `TEXT` | ✗ |  | State: `active`, `resigned`, `removed`, or `deceased` |
| `qualification_shares` | `INTEGER` | ✗ |  | Shares held as director qualification per Articles of Association |
| `employee_id` | `UUID` | ✓ | `FK` | Link to `hr.employees` if director is also salaried staff |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | Auto-updated by trigger |
| `created_by` | `UUID` | ✗ | `FK` | User who registered this director |

### `brd.shareholders`

Register of Members as required by Bangladesh Companies Act 1994, Section 31.

🔵 **Mutable master data** — supports update and soft delete

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `shareholder_type` | `TEXT` | ✗ |  | `individual` or `corporate` |
| `name` | `TEXT` | ✗ |  | Full legal name |
| `nid_or_reg` | `TEXT` | ✓ |  | NID for individuals; company registration number for corporates |
| `address` | `TEXT` | ✓ |  | Registered address |
| `email` | `TEXT` | ✓ |  | Contact email for dividend warrants and AGM notices |
| `phone` | `TEXT` | ✓ |  | Contact phone |
| `director_id` | `UUID` | ✓ | `FK` | If also a director: references `brd.directors` |
| `is_nominee` | `BOOLEAN` | ✗ |  | TRUE if holding on behalf of another party |
| `beneficial_owner` | `TEXT` | ✓ |  | Name of actual beneficial owner if nominee |
| `is_active` | `BOOLEAN` | ✗ |  | FALSE for shareholders who transferred all shares but must remain for history |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |

### `brd.share_transactions`

Append-only ledger of all share movements. `brd.current_shareholding` materialized view aggregates this for current holdings.

🔴 **Append-only ledger** — never UPDATE or DELETE; insert only

> **Note:** Never UPDATE or DELETE. The materialized view must be refreshed after each transaction batch.

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `txn_type` | `TEXT` | ✗ |  | Type: `allotment` (new shares), `transfer` (between shareholders), `buyback`, or `bonus` |
| `txn_date` | `DATE` | ✗ |  | Date of the transaction |
| `from_shareholder` | `UUID` | ✓ | `FK` | Transferring party; NULL for allotments and bonus |
| `to_shareholder` | `UUID` | ✗ | `FK` | Receiving party; references `brd.shareholders` |
| `shares` | `INTEGER` | ✗ |  | Shares involved; CHECK > 0 |
| `price_per_share` | `NUMERIC(12,4)` | ✓ |  | Price per share; NULL for bonus issues |
| `consideration` | `NUMERIC(14,2)` | ✓ |  | GENERATED: shares × price_per_share |
| `resolution_id` | `UUID` | ✓ | `FK` | Board resolution authorising this transaction |
| `approved_by` | `UUID` | ✗ | `FK` | User who recorded and authorised |
| `notes` | `TEXT` | ✓ |  | Additional notes on the transaction |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |

### `brd.share_certificates`

Physical or digital share certificates. Cancelled certificates retain their record.

🔵 **Mutable master data** — supports update and soft delete

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `cert_number` | `TEXT` | ✗ | `UK` | Unique serial number printed on the certificate |
| `shareholder_id` | `UUID` | ✗ | `FK` | Shareholder to whom issued |
| `shares` | `INTEGER` | ✗ |  | Shares this certificate represents; CHECK > 0 |
| `issue_date` | `DATE` | ✗ |  | Date certificate was issued |
| `cancelled_date` | `DATE` | ✓ |  | Date cancelled on transfer or buy-back; NULL if active |
| `status` | `TEXT` | ✗ |  | State: `active` or `cancelled` |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |

### `brd.board_meetings`

Board meeting records. Quorum validated against Articles of Association minimum. Minutes locked with eSign timestamp.

🟡 **Status-machine record** — transitions enforced by CHECK constraints

> **Note:** Minutes cannot be finalised if quorum was not met; in that case status = `inquorate`.

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `meeting_type` | `TEXT` | ✗ |  | `regular`, `special`, or `circular` (resolution by written consent) |
| `scheduled_at` | `TIMESTAMPTZ` | ✗ |  | UTC date and time of the meeting |
| `venue` | `TEXT` | ✓ |  | Physical venue; NULL for video-only meetings |
| `video_link` | `TEXT` | ✓ |  | Video conferencing link |
| `quorum_required` | `SMALLINT` | ✗ |  | Minimum directors for valid quorum per Articles of Association |
| `status` | `TEXT` | ✗ |  | State: `scheduled`, `held`, `adjourned`, `cancelled`, or `inquorate` |
| `minutes_signed` | `BOOLEAN` | ✗ |  | TRUE once Chairman has eSigned final minutes |
| `signed_at` | `TIMESTAMPTZ` | ✓ |  | UTC timestamp of Chairman's eSign |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | Auto-updated by trigger |
| `created_by` | `UUID` | ✗ | `FK` | Company Secretary who created the record |

### `brd.meeting_agenda`

Ordered agenda items for each board meeting.

🔵 **Mutable master data** — supports update and soft delete

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `meeting_id` | `UUID` | ✗ | `FK` | Parent meeting; CASCADE DELETE |
| `sequence` | `SMALLINT` | ✗ |  | Discussion order; UNIQUE per meeting |
| `title` | `TEXT` | ✗ |  | Short agenda item title shown in the notice |
| `description` | `TEXT` | ✓ |  | Detailed background note for directors |
| `presenter` | `TEXT` | ✓ |  | Person presenting this item |
| `time_minutes` | `SMALLINT` | ✓ |  | Allocated discussion time in minutes |

### `brd.meeting_attendees`

Director attendance at each meeting. Used to compute quorum and produce the attendance register in minutes.

🔵 **Mutable master data** — supports update and soft delete

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `meeting_id` | `UUID` | ✗ | `FK` | Meeting attended; UNIQUE per meeting-director |
| `director_id` | `UUID` | ✗ | `FK` | Director; references `brd.directors` |
| `attendance` | `TEXT` | ✗ |  | Mode: `present`, `video`, `absent`, or `leave_of_absence` |

### `brd.resolutions`

Immutable resolution register. SHA-256 hash provides tamper-evident archiving once signed.

🔴 **Append-only ledger** — never UPDATE or DELETE; insert only

> **Note:** Never UPDATE or DELETE. Certified copy generation reads from this table without modifying it.

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `resolution_number` | `TEXT` | ✗ | `UK` | Auto-generated, e.g. `RES-00042` |
| `meeting_id` | `UUID` | ✓ | `FK` | Meeting at which passed; NULL for circular resolutions |
| `agenda_id` | `UUID` | ✓ | `FK` | Agenda item this resolution relates to |
| `resolution_date` | `DATE` | ✗ |  | Date the resolution was passed |
| `resolution_type` | `TEXT` | ✗ |  | `ordinary`, `special` (75% majority), or `circular` |
| `category` | `TEXT` | ✗ |  | Business classification: `financial`, `appointment`, `policy`, `contract`, `regulatory`, `dividend`, `share`, or `other` |
| `title` | `TEXT` | ✗ |  | Short descriptive title |
| `resolution_text` | `TEXT` | ✗ |  | Full formal resolution text as passed |
| `votes_for` | `SMALLINT` | ✗ |  | Directors who voted in favour |
| `votes_against` | `SMALLINT` | ✗ |  | Directors who voted against |
| `votes_abstained` | `SMALLINT` | ✗ |  | Directors who abstained |
| `outcome` | `TEXT` | ✗ |  | Result: `passed`, `failed`, `deferred`, or `withdrawn` |
| `signed_at` | `TIMESTAMPTZ` | ✓ |  | UTC timestamp of Chairman's eSign |
| `sha256_hash` | `TEXT` | ✓ |  | SHA-256 hash of signed document for tamper-evident archiving |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `created_by` | `UUID` | ✗ | `FK` | Company Secretary who recorded this resolution |

### `brd.agms`

AGM and EGM header records. System auto-calculates next AGM due date (within 15 months of previous AGM per Companies Act 1994).

🟡 **Status-machine record** — transitions enforced by CHECK constraints

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `meeting_type` | `TEXT` | ✗ |  | `agm` or `egm` |
| `financial_year` | `SMALLINT` | ✗ |  | Financial year for which this AGM is held |
| `meeting_date` | `TIMESTAMPTZ` | ✗ |  | Scheduled date and time |
| `venue` | `TEXT` | ✓ |  | Physical meeting venue |
| `notice_sent_at` | `TIMESTAMPTZ` | ✓ |  | UTC when statutory notice sent to shareholders (minimum 14 days before meeting) |
| `status` | `TEXT` | ✗ |  | State: `scheduled`, `held`, `adjourned`, or `cancelled` |
| `minutes_url` | `TEXT` | ✓ |  | S3/MinIO URL of signed AGM minutes |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | ✗ |  | Auto-updated by trigger |
| `created_by` | `UUID` | ✗ | `FK` | Company Secretary who created the record |

### `brd.agm_proxies`

Proxy registrations for shareholders unable to attend AGM in person.

🔵 **Mutable master data** — supports update and soft delete

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `agm_id` | `UUID` | ✗ | `FK` | AGM registered for; UNIQUE per AGM-shareholder |
| `shareholder_id` | `UUID` | ✗ | `FK` | Shareholder granting the proxy |
| `proxy_holder` | `TEXT` | ✗ |  | Full name of the person authorised to vote as proxy |
| `shares_represented` | `INTEGER` | ✗ |  | Shares the proxy holder can vote |
| `proxy_date` | `DATE` | ✗ |  | Date the proxy form was executed |

### `brd.dividends`

Dividend declarations. System auto-computes each shareholder's entitlement from shares on record date.

🟡 **Status-machine record** — transitions enforced by CHECK constraints

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `financial_year` | `SMALLINT` | ✗ |  | Financial year for which declared |
| `dividend_type` | `TEXT` | ✗ |  | `interim` (board declared mid-year) or `final` (declared at AGM) |
| `declaration_date` | `DATE` | ✗ |  | Date formally declared |
| `record_date` | `DATE` | ✗ |  | Shareholders on register on this date are entitled |
| `payment_date` | `DATE` | ✗ |  | Date by which all payments must be made |
| `rate_per_share` | `NUMERIC(10,4)` | ✗ |  | Dividend amount per share in BDT |
| `total_dividend` | `NUMERIC(16,2)` | ✗ |  | Total gross: rate × total shares outstanding |
| `withholding_tax_pct` | `NUMERIC(5,2)` | ✗ |  | WHT rate per NBR; default 10% for resident shareholders |
| `status` | `TEXT` | ✗ |  | State: `declared`, `approved`, or `paid` |
| `resolution_id` | `UUID` | ✓ | `FK` | Resolution authorising the dividend |
| `gl_entry_id` | `UUID` | ✓ | `FK` | GL journal posting the dividend liability |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |
| `created_by` | `UUID` | ✗ | `FK` | User who recorded the declaration |

### `brd.dividend_payments`

Individual payments per shareholder per dividend. Withholding tax deducted before payment.

🔵 **Mutable master data** — supports update and soft delete

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `dividend_id` | `UUID` | ✗ | `FK` | Parent dividend; UNIQUE per dividend-shareholder |
| `shareholder_id` | `UUID` | ✗ | `FK` | Recipient shareholder |
| `shares_held` | `INTEGER` | ✗ |  | Shares held on the record date |
| `gross_amount` | `NUMERIC(12,2)` | ✗ |  | Gross dividend: shares_held × rate_per_share |
| `tax_deducted` | `NUMERIC(10,2)` | ✗ |  | WHT deducted: gross × withholding_tax_pct / 100 |
| `net_amount` | `NUMERIC(12,2)` | ✗ |  | Net paid: gross − tax_deducted |
| `payment_status` | `TEXT` | ✗ |  | State: `pending`, `paid`, or `unclaimed` |
| `paid_at` | `TIMESTAMPTZ` | ✓ |  | UTC payment timestamp |

### `brd.related_parties`

Register of related parties required by IAS 24. System alerts when transactions in other modules involve a registered related party.

🔵 **Mutable master data** — supports update and soft delete

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `id` | `UUID` | ✗ | `PK` | Surrogate primary key |
| `name` | `TEXT` | ✗ |  | Name of the related party |
| `relationship` | `TEXT` | ✗ |  | Nature: `director`, `director_relative`, `director_company`, `subsidiary` |
| `director_id` | `UUID` | ✓ | `FK` | Director to whom this party is connected |
| `entity_type` | `TEXT` | ✗ |  | `individual` or `company` |
| `notes` | `TEXT` | ✓ |  | Additional relationship context |
| `is_active` | `BOOLEAN` | ✗ |  | FALSE retires without deleting the record |
| `created_at` | `TIMESTAMPTZ` | ✗ |  | UTC creation timestamp |

---

## Materialized Views

Two materialized views aggregate expensive queries. Both must be refreshed by a scheduled job after batch operations.

### `brd.current_shareholding`

Aggregates all share transactions to compute current shares held and percentage ownership per shareholder. Refresh after every share transaction batch.

```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY brd.current_shareholding;
```

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `shareholder_id` | `UUID` | ✗ |  | Shareholder primary key |
| `name` | `TEXT` | ✗ |  | Shareholder name |
| `shareholder_type` | `TEXT` | ✗ |  | `individual` or `corporate` |
| `shares_held` | `BIGINT` | ✗ |  | Current shares: allotted + received transfers − sent transfers |
| `pct_held` | `NUMERIC(10,4)` | ✓ |  | Percentage of total issued capital; NULL if no allotments yet |

### `inv.stock_summary`

Cross-warehouse stock summary with total value and reorder flag per item. Refresh nightly and after large stock adjustments.

```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY inv.stock_summary;
```

| Field | Type | Nullable | Key | Description |
|---|---|---|---|---|
| `item_id` | `UUID` | ✗ |  | Stock item primary key |
| `item_code` | `TEXT` | ✗ |  | Item code |
| `name` | `TEXT` | ✗ |  | Item name |
| `category` | `TEXT` | ✗ |  | Item category |
| `uom` | `TEXT` | ✗ |  | Unit of measure |
| `reorder_level` | `NUMERIC(12,3)` | ✗ |  | Configured reorder level |
| `total_qty` | `NUMERIC(12,3)` | ✗ |  | Total quantity across all warehouses |
| `total_value` | `NUMERIC(16,4)` | ✗ |  | Total stock value: sum of (qty × avg_cost) across warehouses |
| `avg_unit_cost` | `NUMERIC(12,4)` | ✗ |  | Weighted average unit cost across all warehouses |
| `below_reorder` | `BOOLEAN` | ✗ |  | TRUE when total_qty ≤ reorder_level; drives the low-stock alert report |

---

## Functions & Triggers

### `sys.next_doc_number(p_seq TEXT) → TEXT`

Atomically increments the named sequence counter and returns the formatted document number. Uses row-level locking to prevent duplicates under concurrent requests.

**Parameters**
- `p_seq TEXT` — sequence name from `sys.document_sequences`, e.g. `'order'`, `'po'`

**Returns** — formatted string, e.g. `ORD-000042`

**Example**
```sql
SELECT sys.next_doc_number('order');   -- 'ORD-000001'
SELECT sys.next_doc_number('po');      -- 'PO-000001'
```

### `hr.compute_gratuity(p_employee_id UUID, p_exit_date DATE) → NUMERIC(14,2)`

Computes gratuity entitlement under Bangladesh Labour Act 2006. Formula: `Basic × (30/26) × Completed Years`. Fractional years: < 6 months ignored; ≥ 6 months rounds up to one full year. Returns 0 if service < 1 year.

**Parameters**
- `p_employee_id UUID` — employee to compute for
- `p_exit_date DATE` — exit or calculation date (defaults to `CURRENT_DATE`)

**Example**
```sql
SELECT hr.compute_gratuity('a1b2c3d4-...', '2026-03-31');  -- returns 45000.00
```

### `inv.update_stock_balance()` — Trigger function

Fired `AFTER INSERT` on `inv.stock_transactions`. Uses `INSERT ... ON CONFLICT DO UPDATE` (upsert) to maintain the running balance and weighted average cost in `inv.stock_balances`. Applied to all partition children automatically.


### `fin.check_period_open()` — Trigger function

Fired `BEFORE INSERT` on `fin.gl_entry_lines`. Raises `EXCEPTION` if the corresponding `fin.gl_periods.status = 'locked'`, preventing any posting to a locked period at the database level.


### `sys.set_updated_at()` — Trigger function

Fired `BEFORE UPDATE` on every table that has an `updated_at` column. Sets `NEW.updated_at = NOW()`. Applied to 34 tables across all schemas via individual `CREATE TRIGGER` statements.


---

## Index Reference

Naming convention: `idx_<table>_<column>` or `idx_<table>_<purpose>`. Partial indexes include a descriptive suffix.

| Index name | Table | Type | Purpose |
|---|---|---|---|
| `idx_users_email` | `sys.users` | UNIQUE partial | Fast login by email; excludes soft-deleted accounts |
| `idx_audit_table` | `sys.audit_logs` | Composite B-tree | Fetch all audit events for a specific table+record in time order |
| `idx_audit_user` | `sys.audit_logs` | Composite B-tree | All events performed by a specific user |
| `idx_audit_new_gin` | `sys.audit_logs` | GIN (JSONB) | Full-text search within audit `new_value` payload |
| `idx_notif_user` | `sys.notifications` | Composite B-tree | Fast unread badge count per user |
| `idx_buyers_name_trgm` | `ord.buyers` | GIN trigram | Fuzzy buyer name search for dropdowns |
| `idx_orders_buyer` | `ord.orders` | B-tree FK | All orders for a buyer |
| `idx_orders_article` | `ord.orders` | B-tree FK | All orders using an article |
| `idx_orders_status` | `ord.orders` | Partial B-tree | Active orders only (excludes delivered/cancelled) |
| `idx_orders_delivery` | `ord.orders` | Partial date | Milestone dashboard: active orders by delivery date |
| `idx_order_lines_order` | `ord.order_lines` | B-tree FK | Size breakdown for an order |
| `idx_samples_order` | `ord.samples` | B-tree FK | All sample rounds for an order |
| `idx_vendors_name_trgm` | `prc.vendors` | GIN trigram | Fuzzy vendor name search |
| `idx_po_vendor` | `prc.purchase_orders` | B-tree FK | All POs for a vendor |
| `idx_po_status` | `prc.purchase_orders` | Partial B-tree | Open POs only |
| `idx_po_lines_po` | `prc.po_lines` | B-tree FK | Lines of a purchase order |
| `idx_po_lines_item` | `prc.po_lines` | B-tree FK | All POs containing an item |
| `idx_grn_po` | `prc.goods_receipts` | B-tree FK | All GRNs against a PO |
| `idx_gr_lines_grn` | `prc.gr_lines` | B-tree FK | Lines of a GRN |
| `idx_vinv_vendor` | `prc.vendor_invoices` | B-tree FK | All invoices for a vendor |
| `idx_vinv_status` | `prc.vendor_invoices` | Partial B-tree | Open/partial invoices for AP aging |
| `idx_vinv_due` | `prc.vendor_invoices` | Partial date | Overdue AP invoice report |
| `idx_articles_desc_trgm` | `ord.articles` | GIN trigram | Fuzzy article description search |
| `idx_bom_article` | `mfg.bom_headers` | B-tree FK | All BOM versions for an article |
| `idx_bom_lines_bom` | `mfg.bom_lines` | B-tree FK | All lines of a BOM |
| `idx_bom_lines_item` | `mfg.bom_lines` | B-tree FK | All BOMs using an item |
| `idx_prod_orders_order` | `mfg.production_orders` | B-tree FK | Production orders for a sales order |
| `idx_daily_prod_order` | `mfg.daily_productions` | Composite B-tree | Daily entries for a production order in date order |
| `idx_qc_prod_order` | `mfg.qc_results` | B-tree FK | All QC results for a production order |
| `idx_scrap_prod_order` | `mfg.scrap_records` | B-tree FK | Scrap records for a production order |
| `idx_maint_machine` | `mfg.machine_maintenance` | Composite B-tree | Maintenance history for a machine in time order |
| `idx_items_name_trgm` | `inv.stock_items` | GIN trigram | Fuzzy stock item name search |
| `idx_stxn_item` | `inv.stock_transactions` | Composite B-tree | All transactions for an item in date order (partition-pruned) |
| `idx_stxn_wh` | `inv.stock_transactions` | Composite B-tree | Warehouse-specific stock movement history |
| `idx_stxn_src` | `inv.stock_transactions` | Composite B-tree | Transactions from a specific source module/document |
| `idx_gl_entries_period` | `fin.gl_entries` | Composite B-tree | All journals in a period by status |
| `idx_gl_entries_source` | `fin.gl_entries` | Composite B-tree | Find the GL journal created by a source document |
| `idx_gl_lines_account` | `fin.gl_entry_lines` | Composite B-tree | Account balance queries: account + date (partition-pruned) |
| `idx_gl_lines_entry` | `fin.gl_entry_lines` | B-tree FK | Lines of a journal entry |
| `idx_gl_lines_dept` | `fin.gl_entry_lines` | Composite B-tree | Department cost centre reports |
| `idx_fa_category` | `fin.fixed_assets` | B-tree FK | All assets in a category |
| `idx_fa_dept` | `fin.fixed_assets` | B-tree FK | Assets owned by a department |
| `idx_budget_lines_bgt` | `fin.budget_lines` | Composite B-tree | All lines of a budget by month |
| `idx_dc_order` | `fin.delivery_challans` | B-tree FK | All deliveries for an order |
| `idx_binv_buyer` | `fin.buyer_invoices` | B-tree FK | All invoices for a buyer |
| `idx_binv_status` | `fin.buyer_invoices` | Partial B-tree | Unpaid/partial invoices for AR aging |
| `idx_binv_due` | `fin.buyer_invoices` | Partial date | Overdue AR invoice report |
| `idx_emp_code` | `hr.employees` | UNIQUE partial | Fast employee lookup by code; excludes deleted |
| `idx_emp_dept` | `hr.employees` | Partial FK | Active employees in a department |
| `idx_emp_manager` | `hr.employees` | B-tree FK | Direct reports of a manager |
| `idx_emp_name_trgm` | `hr.employees` | GIN trigram | Fuzzy employee name search |
| `idx_emp_events` | `hr.employment_events` | Composite B-tree | Employment history per employee in date order |
| `idx_leave_bal_emp` | `hr.leave_balances` | Composite B-tree | All leave balances for an employee in a year |
| `idx_leave_req_emp` | `hr.leave_requests` | Composite B-tree | Leave requests per employee in date order |
| `idx_leave_req_status` | `hr.leave_requests` | Partial B-tree | Pending approvals queue |
| `idx_att_emp_date` | `hr.attendance_records` | UNIQUE composite | One attendance record per employee per date |
| `idx_att_date` | `hr.attendance_records` | B-tree | All attendance for a date (for daily summary reports) |
| `idx_emp_salary_current` | `hr.employee_salaries` | Partial B-tree | Current salary record per employee |
| `idx_payroll_entries_run` | `hr.payroll_entries` | B-tree FK | All entries in a payroll run |
| `idx_payroll_entries_emp` | `hr.payroll_entries` | B-tree FK | Payroll history for an employee |
| `idx_pf_acct_emp` | `hr.pf_accounts` | B-tree FK | PF account lookup by employee |
| `idx_pf_txn_acct` | `hr.pf_transactions` | Composite B-tree | PF transactions for an account in time order |
| `idx_gratuity_emp` | `hr.gratuity_provisions` | Composite B-tree | Gratuity history per employee in date order |
| `idx_share_txn_to` | `brd.share_transactions` | Composite B-tree | All share receipts for a shareholder in date order |
| `idx_meetings_status` | `brd.board_meetings` | Composite B-tree | Upcoming scheduled meetings |
| `idx_res_date` | `brd.resolutions` | B-tree | Resolution archive in date order |
| `idx_div_pmt_div` | `brd.dividend_payments` | B-tree FK | All payments for a dividend declaration |
| `idx_directors_name_trgm` | `brd.directors` | GIN trigram | Fuzzy director name search |
| `idx_shareholders_trgm` | `brd.shareholders` | GIN trigram | Fuzzy shareholder name search |

---

## Partitioned Tables

Six high-volume tables are partitioned by date `RANGE` to keep index sizes manageable and enable old-year archiving by partition detachment.

| Table | Partition key | Strategy | Pre-created | Recommended schedule |
|---|---|---|---|---|
| `sys.audit_logs` | `created_at` | RANGE yearly | 2025, 2026, 2027 | Create next year partition in November each year |
| `sys.notifications` | `created_at` | RANGE yearly | 2025, 2026 | Create next year partition in November each year |
| `inv.stock_transactions` | `txn_date` | RANGE yearly | 2025, 2026 | Create next year partition in November each year |
| `mfg.daily_productions` | `prod_date` | RANGE yearly | 2025, 2026 | Create next year partition in November each year |
| `hr.attendance_records` | `check_date` | RANGE yearly | 2025, 2026 | Create next year partition in November each year |
| `fin.gl_entry_lines` | `entry_date` | RANGE yearly | 2025, 2026, 2027 | Create next two years' partitions in November each year |

> **Warning:** If a partition does not exist when a row is inserted, PostgreSQL will raise an error. Automate partition creation with a scheduled job or use `CREATE TABLE IF NOT EXISTS ... PARTITION OF ...` in a monthly maintenance script.

---

## Data Retention Policies

| Data category | Tables | Minimum retention | Legal basis |
|---|---|---|---|
| Financial transactions | `fin.gl_entries`, `fin.gl_entry_lines` | 7 years | Bangladesh Income Tax Ordinance |
| Vendor invoices & purchase orders | `prc.vendor_invoices`, `prc.purchase_orders` | 7 years | NBR accounting records requirement |
| Payroll records | `hr.payroll_runs`, `hr.payroll_entries` | 7 years | Bangladesh Labour Act 2006 |
| Employee personal data (active) | `hr.employees`, `hr.employee_secrets` | Duration + 7 years post-exit | Labour Act; potential legal disputes |
| Employee personal data (exited, soft-deleted) | `hr.employees` | 7 years post-exit | GDPR-aligned; right-to-erasure applies after |
| Board minutes & resolutions | `brd.board_meetings`, `brd.resolutions` | **Permanent** | Bangladesh Companies Act 1994 |
| Register of Members | `brd.shareholders`, `brd.share_transactions` | **Permanent** | Companies Act — Register of Members is a permanent statutory record |
| Director register | `brd.directors`, `brd.employment_events` | **Permanent** | Companies Act — Register of Directors permanent |
| Import/export documents | `fin.import_lcs`, `fin.export_lcs` | 7 years | Bangladesh Customs Act; BB FX guidelines |
| Inventory transactions | `inv.stock_transactions` | 5 years | Operational compliance and audit trail |
| Audit logs | `sys.audit_logs` | 2 years minimum | Security and compliance best practice |
| Notifications | `sys.notifications` | 90 days | Operational; older rows can be archived or deleted |

---

## Quick Schema Reference — Table Count by Module

| Module | Schema | Tables | Key patterns used |
|---|---|---|---|
| System & Administration | `sys` | 8 | RBAC, append-only audit, partitioned notifications |
| Order Management | `ord` | 9 | Status-machine orders, sample gate, quotation conversion |
| Procurement | `prc` | 10 | Three-way match, approved vendor list, PO approval workflow |
| Manufacturing | `mfg` | 15 | BOM versioning, daily production partitioning, generated efficiency % |
| Inventory | `inv` | 8 | Append-only ledger, trigger-maintained running balance, weighted avg cost |
| Finance | `fin` | 19 | Double-entry GL, partitioned GL lines, generated columns, locked periods |
| HR & Payroll | `hr` | 26 | Effective-dated salary, partitioned attendance, Labour Act gratuity function |
| Board & Governance | `brd` | 13 | Append-only share ledger, SHA-256 resolution hash, materialized shareholding |

---

*OK Footwear ERP — PostgreSQL Schema Reference  |  Version 1.0  |  May 2025*

*For the complete DDL (CREATE TABLE statements, indexes, triggers, and seed data) see `OK_Footwear_ERP_Schema.sql`.*
