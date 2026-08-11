// =============================================================================
// TC-FIN-U-001…003 — FinanceService.postJournal balance + period checks
// =============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { UnprocessableEntityException } from '@nestjs/common';
import { FinanceService } from '@modules/finance/services/finance.service';
import { PrismaService } from '@shared/database/prisma.service';
import { DocNumberService } from '@modules/orders/services/doc-number.service';

type QueryRawTaggedCall = [TemplateStringsArray, ...unknown[]];

const ACC_DR = 'a1200000-0000-4000-8000-000000001200';
const ACC_CR = 'a4100000-0000-4000-8000-000000004100';
const PERIOD_ID = 'p1111111-1111-4111-8111-111111111111';
const USER_ID = 'u1111111-1111-4111-8111-111111111111';

describe('FinanceService.postJournal (TC-FIN-U-001…003)', () => {
  let service: FinanceService;
  let prisma: {
    glPeriod: { findUnique: jest.Mock };
    chartOfAccount: { findMany: jest.Mock };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
  };
  let docNumber: { generate: jest.Mock };
  let txQueryRaw: jest.Mock;
  let txGlEntryCreate: jest.Mock;

  const baseInput = {
    periodId: PERIOD_ID,
    entryDate: '2026-08-01',
    narration: 'Test journal',
    postedBy: USER_ID,
  };

  beforeEach(async () => {
    docNumber = { generate: jest.fn().mockResolvedValue('JV-000001') };
    txQueryRaw = jest.fn().mockResolvedValue([]);
    txGlEntryCreate = jest.fn().mockResolvedValue({
      id: 'e1',
      entryNumber: 'JV-000001',
      periodId: PERIOD_ID,
      entryDate: new Date('2026-08-01'),
      status: 'posted',
      narration: 'Test journal',
      entryType: 'manual',
      postedBy: USER_ID,
      createdBy: USER_ID,
    });

    prisma = {
      glPeriod: {
        findUnique: jest.fn().mockResolvedValue({
          id: PERIOD_ID,
          status: 'open',
          periodYear: 2026,
          periodMonth: 8,
        }),
      },
      chartOfAccount: {
        findMany: jest.fn().mockResolvedValue([
          { id: ACC_DR, isActive: true },
          { id: ACC_CR, isActive: true },
        ]),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          glEntry: { create: txGlEntryCreate },
          $queryRaw: txQueryRaw,
        };
        return fn(tx);
      }),
      $queryRaw: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinanceService,
        { provide: PrismaService, useValue: prisma },
        { provide: DocNumberService, useValue: docNumber },
      ],
    }).compile();

    service = module.get(FinanceService);
  });

  // TC-FIN-U-001
  it('rejects journal when total debit ≠ total credit', async () => {
    await expect(
      service.postJournal({
        ...baseInput,
        lines: [
          { accountId: ACC_DR, debit: 5000, credit: 0 },
          { accountId: ACC_CR, debit: 0, credit: 4500 },
        ],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    try {
      await service.postJournal({
        ...baseInput,
        lines: [
          { accountId: ACC_DR, debit: 5000, credit: 0 },
          { accountId: ACC_CR, debit: 0, credit: 4500 },
        ],
      });
    } catch (err) {
      const resp = (err as UnprocessableEntityException).getResponse() as {
        message: string;
      };
      expect(resp.message).toMatch(/Journal must balance/i);
    }

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // TC-FIN-U-002
  it('posts balanced journal successfully', async () => {
    const result = await service.postJournal({
      ...baseInput,
      lines: [
        { accountId: ACC_DR, debit: 5000, credit: 0 },
        { accountId: ACC_CR, debit: 0, credit: 5000 },
      ],
    });

    expect(result.status).toBe('posted');
    expect(result.entryNumber).toBe('JV-000001');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(docNumber.generate).toHaveBeenCalledWith(expect.anything(), 'JV');
    expect(txQueryRaw).toHaveBeenCalledTimes(2);

    for (const call of txQueryRaw.mock.calls as QueryRawTaggedCall[]) {
      const sqlText = Array.from(call[0]).join('?').toLowerCase();
      expect(sqlText).toContain('insert into fin.gl_entry_lines');
    }
  });

  // TC-FIN-U-003
  it('throws UnprocessableEntityException when period is locked', async () => {
    prisma.glPeriod.findUnique.mockResolvedValue({
      id: PERIOD_ID,
      status: 'locked',
      periodYear: 2026,
      periodMonth: 8,
    });

    await expect(
      service.postJournal({
        ...baseInput,
        lines: [
          { accountId: ACC_DR, debit: 100, credit: 0 },
          { accountId: ACC_CR, debit: 0, credit: 100 },
        ],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    try {
      await service.postJournal({
        ...baseInput,
        lines: [
          { accountId: ACC_DR, debit: 100, credit: 0 },
          { accountId: ACC_CR, debit: 0, credit: 100 },
        ],
      });
    } catch (err) {
      const resp = (err as UnprocessableEntityException).getResponse() as {
        message: string;
      };
      expect(resp.message).toBe('Cannot post to a locked GL period');
    }

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
