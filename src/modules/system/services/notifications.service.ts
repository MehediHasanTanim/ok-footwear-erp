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
}
