-- =============================================================================
-- Sprint 2: sys Core Tables — Auth & RBAC Columns
-- =============================================================================
-- OK Footwear ERP — PostgreSQL 16
--
-- Adds columns to support authentication hardening (Sprint 2):
--   - Account lockout: failed_attempts counter + locked_until timestamp
--   - TOTP 2FA: totp_secret_encrypted (AES-256-GCM encrypted at app layer)
--   - HR link: employee_id FK → hr.employees (nullable, set on employee link)
--   - Refresh token audit: ip_inet + user_agent for session tracking
--
-- All statements are idempotent (IF NOT EXISTS / IF EXISTS).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. sys.users — Auth hardening columns
-- ---------------------------------------------------------------------------

-- employee_id: FK to hr.employees. Created as a plain UUID column for now;
-- the FK constraint will be added in Sprint 12 when hr.employees is created.
ALTER TABLE sys.users
  ADD COLUMN IF NOT EXISTS employee_id UUID;

-- totp_secret_encrypted: AES-256-GCM encrypted TOTP secret.
-- NULL when 2FA is not enabled. Decrypted only during 2FA verification.
ALTER TABLE sys.users
  ADD COLUMN IF NOT EXISTS totp_secret_encrypted TEXT;

-- failed_attempts: incremented on each failed login.
-- CHECK ensures it never goes negative (defensive guard against integer underflow bugs).
ALTER TABLE sys.users
  ADD COLUMN IF NOT EXISTS failed_attempts SMALLINT NOT NULL DEFAULT 0;

-- Lockout enforcement: NULL = not locked. Non-NULL = locked until this timestamp.
-- Set to NOW() + lockout_duration after N consecutive failures (default: 5).
ALTER TABLE sys.users
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

-- Add CHECK constraint for failed_attempts >= 0
-- Use DO block with IF NOT EXISTS pattern (PostgreSQL has no ADD CONSTRAINT IF NOT EXISTS for CHECK)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_users_failed_attempts_non_negative'
      AND conrelid = 'sys.users'::regclass
  ) THEN
    ALTER TABLE sys.users
      ADD CONSTRAINT chk_users_failed_attempts_non_negative
      CHECK (failed_attempts >= 0);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. auth.refresh_tokens — Session audit columns
-- ---------------------------------------------------------------------------

-- ip_inet: IP address of the client that received this refresh token.
-- Stored as PostgreSQL INET type for efficient CIDR queries.
ALTER TABLE auth.refresh_tokens
  ADD COLUMN IF NOT EXISTS ip_inet INET;

-- user_agent: Browser/client User-Agent string.
-- Used for session management (e.g., "You're logged in from Chrome on Windows").
ALTER TABLE auth.refresh_tokens
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- ---------------------------------------------------------------------------
-- 3. Indexes (idempotent)
-- ---------------------------------------------------------------------------

-- Speed up account-lockout queries: WHERE locked_until > NOW() AND is_active = true
CREATE INDEX IF NOT EXISTS idx_users_locked_active
  ON sys.users (locked_until, is_active)
  WHERE locked_until IS NOT NULL AND is_active = true;

-- Speed up failed-attempt reset (scheduled job clears old attempts)
CREATE INDEX IF NOT EXISTS idx_users_failed_attempts
  ON sys.users (failed_attempts)
  WHERE failed_attempts > 0;

-- Speed up "my active sessions" query
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_active
  ON auth.refresh_tokens (user_id, revoked_at)
  WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4. Comments — Document design decisions
-- ---------------------------------------------------------------------------

COMMENT ON COLUMN sys.users.employee_id IS
  'FK to hr.employees. NULL for system accounts and users not yet linked to an employee record. FK constraint deferred to Sprint 12.';

COMMENT ON COLUMN sys.users.totp_secret_encrypted IS
  'AES-256-GCM encrypted TOTP secret. NULL = 2FA not enabled. Decrypted only during verification — never exposed in API responses.';

COMMENT ON COLUMN sys.users.failed_attempts IS
  'Incremented on failed login. Reset to 0 on successful login. CHECK >= 0.';

COMMENT ON COLUMN sys.users.locked_until IS
  'NULL = not locked. Set to NOW() + 30 minutes after 5 consecutive failures. Login rejected while NOW() < locked_until.';

COMMENT ON COLUMN auth.refresh_tokens.ip_inet IS
  'Client IP address at token issuance. Used for session audit and anomaly detection.';

COMMENT ON COLUMN auth.refresh_tokens.user_agent IS
  'Client User-Agent string at token issuance. Used for session management display.';
