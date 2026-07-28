// =============================================================================
// NotificationsService — $queryRaw-based notification operations
// =============================================================================
// OK Footwear ERP — Sprint 2, System Module
//
// All operations use $queryRawUnsafe because sys.notifications is a
// PostgreSQL partitioned table (PARTITION BY RANGE on created_at).
// Prisma v5 cannot model partitioned tables.
//
// The partial index idx_notif_{year}_user_unread on (user_id, created_at DESC)
// WHERE is_read = false enables O(1) badge count queries and fast SSE
// initial loads regardless of total notification volume.
// =============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { SSEService } from './sse.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateNotificationDto {
  userId: string;
  title: string;
  body: string;
  type: string;
  referenceId?: string | null;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: string;
  reference_id: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sseService: SSEService,
  ) {}

  /**
   * Insert a single notification and push to SSE.
   */
  async create(dto: CreateNotificationDto): Promise<string> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO sys.notifications (user_id, title, body, type, reference_id)
       VALUES ($1::uuid, $2, $3, $4, $5)
       RETURNING id`,
      dto.userId,
      dto.title,
      dto.body,
      dto.type,
      dto.referenceId ?? null,
    );

    const id = rows[0]!.id;

    // Push to SSE for real-time delivery
    this.sseService.emit(dto.userId, {
      id,
      userId: dto.userId,
      title: dto.title,
      body: dto.body,
      type: dto.type,
      referenceId: dto.referenceId ?? null,
      isRead: false,
    });

    this.logger.debug(`Notification ${id} created for user ${dto.userId}`);
    return id;
  }

  /**
   * Mark a notification as read.
   *
   * Sets read_at = NOW() and is_read = true atomically.
   * Returns the updated row count (0 if not found or already read).
   */
  async markRead(notificationId: string): Promise<number> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ updated: bigint }>>(
      `UPDATE sys.notifications
       SET is_read = true, read_at = NOW()
       WHERE id = $1::uuid AND is_read = false
       RETURNING 1 as updated`,
      notificationId,
    );

    return rows.length;
  }

  /**
   * Get unread notification count for a user.
   *
   * Uses the partial index WHERE is_read = false for O(1) performance.
   * This is the badge count query — called on every page load.
   */
  async getUnreadCount(userId: string): Promise<number> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) as count
       FROM sys.notifications
       WHERE user_id = $1::uuid AND is_read = false`,
      userId,
    );

    return Number(rows[0]!.count);
  }

  /**
   * Get unread notifications for a user (newest first).
   *
   * Used by the SSE stream and the notification dropdown initial load.
   * The partial index covers this query completely — no Seq Scan.
   */
  async getUnread(
    userId: string,
    limit: number = 50,
  ): Promise<NotificationRow[]> {
    return this.prisma.$queryRawUnsafe<NotificationRow[]>(
      `SELECT id, user_id, title, body, type, reference_id,
              is_read, read_at, created_at
       FROM sys.notifications
       WHERE user_id = $1::uuid AND is_read = false
       ORDER BY created_at DESC
       LIMIT $2`,
      userId,
      limit,
    );
  }

  /**
   * Get paginated notification history for a user.
   *
   * Returns both read and unread, newest first.
   */
  async getHistory(
    userId: string,
    limit: number = 20,
    offset: number = 0,
  ): Promise<{ rows: NotificationRow[]; total: number }> {
    const [rows, countResult] = await Promise.all([
      this.prisma.$queryRawUnsafe<NotificationRow[]>(
        `SELECT id, user_id, title, body, type, reference_id,
                is_read, read_at, created_at
         FROM sys.notifications
         WHERE user_id = $1::uuid
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        userId,
        limit,
        offset,
      ),
      this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*) as count
         FROM sys.notifications
         WHERE user_id = $1::uuid`,
        userId,
      ),
    ]);

    return {
      rows,
      total: Number(countResult[0]!.count),
    };
  }

  /**
   * Mark all notifications as read for a user.
   *
   * Bulk update — uses the partial index to find unread rows efficiently.
   */
  async markAllRead(userId: string): Promise<number> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ updated: bigint }>>(
      `UPDATE sys.notifications
       SET is_read = true, read_at = NOW()
       WHERE user_id = $1::uuid AND is_read = false
       RETURNING 1 as updated`,
      userId,
    );

    return rows.length;
  }

  /**
   * Notify all users with a specific role (by role name).
   *
   * Queries sys.user_roles → sys.roles to find all users with the given
   * role name, then calls create() for each. Used by ComplaintsService
   * for high/critical severity escalation.
   *
   * This is synchronous (not queued) — the business requirement is that
   * management is notified in the same request cycle.
   *
   * @param roleName Role name to notify (e.g., 'management')
   * @param title    Notification title
   * @param body     Notification body
   * @param type     Notification type (e.g., 'complaint.escalated')
   * @param referenceId Optional reference (e.g., complaint ID)
   */
  async notifyRole(
    roleName: string,
    title: string,
    body: string,
    type: string,
    referenceId?: string,
  ): Promise<void> {
    const users = await this.prisma.$queryRawUnsafe<Array<{ user_id: string }>>(
      `SELECT ur.user_id
       FROM sys.user_roles ur
       JOIN sys.roles r ON r.id = ur.role_id
       WHERE r.name = $1`,
      roleName,
    );

    if (users.length === 0) {
      this.logger.warn(`No users found for role '${roleName}' — notification skipped`);
      return;
    }

    // Create notifications for all users with this role
    for (const user of users) {
      try {
        await this.create({
          userId: user.user_id,
          title,
          body,
          type,
          referenceId: referenceId ?? null,
        });
      } catch (err) {
        // Single-user failure must not block other users
        this.logger.error(
          `Failed to notify user ${user.user_id} for role '${roleName}'`,
          (err as Error).message,
        );
      }
    }

    this.logger.log(
      `Notified ${users.length} users with role '${roleName}' (type: ${type})`,
    );
  }
}
