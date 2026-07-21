// =============================================================================
// ComplianceService — CRUD + Nightly Expiry Cron
// =============================================================================
// OK Footwear ERP — Sprint 2, System Module
//
// Nightly cron at 02:00 Asia/Dhaka:
//   1. Acquire Redis distributed lock compliance:nightly:lock
//   2. Query partial index: WHERE status='valid' AND expiry_date <= today + alert_days
//   3. Update statuses: expired / expiring_soon
//   4. Enqueue email jobs via BullMQ email-queue
//   5. Write audit log for each status change
//   6. Release lock
// =============================================================================

import {
  Injectable,
  Logger,
  Inject,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { PrismaService } from '@shared/database/prisma.service';
import { AuditService } from './audit.service';
import { CorrelationStore } from '@shared/logger/correlation-store';
import { REDIS_AUTH } from '@infrastructure/redis/redis.constants';
import { EMAIL_QUEUE } from '@infrastructure/queue/queue.constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateComplianceDto {
  name: string;
  description?: string;
  category?: string;
  expiryDate: Date;
  responsibleUserId?: string;
  alertDays?: number;
  documentUrl?: string;
}

export interface UpdateComplianceDto {
  name?: string;
  description?: string;
  category?: string;
  expiryDate?: Date;
  responsibleUserId?: string | null;
  alertDays?: number;
  status?: string;
  documentUrl?: string;
}

interface ComplianceItem {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  expiry_date: string;
  responsible_user_id: string | null;
  alert_days: number;
  status: string;
  document_url: string | null;
  created_at: string;
  updated_at: string;
}

interface UserEmail {
  email: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  /** Redis lock key for the nightly cron job. */
  private static readonly LOCK_KEY = 'compliance:nightly:lock';

  /** Lock TTL in seconds (prevents deadlock if pod crashes mid-job). */
  private static readonly LOCK_TTL = 120; // 2 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Inject(REDIS_AUTH) private readonly redis: Redis,
    @InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue,
  ) {}

  // =========================================================================
  // CRUD
  // =========================================================================

  async findAll() {
    return this.prisma.$queryRawUnsafe<ComplianceItem[]>(
      `SELECT id, name, description, category, expiry_date::text AS expiry_date,
              responsible_user_id, alert_days, status, document_url,
              created_at::text AS created_at, updated_at::text AS updated_at
       FROM sys.compliance_items
       ORDER BY expiry_date ASC`,
    );
  }

  async findOne(id: string) {
    const rows = await this.prisma.$queryRawUnsafe<ComplianceItem[]>(
      `SELECT id, name, description, category, expiry_date::text AS expiry_date,
              responsible_user_id, alert_days, status, document_url,
              created_at::text AS created_at, updated_at::text AS updated_at
       FROM sys.compliance_items
       WHERE id = $1::uuid`,
      id,
    );
    return rows[0] ?? null;
  }

  async create(dto: CreateComplianceDto) {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO sys.compliance_items (id, name, description, category, expiry_date, responsible_user_id, alert_days, document_url, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::uuid, $6, $7, NOW())
       RETURNING id`,
      dto.name, dto.description ?? null, dto.category ?? null,
      dto.expiryDate, dto.responsibleUserId ?? null,
      dto.alertDays ?? 30, dto.documentUrl ?? null,
    );
    return this.findOne(rows[0]!.id);
  }

  async update(id: string, dto: UpdateComplianceDto) {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (dto.name !== undefined) { sets.push(`name = $${idx++}`); params.push(dto.name); }
    if (dto.description !== undefined) { sets.push(`description = $${idx++}`); params.push(dto.description); }
    if (dto.category !== undefined) { sets.push(`category = $${idx++}`); params.push(dto.category); }
    if (dto.expiryDate !== undefined) { sets.push(`expiry_date = $${idx++}`); params.push(dto.expiryDate); }
    if (dto.responsibleUserId !== undefined) { sets.push(`responsible_user_id = $${idx++}::uuid`); params.push(dto.responsibleUserId); }
    if (dto.alertDays !== undefined) { sets.push(`alert_days = $${idx++}`); params.push(dto.alertDays); }
    if (dto.status !== undefined) { sets.push(`status = $${idx++}`); params.push(dto.status); }
    if (dto.documentUrl !== undefined) { sets.push(`document_url = $${idx++}`); params.push(dto.documentUrl); }

    if (sets.length === 0) return this.findOne(id);

    sets.push(`updated_at = NOW()`);
    params.push(id);

    await this.prisma.$executeRawUnsafe(
      `UPDATE sys.compliance_items SET ${sets.join(', ')} WHERE id = $${idx}::uuid`,
      ...params,
    );

    return this.findOne(id);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM sys.compliance_items WHERE id = $1::uuid`,
      id,
    );
  }

  // =========================================================================
  // Nightly Cron — 02:00 Asia/Dhaka
  // Wire externally via setInterval or k8s CronJob.
  async nightlyCheck(): Promise<void> {
    this.logger.log('Starting nightly compliance check');

    // -------------------------------------------------------------------
    // 1. Acquire distributed Redis lock
    // -------------------------------------------------------------------
    const acquired = await this.redis.set(
      ComplianceService.LOCK_KEY,
      process.pid.toString(),
      'EX',
      ComplianceService.LOCK_TTL,
      'NX',
    );

    if (!acquired) {
      this.logger.warn('Compliance nightly job skipped — another instance is running');
      return;
    }

    try {
      // -------------------------------------------------------------------
      // 2. Query using partial index WHERE status = 'valid'
      // -------------------------------------------------------------------
      const items = await this.prisma.$queryRawUnsafe<ComplianceItem[]>(
        `SELECT id, name, description, category, expiry_date::text AS expiry_date,
                responsible_user_id, alert_days, status, document_url,
                created_at::text AS created_at, updated_at::text AS updated_at
         FROM sys.compliance_items
         WHERE status = 'valid'
           AND expiry_date <= CURRENT_DATE + alert_days`,
      );

      if (items.length === 0) {
        this.logger.log('No compliance items expiring');
        return;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const expired: ComplianceItem[] = [];
      const expiringSoon: ComplianceItem[] = [];

      for (const item of items) {
        const expiryDate = new Date(item.expiry_date);
        const daysRemaining = Math.ceil(
          (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (expiryDate < today) {
          expired.push(item);
        } else if (daysRemaining <= item.alert_days) {
          expiringSoon.push(item);
        }
      }

      // -------------------------------------------------------------------
      // 3. Batch UPDATE statuses
      // -------------------------------------------------------------------
      if (expired.length > 0) {
        const ids = expired.map((i) => i.id);
        await this.prisma.$executeRawUnsafe(
          `UPDATE sys.compliance_items SET status = 'expired', updated_at = NOW()
           WHERE id = ANY($1::uuid[])`,
          ids,
        );
        this.logger.log(`Marked ${expired.length} item(s) as expired`);
      }

      if (expiringSoon.length > 0) {
        const ids = expiringSoon.map((i) => i.id);
        await this.prisma.$executeRawUnsafe(
          `UPDATE sys.compliance_items SET status = 'expiring_soon', updated_at = NOW()
           WHERE id = ANY($1::uuid[])`,
          ids,
        );
        this.logger.log(`Marked ${expiringSoon.length} item(s) as expiring_soon`);
      }

      // -------------------------------------------------------------------
      // 4. Enqueue email jobs + audit log
      // -------------------------------------------------------------------
      for (const item of [...expired, ...expiringSoon]) {
        // Email: fetch responsible user email
        if (item.responsible_user_id) {
          const userRows = await this.prisma.$queryRawUnsafe<UserEmail[]>(
            'SELECT email FROM sys.users WHERE id = $1::uuid',
            item.responsible_user_id,
          );

          if (userRows[0]) {
            const daysRemaining = Math.ceil(
              (new Date(item.expiry_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
            );

            const label = item.status === 'expired' ? 'EXPIRED' : 'EXPIRING SOON';

            await this.emailQueue.add('compliance-alert', {
              to: userRows[0].email,
              subject: `Compliance item ${label}: ${item.name}`,
              body: `Compliance item "${item.name}" (${item.category ?? 'Uncategorised'}) ${label === 'EXPIRED' ? 'has expired' : `is expiring in ${daysRemaining} day(s)`}.\nExpiry date: ${item.expiry_date}\nPlease take action.`,
            });
          }
        }

        // -------------------------------------------------------------------
        // 5. Audit log
        // -------------------------------------------------------------------
        try {
          await this.auditService.log({
            tableName: 'sys.compliance_items',
            recordId: item.id,
            action: 'UPDATE',
            oldValue: { status: 'valid' },
            newValue: { status: item.status, event: 'nightly_cron' },
            changedBy: null,
            ipAddress: null,
            userAgent: null,
            correlationId: CorrelationStore.getStore()?.correlationId,
          });
        } catch (err) {
          this.logger.warn(`Audit write failed for compliance item ${item.id}`);
        }
      }
    } finally {
      // -------------------------------------------------------------------
      // 6. Release lock
      // -------------------------------------------------------------------
      await this.redis.del(ComplianceService.LOCK_KEY);
      this.logger.log('Compliance nightly check complete');
    }
  }
}
