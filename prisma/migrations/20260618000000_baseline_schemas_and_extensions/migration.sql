-- =============================================================================
-- Baseline Migration: Extensions & Schemas
-- =============================================================================
-- OK Footwear ERP — PostgreSQL 16
-- Sprint 1: Infrastructure Setup
--
-- This migration must run BEFORE any table-creation migrations.
-- It is idempotent: every statement uses IF NOT EXISTS.
-- Run via: npx prisma migrate deploy (production) or prisma migrate dev (local)
--
-- Extensions:
--   uuid-ossp — UUID v4 generation (gen_random_uuid)
--   pgcrypto  — Cryptographic functions (used for key hashing, token generation)
--   pg_trgm   — Trigram-based fuzzy text search (autocomplete, name search)
--   btree_gin — GIN index on scalar types (composite inverted indexes)
--
-- Schemas (9 business domains):
--   sys  — System (users, roles, permissions, audit, document sequences)
--   auth — Authentication (refresh tokens, MFA, login audit)
--   ord  — Orders (buyers, orders, articles, quotations)
--   prc  — Procurement (vendors, purchase orders, GRN)
--   mfg  — Manufacturing (BOM, production orders, QC)
--   inv  — Inventory (warehouses, stock items, transactions)
--   fin  — Finance (chart of accounts, GL entries, bank accounts)
--   hr   — Human Resources (employees, payroll, leave, attendance)
--   brd  — Board Governance (directors, shareholders, meetings, resolutions, AGMs, dividends)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extensions
-- ---------------------------------------------------------------------------
-- Installed into the `public` schema (default for extensions in PostgreSQL).
-- All 9 business schemas can reference these extension functions without
-- schema-qualifying them, as `public` is always on the search_path.
--
-- Note: CREATE EXTENSION requires superuser or CREATEDB privilege.
-- If running in a managed cloud (RDS, Cloud SQL), the cloud provider may
-- pre-install these extensions; in that case IF NOT EXISTS is a no-op.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "uuid-ossp"
  WITH SCHEMA public;

CREATE EXTENSION IF NOT EXISTS "pgcrypto"
  WITH SCHEMA public;

CREATE EXTENSION IF NOT EXISTS "pg_trgm"
  WITH SCHEMA public;

CREATE EXTENSION IF NOT EXISTS "btree_gin"
  WITH SCHEMA public;

-- ---------------------------------------------------------------------------
-- 2. Business Schemas
-- ---------------------------------------------------------------------------
-- Each schema isolates a business domain. This enables:
--   - Logical separation of concerns at the database level
--   - Schema-level GRANT/REVOKE for least-privilege access
--   - Easier partial backups (pg_dump --schema)
--   - PgBouncer transaction mode compatibility (Prisma multiSchema)
--
-- Order: alphabetical, no dependency between schemas.
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS brd;
CREATE SCHEMA IF NOT EXISTS fin;
CREATE SCHEMA IF NOT EXISTS hr;
CREATE SCHEMA IF NOT EXISTS inv;
CREATE SCHEMA IF NOT EXISTS mfg;
CREATE SCHEMA IF NOT EXISTS ord;
CREATE SCHEMA IF NOT EXISTS prc;
CREATE SCHEMA IF NOT EXISTS sys;
