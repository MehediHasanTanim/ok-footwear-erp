-- =============================================================================
-- Sprint 2: sys.compliance_items — Compliance Register Table
-- =============================================================================
-- OK Footwear ERP — PostgreSQL 16
--
-- Stores licences, certifications, permits, and other regulatory compliance
-- items that have expiry dates. The nightly ComplianceService cron job queries
-- this table via the partial index to find items expiring within alert_days.
--
-- Prisma generates the base table (CREATE TABLE + FK). This migration adds
-- CHECK constraints and the partial index that Prisma cannot express.
--
-- Design decisions:
--   - status CHECK at DB level: prevents invalid states even if app logic has bugs
--   - Partial index WHERE status = 'valid': expired/renewed items are excluded
--     from the nightly scan, keeping the active set small and the query fast
--   - alert_days CHECK > 0: prevents configuration errors where alert_days=0
--     would cause alerts to fire on the expiry date itself (after it's too late)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. CHECK constraints (Prisma cannot express these)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_compliance_items_status'
      AND conrelid = 'sys.compliance_items'::regclass
  ) THEN
    ALTER TABLE sys.compliance_items
      ADD CONSTRAINT chk_compliance_items_status
      CHECK (status IN ('valid', 'expiring_soon', 'expired', 'renewed'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_compliance_items_alert_days'
      AND conrelid = 'sys.compliance_items'::regclass
  ) THEN
    ALTER TABLE sys.compliance_items
      ADD CONSTRAINT chk_compliance_items_alert_days
      CHECK (alert_days > 0);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Partial index — nightly cron query
-- ---------------------------------------------------------------------------
-- The nightly ComplianceService runs:
--   SELECT * FROM sys.compliance_items
--   WHERE status = 'valid'
--     AND expiry_date <= CURRENT_DATE + alert_days
--
-- This partial index covers only active (valid) items, which is a small
-- subset of all compliance items. Expired and renewed items are excluded
-- from the index, keeping it lean and the query fast.

CREATE INDEX IF NOT EXISTS idx_compliance_active_expiry
  ON sys.compliance_items (expiry_date, responsible_user_id)
  WHERE status = 'valid';

-- ---------------------------------------------------------------------------
-- 3. Comments
-- ---------------------------------------------------------------------------

COMMENT ON TABLE sys.compliance_items IS
  'Compliance register — licences, certifications, permits with expiry tracking. Nightly cron alerts on items expiring within alert_days.';

COMMENT ON COLUMN sys.compliance_items.alert_days IS
  'Days before expiry to start alerting. CHECK > 0 ensures we alert BEFORE expiry, not on the day.';

COMMENT ON COLUMN sys.compliance_items.status IS
  'valid | expiring_soon | expired | renewed. Set by nightly cron or manual renewal.';
