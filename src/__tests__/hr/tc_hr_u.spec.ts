import { UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PfService } from '@modules/hr/services/pf.service';
import { LeaveService } from '@modules/hr/services/leave.service';
import { PrismaService } from '@shared/database/prisma.service';
import { computeLopDeduction } from '@modules/hr/utils/lop.util';
import { computeGratuityAmount } from '@modules/hr/utils/gratuity.util';
import { computeAdvanceInstalment } from '@modules/hr/utils/salary-advance.util';

const EMPLOYEE_ID = 'e1111111-1111-4111-8111-111111111111';
const LEAVE_TYPE_ID = 'lt111111-1111-4111-8111-111111111111';

describe('HR unit (TC-HR-U-001/002/005/009)', () => {
  it.each([
    [30_000, 26, 2, 2307.69],
    [25_000, 26, 5, 4807.69],
    [20_000, 30, 1, 666.67],
  ])(
    'TC-HR-U-001 LOP deduction basic=%i workingDays=%i lopDays=%i',
    (basic, workingDays, lopDays, expected) => {
      expect(computeLopDeduction(basic, workingDays, lopDays)).toBeCloseTo(expected, 2);
    },
  );

  it('TC-HR-U-002 PF deduction at 10% of basic salary', () => {
    const pf = new PfService({} as PrismaService);
    expect(pf.calculateContribution(30_000)).toEqual({ employee: 3000, employer: 3000 });
  });

  it.each([
    ['2020-01-01', '2026-01-01', 30_000, 207_692.31],
    ['2020-01-01', '2025-07-01', 30_000, 207_692.31],
    ['2020-01-01', '2025-06-01', 30_000, 173_076.92],
    ['2025-05-01', '2025-10-01', 30_000, 0],
  ])(
    'TC-HR-U-005 gratuity join=%s exit=%s basic=%i',
    (join, exit, basic, expected) => {
      expect(computeGratuityAmount(join, exit, basic)).toBeCloseTo(expected, 2);
    },
  );

  it('TC-HR-U-009 salary advance instalment = amount / recoveryMonths', () => {
    expect(computeAdvanceInstalment(30_000, 3)).toBe(10_000);
  });
});

describe('HR unit leave (TC-HR-U-006/007/008)', () => {
  let leave: LeaveService;
  let prisma: {
    leaveType: { findUnique: jest.Mock };
    leaveRequest: { create: jest.Mock };
    leaveBalance: { findUnique: jest.Mock; upsert: jest.Mock };
    $queryRaw: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      leaveType: { findUnique: jest.fn() },
      leaveRequest: { create: jest.fn() },
      leaveBalance: { findUnique: jest.fn(), upsert: jest.fn().mockResolvedValue({}) },
      $queryRaw: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [LeaveService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    leave = module.get(LeaveService);

    prisma.leaveType.findUnique.mockResolvedValue({
      id: LEAVE_TYPE_ID,
      halfDayAllowed: true,
      code: 'AL',
      name: 'Annual Leave',
    });
  });

  it('TC-HR-U-006 leave application rejected when balance < requested days', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.leaveBalance.findUnique.mockResolvedValue({
      openingBal: 2.5,
      accrued: 0,
      adjusted: 0,
      used: 0,
    });

    await expect(
      leave.apply({
        employeeId: EMPLOYEE_ID,
        leaveTypeId: LEAVE_TYPE_ID,
        startDate: '2026-03-10',
        endDate: '2026-03-14',
      }),
    ).rejects.toMatchObject({
      response: { message: expect.stringMatching(/Insufficient leave balance/i) },
    });

    expect(prisma.leaveRequest.create).not.toHaveBeenCalled();
  });

  it('TC-HR-U-007 half-day leave sets totalDays to 0.5', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.leaveBalance.findUnique.mockResolvedValue({
      openingBal: 10,
      accrued: 0,
      adjusted: 0,
      used: 0,
    });
    prisma.leaveRequest.create.mockImplementation(({ data }) => Promise.resolve(data));

    const result = await leave.apply({
      employeeId: EMPLOYEE_ID,
      leaveTypeId: LEAVE_TYPE_ID,
      startDate: '2026-03-10',
      endDate: '2026-03-10',
      halfDay: 'morning',
    });

    expect(Number(result.totalDays)).toBe(0.5);
  });

  it('TC-HR-U-008 overlapping leave request detected and rejected', async () => {
    prisma.$queryRaw.mockResolvedValue([{ id: 'existing-leave' }]);

    await expect(
      leave.apply({
        employeeId: EMPLOYEE_ID,
        leaveTypeId: LEAVE_TYPE_ID,
        startDate: '2026-03-10',
        endDate: '2026-03-12',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    await expect(
      leave.apply({
        employeeId: EMPLOYEE_ID,
        leaveTypeId: LEAVE_TYPE_ID,
        startDate: '2026-03-10',
        endDate: '2026-03-12',
      }),
    ).rejects.toMatchObject({
      response: { message: expect.stringMatching(/Overlapping leave request/i) },
    });
  });
});
