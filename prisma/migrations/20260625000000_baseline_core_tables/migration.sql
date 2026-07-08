-- =============================================================================
-- Baseline Core Tables: All Prisma Schema Tables
-- =============================================================================
-- OK Footwear ERP — PostgreSQL 16
--
-- This migration creates ALL tables defined in the Prisma schema that were
-- not created by earlier migrations (20260618000000 and 20260624000000).
--
-- Generated from: npx prisma migrate diff --from-empty --to-schema-datamodel
-- Excludes: CREATE SCHEMA (done in 20260618000000)
--           CREATE TABLE sys.document_sequences (done in 20260624000000)
--
-- All CREATE statements use IF NOT EXISTS for idempotency.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enums (PostgreSQL enum types for domain schemas)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "ord"."OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'IN_PRODUCTION', 'PARTIALLY_SHIPPED', 'SHIPPED', 'DELIVERED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "prc"."POStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "fin"."AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "brd"."DirectorDesignation" AS ENUM ('CHAIRMAN', 'MANAGING_DIRECTOR', 'EXECUTIVE_DIRECTOR', 'INDEPENDENT_DIRECTOR', 'NOMINEE_DIRECTOR', 'NON_EXECUTIVE_DIRECTOR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "brd"."DirectorStatus" AS ENUM ('ACTIVE', 'RESIGNED', 'REMOVED', 'DECEASED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "brd"."ShareholderType" AS ENUM ('INDIVIDUAL', 'CORPORATE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "brd"."ShareTxnType" AS ENUM ('ALLOTMENT', 'TRANSFER', 'BUYBACK', 'BONUS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "brd"."CertificateStatus" AS ENUM ('ACTIVE', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "brd"."MeetingType" AS ENUM ('REGULAR', 'SPECIAL', 'CIRCULAR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "brd"."MeetingStatus" AS ENUM ('SCHEDULED', 'HELD', 'ADJOURNED', 'CANCELLED', 'INQUORATE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "brd"."Attendance" AS ENUM ('PRESENT', 'VIDEO', 'ABSENT', 'LEAVE_OF_ABSENCE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "brd"."ResolutionType" AS ENUM ('ORDINARY', 'SPECIAL', 'CIRCULAR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "brd"."ResolutionCategory" AS ENUM ('FINANCIAL', 'APPOINTMENT', 'POLICY', 'CONTRACT', 'REGULATORY', 'DIVIDEND', 'SHARE', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "brd"."ResolutionOutcome" AS ENUM ('PASSED', 'FAILED', 'DEFERRED', 'WITHDRAWN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "brd"."AgmType" AS ENUM ('AGM', 'EGM');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "brd"."AgmStatus" AS ENUM ('SCHEDULED', 'HELD', 'ADJOURNED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "brd"."DividendType" AS ENUM ('INTERIM', 'FINAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "brd"."DividendStatus" AS ENUM ('DECLARED', 'APPROVED', 'PAID');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "brd"."DividendPaymentStatus" AS ENUM ('PENDING', 'PAID', 'UNCLAIMED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "brd"."RelatedPartyEntityType" AS ENUM ('INDIVIDUAL', 'COMPANY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Core Tables: sys schema
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "sys"."roles" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sys"."permissions" (
    "id" UUID NOT NULL,
    "module" VARCHAR(50) NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sys"."role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

CREATE TABLE IF NOT EXISTS "sys"."users" (
    "id" UUID NOT NULL,
    "employee_id" UUID,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "totp_secret_encrypted" TEXT,
    "failed_attempts" SMALLINT NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ,
    "first_name" VARCHAR(100) NOT NULL,
    "middle_name" VARCHAR(100),
    "last_name" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sys"."user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

CREATE TABLE IF NOT EXISTS "sys"."compliance_items" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(100),
    "expiry_date" DATE NOT NULL,
    "responsible_user_id" UUID,
    "alert_days" SMALLINT NOT NULL DEFAULT 30,
    "status" VARCHAR(20) NOT NULL DEFAULT 'valid',
    "document_url" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "compliance_items_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- 3. Core Tables: auth schema
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "auth"."refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "ip_inet" INET,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "auth"."login_attempts" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "ip_address" INET,
    "user_agent" TEXT,
    "success" BOOLEAN NOT NULL,
    "failure_reason" VARCHAR(255),
    "attempted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- 4. Domain Tables: ord schema
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "ord"."buyers" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "short_name" VARCHAR(50),
    "contact_person" VARCHAR(100),
    "email" VARCHAR(255),
    "phone" VARCHAR(30),
    "address" TEXT,
    "country" VARCHAR(100),
    "payment_terms" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "buyers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ord"."orders" (
    "id" UUID NOT NULL,
    "order_number" VARCHAR(20) NOT NULL,
    "buyer_id" UUID NOT NULL,
    "order_date" DATE NOT NULL,
    "delivery_date" DATE,
    "status" "ord"."OrderStatus" NOT NULL DEFAULT 'PENDING',
    "total_value" DECIMAL(15,2),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "remarks" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- 5. Domain Tables: prc schema
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "prc"."vendors" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "short_name" VARCHAR(50),
    "contact_person" VARCHAR(100),
    "email" VARCHAR(255),
    "phone" VARCHAR(30),
    "address" TEXT,
    "category" VARCHAR(50),
    "payment_terms" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "prc"."purchase_orders" (
    "id" UUID NOT NULL,
    "po_number" VARCHAR(20) NOT NULL,
    "vendor_id" UUID NOT NULL,
    "order_date" DATE NOT NULL,
    "expected_date" DATE,
    "status" "prc"."POStatus" NOT NULL DEFAULT 'DRAFT',
    "total_value" DECIMAL(15,2),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BDT',
    "remarks" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- 6. Domain Tables: mfg schema
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "mfg"."bom_headers" (
    "id" UUID NOT NULL,
    "bom_code" VARCHAR(50) NOT NULL,
    "article_code" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "effective_date" DATE,
    "expiry_date" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "bom_headers_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- 7. Domain Tables: inv schema
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "inv"."warehouses" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "location" VARCHAR(200),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "inv"."stock_items" (
    "id" UUID NOT NULL,
    "item_code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "category" VARCHAR(50),
    "unit_of_measure" VARCHAR(20) NOT NULL DEFAULT 'PCS',
    "reorder_level" DECIMAL(12,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "stock_items_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- 8. Domain Tables: fin schema
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "fin"."chart_of_accounts" (
    "id" UUID NOT NULL,
    "account_code" VARCHAR(20) NOT NULL,
    "account_name" VARCHAR(200) NOT NULL,
    "account_type" "fin"."AccountType" NOT NULL,
    "parent_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "chart_of_accounts_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- 9. Domain Tables: hr schema
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "hr"."employees" (
    "id" UUID NOT NULL,
    "employee_code" VARCHAR(20) NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "middle_name" VARCHAR(100),
    "last_name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(30),
    "department" VARCHAR(100),
    "designation" VARCHAR(100),
    "joining_date" DATE,
    "employment_type" VARCHAR(20),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- 10. Domain Tables: brd schema
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "brd"."directors" (
    "id" UUID NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "middle_name" VARCHAR(100),
    "last_name" VARCHAR(100) NOT NULL,
    "father_name" VARCHAR(200),
    "din" VARCHAR(50),
    "nid_encrypted" BYTEA,
    "passport_encrypted" BYTEA,
    "date_of_birth" DATE,
    "nationality" VARCHAR(100) NOT NULL DEFAULT 'Bangladeshi',
    "address" TEXT,
    "email" VARCHAR(255),
    "phone" VARCHAR(30),
    "designation" "brd"."DirectorDesignation" NOT NULL,
    "appointment_date" DATE NOT NULL,
    "tenure_years" INTEGER,
    "resignation_date" DATE,
    "status" "brd"."DirectorStatus" NOT NULL DEFAULT 'ACTIVE',
    "qualification_shares" INTEGER NOT NULL DEFAULT 0,
    "employee_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID NOT NULL,
    CONSTRAINT "directors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "brd"."shareholders" (
    "id" UUID NOT NULL,
    "shareholder_type" "brd"."ShareholderType" NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "nid_or_reg" VARCHAR(50),
    "address" TEXT,
    "email" VARCHAR(255),
    "phone" VARCHAR(30),
    "director_id" UUID,
    "is_nominee" BOOLEAN NOT NULL DEFAULT false,
    "beneficial_owner" VARCHAR(200),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shareholders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "brd"."share_transactions" (
    "id" UUID NOT NULL,
    "txn_type" "brd"."ShareTxnType" NOT NULL,
    "txn_date" DATE NOT NULL,
    "from_shareholder" UUID,
    "to_shareholder" UUID NOT NULL,
    "shares" INTEGER NOT NULL,
    "price_per_share" DECIMAL(12,4),
    "resolution_id" UUID,
    "approved_by" UUID NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "share_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "brd"."share_certificates" (
    "id" UUID NOT NULL,
    "cert_number" VARCHAR(50) NOT NULL,
    "shareholder_id" UUID NOT NULL,
    "shares" INTEGER NOT NULL,
    "issue_date" DATE NOT NULL,
    "cancelled_date" DATE,
    "status" "brd"."CertificateStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "share_certificates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "brd"."board_meetings" (
    "id" UUID NOT NULL,
    "meeting_type" "brd"."MeetingType" NOT NULL,
    "scheduled_at" TIMESTAMPTZ NOT NULL,
    "venue" VARCHAR(300),
    "video_link" VARCHAR(500),
    "quorum_required" INTEGER NOT NULL DEFAULT 2,
    "status" "brd"."MeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "minutes_signed" BOOLEAN NOT NULL DEFAULT false,
    "signed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID NOT NULL,
    CONSTRAINT "board_meetings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "brd"."meeting_agenda" (
    "id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT,
    "presenter" VARCHAR(100),
    "time_minutes" INTEGER,
    CONSTRAINT "meeting_agenda_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "brd"."meeting_attendees" (
    "id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "director_id" UUID NOT NULL,
    "attendance" "brd"."Attendance" NOT NULL DEFAULT 'PRESENT',
    CONSTRAINT "meeting_attendees_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "brd"."resolutions" (
    "id" UUID NOT NULL,
    "resolution_number" VARCHAR(20) NOT NULL,
    "meeting_id" UUID,
    "agenda_id" UUID,
    "resolution_date" DATE NOT NULL,
    "resolution_type" "brd"."ResolutionType" NOT NULL,
    "category" "brd"."ResolutionCategory" NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "resolution_text" TEXT NOT NULL,
    "votes_for" INTEGER NOT NULL DEFAULT 0,
    "votes_against" INTEGER NOT NULL DEFAULT 0,
    "votes_abstained" INTEGER NOT NULL DEFAULT 0,
    "outcome" "brd"."ResolutionOutcome" NOT NULL DEFAULT 'PASSED',
    "signed_at" TIMESTAMPTZ,
    "sha256_hash" VARCHAR(64),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    CONSTRAINT "resolutions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "brd"."agms" (
    "id" UUID NOT NULL,
    "meeting_type" "brd"."AgmType" NOT NULL,
    "financial_year" INTEGER NOT NULL,
    "meeting_date" TIMESTAMPTZ NOT NULL,
    "venue" VARCHAR(300),
    "notice_sent_at" TIMESTAMPTZ,
    "status" "brd"."AgmStatus" NOT NULL DEFAULT 'SCHEDULED',
    "minutes_url" VARCHAR(500),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID NOT NULL,
    CONSTRAINT "agms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "brd"."agm_proxies" (
    "id" UUID NOT NULL,
    "agm_id" UUID NOT NULL,
    "shareholder_id" UUID NOT NULL,
    "proxy_holder" VARCHAR(200) NOT NULL,
    "shares_represented" INTEGER NOT NULL,
    "proxy_date" DATE NOT NULL,
    CONSTRAINT "agm_proxies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "brd"."dividends" (
    "id" UUID NOT NULL,
    "financial_year" INTEGER NOT NULL,
    "dividend_type" "brd"."DividendType" NOT NULL,
    "declaration_date" DATE NOT NULL,
    "record_date" DATE NOT NULL,
    "payment_date" DATE NOT NULL,
    "rate_per_share" DECIMAL(10,4) NOT NULL,
    "total_dividend" DECIMAL(16,2) NOT NULL,
    "withholding_tax_pct" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "status" "brd"."DividendStatus" NOT NULL DEFAULT 'DECLARED',
    "resolution_id" UUID,
    "gl_entry_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    CONSTRAINT "dividends_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "brd"."dividend_payments" (
    "id" UUID NOT NULL,
    "dividend_id" UUID NOT NULL,
    "shareholder_id" UUID NOT NULL,
    "shares_held" INTEGER NOT NULL,
    "gross_amount" DECIMAL(12,2) NOT NULL,
    "tax_deducted" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(12,2) NOT NULL,
    "payment_status" "brd"."DividendPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paid_at" TIMESTAMPTZ,
    CONSTRAINT "dividend_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "brd"."related_parties" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "relationship" VARCHAR(100) NOT NULL,
    "director_id" UUID,
    "entity_type" "brd"."RelatedPartyEntityType" NOT NULL,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "related_parties_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- 11. Indexes
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS "roles_name_key" ON "sys"."roles"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "permissions_module_action_key" ON "sys"."permissions"("module", "action");
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "sys"."users"("email");
CREATE INDEX IF NOT EXISTS "compliance_items_expiry_date_responsible_user_id_idx" ON "sys"."compliance_items"("expiry_date", "responsible_user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "refresh_tokens_token_hash_key" ON "auth"."refresh_tokens"("token_hash");
CREATE INDEX IF NOT EXISTS "refresh_tokens_user_id_idx" ON "auth"."refresh_tokens"("user_id");
CREATE INDEX IF NOT EXISTS "refresh_tokens_token_hash_idx" ON "auth"."refresh_tokens"("token_hash");
CREATE INDEX IF NOT EXISTS "login_attempts_email_attempted_at_idx" ON "auth"."login_attempts"("email", "attempted_at");
CREATE UNIQUE INDEX IF NOT EXISTS "orders_order_number_key" ON "ord"."orders"("order_number");
CREATE INDEX IF NOT EXISTS "orders_buyer_id_idx" ON "ord"."orders"("buyer_id");
CREATE INDEX IF NOT EXISTS "orders_status_idx" ON "ord"."orders"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_orders_po_number_key" ON "prc"."purchase_orders"("po_number");
CREATE INDEX IF NOT EXISTS "purchase_orders_vendor_id_idx" ON "prc"."purchase_orders"("vendor_id");
CREATE INDEX IF NOT EXISTS "purchase_orders_status_idx" ON "prc"."purchase_orders"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "bom_headers_bom_code_key" ON "mfg"."bom_headers"("bom_code");
CREATE UNIQUE INDEX IF NOT EXISTS "warehouses_code_key" ON "inv"."warehouses"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "stock_items_item_code_key" ON "inv"."stock_items"("item_code");
CREATE UNIQUE INDEX IF NOT EXISTS "chart_of_accounts_account_code_key" ON "fin"."chart_of_accounts"("account_code");
CREATE INDEX IF NOT EXISTS "chart_of_accounts_parent_id_idx" ON "fin"."chart_of_accounts"("parent_id");
CREATE UNIQUE INDEX IF NOT EXISTS "employees_employee_code_key" ON "hr"."employees"("employee_code");
CREATE UNIQUE INDEX IF NOT EXISTS "directors_din_key" ON "brd"."directors"("din");
CREATE INDEX IF NOT EXISTS "share_transactions_to_shareholder_txn_date_idx" ON "brd"."share_transactions"("to_shareholder", "txn_date" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "share_certificates_cert_number_key" ON "brd"."share_certificates"("cert_number");
CREATE UNIQUE INDEX IF NOT EXISTS "meeting_agenda_meeting_id_sequence_key" ON "brd"."meeting_agenda"("meeting_id", "sequence");
CREATE UNIQUE INDEX IF NOT EXISTS "meeting_attendees_meeting_id_director_id_key" ON "brd"."meeting_attendees"("meeting_id", "director_id");
CREATE UNIQUE INDEX IF NOT EXISTS "resolutions_resolution_number_key" ON "brd"."resolutions"("resolution_number");
CREATE UNIQUE INDEX IF NOT EXISTS "agm_proxies_agm_id_shareholder_id_key" ON "brd"."agm_proxies"("agm_id", "shareholder_id");
CREATE UNIQUE INDEX IF NOT EXISTS "dividend_payments_dividend_id_shareholder_id_key" ON "brd"."dividend_payments"("dividend_id", "shareholder_id");

-- ---------------------------------------------------------------------------
-- 12. Foreign Keys (DO blocks — ALTER TABLE ADD CONSTRAINT does not support IF NOT EXISTS)
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  ALTER TABLE "sys"."role_permissions"
    ADD CONSTRAINT "role_permissions_role_id_fkey"
    FOREIGN KEY ("role_id") REFERENCES "sys"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "sys"."role_permissions"
    ADD CONSTRAINT "role_permissions_permission_id_fkey"
    FOREIGN KEY ("permission_id") REFERENCES "sys"."permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "sys"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "sys"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "sys"."user_roles"
    ADD CONSTRAINT "user_roles_role_id_fkey"
    FOREIGN KEY ("role_id") REFERENCES "sys"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "sys"."compliance_items"
    ADD CONSTRAINT "compliance_items_responsible_user_id_fkey"
    FOREIGN KEY ("responsible_user_id") REFERENCES "sys"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "auth"."refresh_tokens"
    ADD CONSTRAINT "refresh_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "sys"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ord"."orders"
    ADD CONSTRAINT "orders_buyer_id_fkey"
    FOREIGN KEY ("buyer_id") REFERENCES "ord"."buyers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "prc"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "prc"."vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "fin"."chart_of_accounts"
    ADD CONSTRAINT "chart_of_accounts_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "fin"."chart_of_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "brd"."shareholders"
    ADD CONSTRAINT "shareholders_director_id_fkey"
    FOREIGN KEY ("director_id") REFERENCES "brd"."directors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "brd"."share_transactions"
    ADD CONSTRAINT "share_transactions_from_shareholder_fkey"
    FOREIGN KEY ("from_shareholder") REFERENCES "brd"."shareholders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "brd"."share_transactions"
    ADD CONSTRAINT "share_transactions_to_shareholder_fkey"
    FOREIGN KEY ("to_shareholder") REFERENCES "brd"."shareholders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "brd"."share_certificates"
    ADD CONSTRAINT "share_certificates_shareholder_id_fkey"
    FOREIGN KEY ("shareholder_id") REFERENCES "brd"."shareholders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "brd"."meeting_agenda"
    ADD CONSTRAINT "meeting_agenda_meeting_id_fkey"
    FOREIGN KEY ("meeting_id") REFERENCES "brd"."board_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "brd"."meeting_attendees"
    ADD CONSTRAINT "meeting_attendees_meeting_id_fkey"
    FOREIGN KEY ("meeting_id") REFERENCES "brd"."board_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "brd"."meeting_attendees"
    ADD CONSTRAINT "meeting_attendees_director_id_fkey"
    FOREIGN KEY ("director_id") REFERENCES "brd"."directors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "brd"."resolutions"
    ADD CONSTRAINT "resolutions_meeting_id_fkey"
    FOREIGN KEY ("meeting_id") REFERENCES "brd"."board_meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "brd"."resolutions"
    ADD CONSTRAINT "resolutions_agenda_id_fkey"
    FOREIGN KEY ("agenda_id") REFERENCES "brd"."meeting_agenda"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "brd"."agm_proxies"
    ADD CONSTRAINT "agm_proxies_agm_id_fkey"
    FOREIGN KEY ("agm_id") REFERENCES "brd"."agms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "brd"."agm_proxies"
    ADD CONSTRAINT "agm_proxies_shareholder_id_fkey"
    FOREIGN KEY ("shareholder_id") REFERENCES "brd"."shareholders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "brd"."dividends"
    ADD CONSTRAINT "dividends_resolution_id_fkey"
    FOREIGN KEY ("resolution_id") REFERENCES "brd"."resolutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "brd"."dividend_payments"
    ADD CONSTRAINT "dividend_payments_dividend_id_fkey"
    FOREIGN KEY ("dividend_id") REFERENCES "brd"."dividends"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "brd"."dividend_payments"
    ADD CONSTRAINT "dividend_payments_shareholder_id_fkey"
    FOREIGN KEY ("shareholder_id") REFERENCES "brd"."shareholders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "brd"."related_parties"
    ADD CONSTRAINT "related_parties_director_id_fkey"
    FOREIGN KEY ("director_id") REFERENCES "brd"."directors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;
