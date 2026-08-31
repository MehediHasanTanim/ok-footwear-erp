import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { EncryptionService } from '@shared/crypto/encryption.service';
import { AuditService } from '@modules/system/services/audit.service';
import {
  CreateEmployeeDto,
  EmployeeQueryDto,
  EmployeeSecretsDto,
  TerminateEmployeeDto,
  UpdateEmployeeDto,
} from '../dto/employees.dto';

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateEmployeeDto, userId: string) {
    if (dto.employeeCategory === 'factory' && !dto.factoryCategory) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'factory_category is required for factory employees',
      });
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const employee = await tx.employee.create({
          data: {
            employeeCode: dto.employeeCode,
            fullName: dto.fullName,
            email: dto.email,
            phone: dto.phone,
            dateOfBirth: new Date(dto.dateOfBirth),
            gender: dto.gender,
            nationality: dto.nationality ?? 'Bangladeshi',
            joinDate: new Date(dto.joinDate),
            departmentId: dto.departmentId,
            designationId: dto.designationId,
            designation: dto.designation,
            employmentType: dto.employmentType,
            employeeCategory: dto.employeeCategory,
            factoryCategory: dto.factoryCategory,
            reportingManagerId: dto.reportingManagerId,
            basicSalary: dto.basicSalary ?? 0,
            createdBy: userId,
          },
          include: { department: true, designationRef: true },
        });

        if (dto.secrets) {
          await this.upsertSecretsTx(tx, employee.id, dto.secrets);
        }

        await tx.employmentEvent.create({
          data: {
            employeeId: employee.id,
            eventType: 'hire',
            effectiveDate: new Date(dto.joinDate),
            newDepartment: dto.departmentId,
            newDesignation: dto.designation,
            newBasic: dto.basicSalary ?? 0,
            approvedBy: userId,
            createdBy: userId,
          },
        });

        return this.toDto(employee);
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          statusCode: 409,
          message: 'Employee code already exists',
        });
      }
      throw err;
    }
  }

  async findAll(query: EmployeeQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.EmployeeWhereInput = { deletedAt: null };
    if (query.departmentId) where.departmentId = query.departmentId;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { employeeCode: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        skip,
        take: limit,
        orderBy: { fullName: 'asc' },
        include: { department: true, designationRef: true },
      }),
      this.prisma.employee.count({ where }),
    ]);

    return {
      items: items.map((e) => this.toDto(e)),
      total,
      page,
      limit,
    };
  }

  async findOne(id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, deletedAt: null },
      include: { department: true, designationRef: true },
    });
    if (!employee) {
      throw new NotFoundException({ statusCode: 404, message: 'Employee not found' });
    }
    return this.toDto(employee);
  }

  async update(id: string, dto: UpdateEmployeeDto, userId: string) {
    const existing = await this.prisma.employee.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException({ statusCode: 404, message: 'Employee not found' });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.update({
        where: { id },
        data: {
          fullName: dto.fullName,
          email: dto.email,
          phone: dto.phone,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
          gender: dto.gender,
          nationality: dto.nationality,
          joinDate: dto.joinDate ? new Date(dto.joinDate) : undefined,
          departmentId: dto.departmentId,
          designationId: dto.designationId,
          designation: dto.designation,
          employmentType: dto.employmentType,
          employeeCategory: dto.employeeCategory,
          factoryCategory: dto.factoryCategory,
          reportingManagerId: dto.reportingManagerId,
          basicSalary: dto.basicSalary,
          status: dto.status,
          lastWorkingDate: dto.lastWorkingDate ? new Date(dto.lastWorkingDate) : undefined,
        },
        include: { department: true, designationRef: true },
      });

      if (
        dto.departmentId &&
        dto.departmentId !== existing.departmentId
      ) {
        await tx.employmentEvent.create({
          data: {
            employeeId: id,
            eventType: 'transfer',
            effectiveDate: new Date(),
            oldDepartment: existing.departmentId,
            newDepartment: dto.departmentId,
            approvedBy: userId,
            createdBy: userId,
          },
        });
      }

      if (dto.basicSalary != null && Number(dto.basicSalary) !== Number(existing.basicSalary)) {
        await tx.employmentEvent.create({
          data: {
            employeeId: id,
            eventType: 'salary_revision',
            effectiveDate: new Date(),
            oldBasic: existing.basicSalary,
            newBasic: dto.basicSalary,
            approvedBy: userId,
            createdBy: userId,
          },
        });
      }

      if (dto.secrets) {
        await this.upsertSecretsTx(tx, id, dto.secrets);
      }

      return employee;
    });

    return this.toDto(updated);
  }

  async updateSecrets(id: string, dto: EmployeeSecretsDto, userId: string) {
    await this.findOne(id);
    await this.prisma.$transaction(async (tx) => {
      await this.upsertSecretsTx(tx, id, dto);
    });
    return { employeeId: id, updated: true, updatedBy: userId };
  }

  async revealSecrets(id: string, userId: string) {
    await this.findOne(id);
    const secrets = await this.prisma.employeeSecrets.findUnique({ where: { employeeId: id } });
    if (!secrets) {
      return { employeeId: id, secrets: null };
    }

    await this.audit.log({
      tableName: 'hr.employee_secrets',
      recordId: id,
      action: 'SELECT',
      changedBy: userId,
      newValue: { action: 'reveal_pii' },
    });

    return {
      employeeId: id,
      secrets: {
        nid: secrets.nidEncrypted ? this.encryption.decrypt(Buffer.from(secrets.nidEncrypted)) : null,
        passport: secrets.passportEncrypted
          ? this.encryption.decrypt(Buffer.from(secrets.passportEncrypted))
          : null,
        bankAccount: secrets.bankAccountEncrypted
          ? this.encryption.decrypt(Buffer.from(secrets.bankAccountEncrypted))
          : null,
        bankName: secrets.bankName,
        bankBranch: secrets.bankBranch,
        routingNumber: secrets.routingNumber,
        emergencyContact: secrets.emergencyContact,
      },
    };
  }

  async terminate(id: string, dto: TerminateEmployeeDto, userId: string) {
    return this.update(
      id,
      {
        status: 'terminated',
        lastWorkingDate: dto.lastWorkingDate,
      },
      userId,
    );
  }

  async resign(id: string, dto: TerminateEmployeeDto, userId: string) {
    return this.update(
      id,
      {
        status: 'resigned',
        lastWorkingDate: dto.lastWorkingDate,
      },
      userId,
    );
  }

  private async upsertSecretsTx(
    tx: Prisma.TransactionClient,
    employeeId: string,
    dto: EmployeeSecretsDto,
  ) {
    const data: Prisma.EmployeeSecretsUpsertArgs['create'] = {
      employeeId,
      bankName: dto.bankName,
      bankBranch: dto.bankBranch,
      routingNumber: dto.routingNumber,
      emergencyContact: dto.emergencyContact as Prisma.InputJsonValue | undefined,
      nidEncrypted: dto.nid ? this.encryption.encrypt(dto.nid) : undefined,
      passportEncrypted: dto.passport ? this.encryption.encrypt(dto.passport) : undefined,
      bankAccountEncrypted: dto.bankAccount
        ? this.encryption.encrypt(dto.bankAccount)
        : undefined,
    };

    await tx.employeeSecrets.upsert({
      where: { employeeId },
      create: data,
      update: {
        bankName: dto.bankName ?? undefined,
        bankBranch: dto.bankBranch ?? undefined,
        routingNumber: dto.routingNumber ?? undefined,
        emergencyContact: dto.emergencyContact as Prisma.InputJsonValue | undefined,
        nidEncrypted: dto.nid ? this.encryption.encrypt(dto.nid) : undefined,
        passportEncrypted: dto.passport ? this.encryption.encrypt(dto.passport) : undefined,
        bankAccountEncrypted: dto.bankAccount
          ? this.encryption.encrypt(dto.bankAccount)
          : undefined,
      },
    });
  }

  private toDto(employee: {
    id: string;
    employeeCode: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    dateOfBirth: Date;
    gender: string;
    nationality: string;
    joinDate: Date;
    departmentId: string;
    designationId: string | null;
    designation: string;
    employmentType: string;
    employeeCategory: string;
    factoryCategory: string | null;
    reportingManagerId: string | null;
    status: string;
    basicSalary: Prisma.Decimal | number;
    lastWorkingDate: Date | null;
    department?: { code: string; name: string };
    designationRef?: { code: string; title: string } | null;
  }) {
    return {
      id: employee.id,
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      email: employee.email,
      phone: employee.phone,
      dateOfBirth: employee.dateOfBirth,
      gender: employee.gender,
      nationality: employee.nationality,
      joinDate: employee.joinDate,
      departmentId: employee.departmentId,
      department: employee.department,
      designationId: employee.designationId,
      designation: employee.designation,
      designationRef: employee.designationRef,
      employmentType: employee.employmentType,
      employeeCategory: employee.employeeCategory,
      factoryCategory: employee.factoryCategory,
      reportingManagerId: employee.reportingManagerId,
      status: employee.status,
      basicSalary: Number(employee.basicSalary),
      lastWorkingDate: employee.lastWorkingDate,
    };
  }
}
