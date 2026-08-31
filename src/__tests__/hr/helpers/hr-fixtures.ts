import { prisma } from '@test/helpers/integration-test-setup';

export const HR_USER_ID = 'a9111111-1111-4111-8111-111111111111';
export const HR_DEPT_ID = 'b9111111-1111-4111-8111-111111111111';
export const HR_DESIG_ID = 'c9111111-1111-4111-8111-111111111111';
export const HR_EMP_GRATUITY_ID = 'd9111111-1111-4111-8111-111111111111';
export const HR_EMP_SHORT_ID = 'd9222222-2222-4222-8222-222222222222';

export async function seedHrMasters(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO sys.users (id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
     VALUES ($1::uuid, 'hr-db@okfootwear.com', 'x', 'HR', 'Test', true, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    HR_USER_ID,
  );

  await prisma.department.upsert({
    where: { id: HR_DEPT_ID },
    create: { id: HR_DEPT_ID, code: 'HR-PROD', name: 'Production HR Test' },
    update: {},
  });

  await prisma.designation.upsert({
    where: { id: HR_DESIG_ID },
    create: { id: HR_DESIG_ID, code: 'OP', title: 'Operator', level: 'junior' },
    update: {},
  });
}

export async function seedGratuityEmployee(options?: {
  id?: string;
  joinDate?: string;
  basicSalary?: number;
}): Promise<{ employeeId: string }> {
  const id = options?.id ?? HR_EMP_GRATUITY_ID;
  const joinDate = options?.joinDate ?? '2020-01-01';
  const basicSalary = options?.basicSalary ?? 30_000;

  await prisma.employee.upsert({
    where: { id },
    create: {
      id,
      employeeCode: `EMP-${id.slice(0, 8)}`,
      fullName: 'Gratuity Test Employee',
      dateOfBirth: new Date('1990-01-01'),
      gender: 'M',
      joinDate: new Date(joinDate),
      departmentId: HR_DEPT_ID,
      designationId: HR_DESIG_ID,
      designation: 'Operator',
      employmentType: 'full_time',
      employeeCategory: 'office',
      basicSalary,
      createdBy: HR_USER_ID,
    },
    update: {
      joinDate: new Date(joinDate),
      basicSalary,
      deletedAt: null,
    },
  });

  return { employeeId: id };
}

export async function seedShortServiceEmployee(): Promise<{ employeeId: string }> {
  return seedGratuityEmployee({
    id: HR_EMP_SHORT_ID,
    joinDate: '2025-05-01',
    basicSalary: 30_000,
  });
}
