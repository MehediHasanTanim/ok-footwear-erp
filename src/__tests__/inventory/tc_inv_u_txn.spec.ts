// =============================================================================
// TC-INV-U-001…003 — StockTransactionsService insert-only + reorder events
// =============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UnprocessableEntityException } from '@nestjs/common';
import { StockTransactionsService } from '@modules/inventory/services/stock-transactions.service';
import { PrismaService } from '@shared/database/prisma.service';
import { DocNumberService } from '@modules/orders/services/doc-number.service';
import { StockBelowReorderEvent } from '@modules/inventory/events/stock-below-reorder.event';

type QueryRawTaggedCall = [TemplateStringsArray, ...unknown[]];

describe('StockTransactionsService (TC-INV-U-001…003)', () => {
  let service: StockTransactionsService;
  let eventEmitter: { emit: jest.Mock };
  let prisma: {
    stockItem: { findUnique: jest.Mock };
    warehouse: { findUnique: jest.Mock };
    stockBalance: {
      findUnique: jest.Mock;
      aggregate: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
  };
  let docNumber: { generate: jest.Mock };
  let txQueryRaw: jest.Mock;

  beforeEach(async () => {
    eventEmitter = { emit: jest.fn() };
    docNumber = { generate: jest.fn().mockResolvedValue('STXN-000001') };
    txQueryRaw = jest.fn().mockResolvedValue([
      {
        id: 't1',
        txn_date: new Date('2026-08-06'),
        txn_number: 'STXN-000001',
        txn_type: 'grn',
        item_id: 'i1',
        warehouse_id: 'w1',
        quantity: 50,
        direction: 1,
        unit_cost: 10,
        batch_lot: null,
        source_module: null,
        source_id: null,
        remarks: null,
        created_at: new Date(),
        created_by: 'u1',
      },
    ]);
    prisma = {
      stockItem: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'i1',
          isActive: true,
          reorderLevel: 100,
        }),
      },
      warehouse: {
        findUnique: jest.fn().mockResolvedValue({ id: 'w1', isActive: true }),
      },
      stockBalance: {
        findUnique: jest.fn().mockResolvedValue({ quantity: 200 }),
        aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 95 } }),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = { $queryRaw: txQueryRaw };
        return fn(tx);
      }),
      $queryRaw: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockTransactionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: DocNumberService, useValue: docNumber },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get(StockTransactionsService);
  });

  // TC-INV-U-001
  it('INSERT via $queryRaw only — never updates/deletes ledger or balances', async () => {
    await service.recordMovement(
      {
        itemId: 'i1',
        warehouseId: 'w1',
        quantity: 50,
        direction: 1,
        txnType: 'grn',
      },
      'u1',
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(docNumber.generate).toHaveBeenCalledWith(expect.anything(), 'STXN');
    expect(txQueryRaw).toHaveBeenCalledTimes(1);

    const call = txQueryRaw.mock.calls[0] as QueryRawTaggedCall;
    const [strings] = call;
    const sqlText = Array.from(strings).join('?').toLowerCase();
    expect(sqlText).toContain('insert into inv.stock_transactions');
    expect(sqlText).not.toMatch(/\bupdate\b/);
    expect(sqlText).not.toMatch(/\bdelete\b/);

    // Balances are trigger-owned — app must not write them
    expect(prisma.stockBalance.create).not.toHaveBeenCalled();
    expect(prisma.stockBalance.update).not.toHaveBeenCalled();
    expect(prisma.stockBalance.delete).not.toHaveBeenCalled();
  });

  // TC-INV-U-002
  it('emits StockBelowReorderEvent when balance ≤ reorder_level', async () => {
    prisma.stockBalance.aggregate.mockResolvedValue({ _sum: { quantity: 95 } });
    prisma.stockItem.findUnique.mockResolvedValue({
      id: 'i1',
      isActive: true,
      reorderLevel: 100,
    });

    await service.checkReorderLevel('i1');

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'stock.below_reorder',
      expect.any(StockBelowReorderEvent),
    );
    const evt = eventEmitter.emit.mock.calls[0][1] as StockBelowReorderEvent;
    expect(evt.itemId).toBe('i1');
    expect(evt.totalQty).toBe(95);
  });

  // TC-INV-U-003
  it('does not emit event when balance is above reorder level', async () => {
    prisma.stockBalance.aggregate.mockResolvedValue({ _sum: { quantity: 250 } });
    prisma.stockItem.findUnique.mockResolvedValue({
      id: 'i1',
      isActive: true,
      reorderLevel: 100,
    });

    await service.checkReorderLevel('i1');

    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('rejects outbound when insufficient stock (422)', async () => {
    prisma.stockBalance.findUnique.mockResolvedValue({ quantity: 10 });

    await expect(
      service.recordMovement(
        {
          itemId: 'i1',
          warehouseId: 'w1',
          quantity: 50,
          direction: -1,
          txnType: 'production_issue',
        },
        'u1',
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
