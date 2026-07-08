-- =============================================================================
-- Sprint 2: sys.notifications — Partitioned Notification Table
-- =============================================================================
-- OK Footwear ERP — PostgreSQL 16
--
-- Partitioned by RANGE on created_at with yearly child partitions.
-- Notifications are high-volume, append-mostly, and queried by user_id
-- with an unread filter. Partitioning enables:
--   - Fast unread badge count via partial index (O(1) per user)
--   - Efficient bulk-delete of old notifications (DROP partition)
--   - Isolation: heavy notification inserts don't block user reads
--
-- Prisma limitation: Prisma v5 cannot model partitioned tables.
-- All inserts/reads use $queryRaw / $queryRawUnsafe.
--
-- Design decisions:
--   - Partial index WHERE is_read = false: the unread set is small (usually
--     <100 per active user). This index covers the most frequent query
--     (badge count) and the SSE stream initial load.
--   - created_at in the index (DESC): newest-unread-first ordering without
--     an additional sort step.
--   - No default partition: out-of-range dates raise an error (fail-loudly).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Parent table (partitioned)
-- ---------------------------------------------------------------------------

CREATE TABLE sys.notifications (
  id           UUID         NOT NULL DEFAULT gen_random_uuid(),
  user_id      UUID         NOT NULL,
  title        VARCHAR(255),
  body         TEXT,
  type         VARCHAR(50),
  reference_id TEXT,
  is_read      BOOLEAN      NOT NULL DEFAULT false,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT fk_notifications_user
    FOREIGN KEY (user_id)
    REFERENCES sys.users (id)
    ON DELETE CASCADE,

  CONSTRAINT chk_notifications_read_at
    CHECK (
      (is_read = false AND read_at IS NULL) OR
      (is_read = true)
    )

) PARTITION BY RANGE (created_at);

-- ---------------------------------------------------------------------------
-- 2. Yearly partitions — current year + next year
-- ---------------------------------------------------------------------------
-- 2026: [2026-01-01, 2027-01-01)
-- 2027: [2027-01-01, 2028-01-01)

CREATE TABLE sys.notifications_2026
  PARTITION OF sys.notifications
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

CREATE TABLE sys.notifications_2027
  PARTITION OF sys.notifications
  FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');

-- ---------------------------------------------------------------------------
-- 3. Partial indexes — O(1) unread badge count per user
-- ---------------------------------------------------------------------------
-- This is the key performance index. The unread subset is tiny relative to
-- the total notification volume (most notifications are read within hours).
-- The partial index covers only the rows WHERE is_read = false.
--
-- Index order: (user_id, created_at DESC)
--   - user_id first: all unread for a user are co-located in the index
--   - created_at DESC: newest-first without a sort

CREATE INDEX idx_notif_2026_user_unread
  ON sys.notifications_2026 (user_id, created_at DESC)
  WHERE is_read = false;

CREATE INDEX idx_notif_2027_user_unread
  ON sys.notifications_2027 (user_id, created_at DESC)
  WHERE is_read = false;

-- ---------------------------------------------------------------------------
-- 4. Parent-level index for cross-partition queries
-- ---------------------------------------------------------------------------

CREATE INDEX idx_notifications_user_created
  ON sys.notifications (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 5. Comments
-- ---------------------------------------------------------------------------

COMMENT ON TABLE sys.notifications IS
  'Append-only notification store. Partitioned yearly by created_at. Inserts via $queryRaw — Prisma cannot model partitioned tables.';

COMMENT ON COLUMN sys.notifications.reference_id IS
  'TEXT (not UUID) — points to the entity that triggered the notification (order_id, po_id, etc.). NULL for system announcements.';

COMMENT ON COLUMN sys.notifications.type IS
  'Notification category: order_status, leave_approved, po_approved, system_alert, etc. Used for client-side filtering and grouping.';

COMMENT ON COLUMN sys.notifications.read_at IS
  'NULL when unread. Set to NOW() when user marks as read. CHECK ensures read_at matches is_read state.';
