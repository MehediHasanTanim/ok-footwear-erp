import { prisma } from '@test/helpers/integration-test-setup';
import {
  deployHrSchema,
} from '../helpers/deploy-hr-schema';
import {
  HR_DEPT_ID,
  HR_DESIG_ID,
  HR_EMP_GRATUITY_ID,
  HR_EMP_SHORT_ID,
  HR_USER_ID,
  seedGratuityEmployee,
  seedHrMasters,
  seedShortServiceEmployee,
} from '../helpers/hr-fixtures';

describe('TC-DB-HR compute_gratuity()', () => {
  beforeAll(async () => {
    await deployHrSchema();
  }, 60_000);

  beforeEach(async () => {
    await seedHrMasters();
    await seedGratuityEmployee();
  });

  it('TC-DB-HR-001 returns basic × (30/26) × 6 for 6 completed years', async () => {
    const rows = await prisma.$queryRaw<{ gratuity: number | string }[]>`
      SELECT hr.compute_gratuity(${HR_EMP_GRATUITY_ID}::uuid, '2026-01-01'::date) AS gratuity
    `;
    expect(Number(rows[0]!.gratuity)).toBeCloseTo(207_692.31, 2);
  });

  it('TC-DB-HR-002 rounds 5y 6m up to 6 years per Labour Act rule', async () => {
    const rows = await prisma.$queryRaw<{ gratuity: number | string }[]>`
      SELECT hr.compute_gratuity(${HR_EMP_GRATUITY_ID}::uuid, '2025-07-01'::date) AS gratuity
    `;
    expect(Number(rows[0]!.gratuity)).toBeCloseTo(207_692.31, 2);
  });

  it('TC-DB-HR-003 keeps 5y 5m as 5 years (fractional months < 6 discarded)', async () => {
    const rows = await prisma.$queryRaw<{ gratuity: number | string }[]>`
      SELECT hr.compute_gratuity(${HR_EMP_GRATUITY_ID}::uuid, '2025-06-01'::date) AS gratuity
    `;
    expect(Number(rows[0]!.gratuity)).toBeCloseTo(173_076.92, 2);
  });

  it('TC-DB-HR-004 returns 0 when service is less than one year', async () => {
    await seedShortServiceEmployee();
    const rows = await prisma.$queryRaw<{ gratuity: number | string }[]>`
      SELECT hr.compute_gratuity(${HR_EMP_SHORT_ID}::uuid, '2025-10-01'::date) AS gratuity
    `;
    expect(Number(rows[0]!.gratuity)).toBe(0);
  });
});

describe('TC-DB-CON-005 factory_category constraint', () => {
  beforeAll(async () => {
    await deployHrSchema();
  }, 60_000);

  beforeEach(async () => {
    await seedHrMasters();
  });

  it('TC-DB-CON-005 factory_category required for factory employee type', async () => {
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO hr.employees (
          id, employee_code, full_name, date_of_birth, gender, join_date,
          department_id, designation_id, designation, employment_type,
          employee_category, factory_category, basic_salary, created_by,
          created_at, updated_at
        ) VALUES (
          gen_random_uuid(), 'FAC-BAD', 'Factory Bad', '1990-01-01', 'M', '2020-01-01',
          $1::uuid, $2::uuid, 'Operator', 'full_time',
          'factory', NULL, 20000, $3::uuid, NOW(), NOW()
        )`,
        HR_DEPT_ID,
        HR_DESIG_ID,
        HR_USER_ID,
      ),
    ).rejects.toThrow(/chk_factory_cat/);
  });
});
