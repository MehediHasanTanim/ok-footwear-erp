import { Test, TestingModule } from '@nestjs/testing';
import { prisma } from '@test/helpers/integration-test-setup';
import { EncryptionService } from '@shared/crypto/encryption.service';
import { EmployeesService } from '@modules/hr/services/employees.service';
import { AuditService } from '@modules/system/services/audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import {
  deployHrSchema,
} from '../helpers/deploy-hr-schema';
import {
  HR_DEPT_ID,
  HR_DESIG_ID,
  HR_USER_ID,
  seedHrMasters,
} from '../helpers/hr-fixtures';

const HR_PII_KEY = 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456';
const TEST_EMP_ID = 'e9333333-3333-4333-8333-333333333333';

describe('TC-SEC-ENC HR employee secrets encryption', () => {
  let employees: EmployeesService;

  beforeAll(async () => {
    process.env['HR_PII_ENCRYPTION_KEY'] = HR_PII_KEY;
    await deployHrSchema();
  }, 60_000);

  beforeEach(async () => {
    await seedHrMasters();

    await prisma.employee.upsert({
      where: { id: TEST_EMP_ID },
      create: {
        id: TEST_EMP_ID,
        employeeCode: 'ENC-001',
        fullName: 'Encryption Test',
        dateOfBirth: new Date('1990-05-01'),
        gender: 'M',
        joinDate: new Date('2024-01-01'),
        departmentId: HR_DEPT_ID,
        designationId: HR_DESIG_ID,
        designation: 'Operator',
        employmentType: 'full_time',
        employeeCategory: 'office',
        basicSalary: 25_000,
        createdBy: HR_USER_ID,
      },
      update: {},
    });

    const audit = { log: jest.fn().mockResolvedValue('audit-id') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeesService,
        EncryptionService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    employees = module.get(EmployeesService);
  });

  it('TC-SEC-ENC-001 NID stored as BYTEA not plain text in employee_secrets', async () => {
    await employees.updateSecrets(
      TEST_EMP_ID,
      { nid: '1234567890123' },
      HR_USER_ID,
    );

    const raw = await prisma.$queryRaw<{ nid_encrypted: Buffer | null }[]>`
      SELECT nid_encrypted FROM hr.employee_secrets WHERE employee_id = ${TEST_EMP_ID}::uuid
    `;
    const nidValue = raw[0]?.nid_encrypted;

    expect(nidValue).toBeTruthy();
    expect(Buffer.isBuffer(nidValue) || nidValue instanceof Uint8Array).toBe(true);
    expect(nidValue!.toString()).not.toBe('1234567890123');
  });

  it('TC-SEC-ENC-002 bank account field unreadable from DB without decryption key', async () => {
    const bankAccount = '0123456789';
    await employees.updateSecrets(
      TEST_EMP_ID,
      { bankAccount },
      HR_USER_ID,
    );

    const raw = await prisma.$queryRaw<{ hex_value: string | null }[]>`
      SELECT encode(bank_account_encrypted, 'hex') AS hex_value
      FROM hr.employee_secrets WHERE employee_id = ${TEST_EMP_ID}::uuid
    `;
    const hexValue = raw[0]?.hex_value;

    expect(hexValue).toBeTruthy();
    expect(hexValue!.length).toBeGreaterThan(0);
    expect(hexValue).not.toBe(bankAccount);
  });
});
