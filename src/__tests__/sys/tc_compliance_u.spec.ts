// =============================================================================
// TC-COMPLIANCE — ComplianceService Unit Tests
// =============================================================================
// OK Footwear ERP — Sprint 2
// =============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { ComplianceService } from '@modules/system/services/compliance.service';
import { AuditService } from '@modules/system/services/audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import { REDIS_AUTH } from '@infrastructure/redis/redis.constants';
import { EMAIL_QUEUE } from '@infrastructure/queue/queue.constants';
import { getQueueToken } from '@nestjs/bullmq';

const mockPrisma = {
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
};
const mockAudit = { log: jest.fn(), logBatch: jest.fn() };
const mockRedis = { set: jest.fn(), del: jest.fn() };
const mockQueue = { add: jest.fn() };

describe('ComplianceService', () => {
  let svc: ComplianceService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    mockPrisma.$executeRawUnsafe.mockResolvedValue(0);
    mockRedis.set.mockResolvedValue('OK'); // Lock acquired
    mockRedis.del.mockResolvedValue(1);

    const m: TestingModule = await Test.createTestingModule({
      providers: [
        ComplianceService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: REDIS_AUTH, useValue: mockRedis },
        { provide: getQueueToken(EMAIL_QUEUE), useValue: mockQueue },
      ],
    }).compile();

    svc = m.get(ComplianceService);
  });

  // AC-1: Cron fires at 02:00 — nightlyCheck runs (no @Cron, callable directly)
  it('AC-1: nightlyCheck is callable directly', async () => {
    await expect(svc.nightlyCheck()).resolves.toBeUndefined();
  });

  // AC-2: expired items updated
  it('AC-2: items with past expiry_date are marked expired', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ id: 'c1', name: 'ExpiredCert', category: 'licence', expiry_date: yesterday, responsible_user_id: null, alert_days: 30, status: 'valid' }]);

    await svc.nightlyCheck();

    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("status = 'expired'"),
      ['c1'],
    );
  });

  // AC-3: expiring_soon items updated
  it('AC-3: items expiring within alert_days are marked expiring_soon', async () => {
    const in5Days = new Date();
    in5Days.setDate(in5Days.getDate() + 5);

    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ id: 'c2', name: 'ExpSoon', category: 'cert', expiry_date: in5Days, responsible_user_id: null, alert_days: 10, status: 'valid' }]);

    await svc.nightlyCheck();

    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("status = 'expiring_soon'"),
      ['c2'],
    );
  });

  // AC-4: already expired/expiring_soon NOT re-processed
  it('AC-4: only status=valid items are queried', async () => {
    await svc.nightlyCheck();

    const querySql = mockPrisma.$queryRawUnsafe.mock.calls[0][0] as string;
    expect(querySql).toContain("status = 'valid'");
  });

  // AC-5: Email enqueued
  it('AC-5: email job enqueued for affected items with responsible user', async () => {
    const in3Days = new Date();
    in3Days.setDate(in3Days.getDate() + 3);

    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ id: 'c3', name: 'FireCert', category: 'safety', expiry_date: in3Days, responsible_user_id: 'u1', alert_days: 5, status: 'valid' }])
      .mockResolvedValueOnce([{ email: 'admin@test.com' }]);

    await svc.nightlyCheck();

    expect(mockQueue.add).toHaveBeenCalledWith('compliance-alert', expect.objectContaining({
      to: 'admin@test.com',
      subject: expect.stringContaining('FireCert'),
    }));
  });

  // AC-6: Redis lock acquired
  it('AC-6: acquires Redis lock before processing', async () => {
    await svc.nightlyCheck();

    expect(mockRedis.set).toHaveBeenCalledWith(
      'compliance:nightly:lock',
      expect.any(String),
      'EX',
      120,
      'NX',
    );
  });

  // AC-7: Lock acquisition failure → skip
  it('AC-7: skips when Redis lock not acquired (NX returns null)', async () => {
    mockRedis.set.mockResolvedValue(null);

    await svc.nightlyCheck();

    // Should not query DB at all
    expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  // AC-8: Audit log written
  it('AC-8: audit log written for each status change', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ id: 'c1', name: 'OldCert', category: null, expiry_date: yesterday, responsible_user_id: null, alert_days: 30, status: 'valid' }]);

    await svc.nightlyCheck();

    expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({
      tableName: 'sys.compliance_items',
      action: 'UPDATE',
      newValue: expect.objectContaining({ event: 'nightly_cron' }),
    }));
  });

  // Edge: lock released in finally
  it('releases Redis lock after completion', async () => {
    await svc.nightlyCheck();

    expect(mockRedis.del).toHaveBeenCalledWith('compliance:nightly:lock');
  });

  // Edge: lock released even on error
  it('releases lock even when processing throws', async () => {
    mockPrisma.$queryRawUnsafe.mockRejectedValue(new Error('DB crash'));

    await expect(svc.nightlyCheck()).rejects.toThrow();

    expect(mockRedis.del).toHaveBeenCalledWith('compliance:nightly:lock');
  });
});
