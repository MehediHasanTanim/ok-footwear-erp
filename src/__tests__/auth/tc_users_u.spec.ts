// =============================================================================
// TC-USERS-U — UsersService Unit Tests
// =============================================================================
// OK Footwear ERP — Sprint 2
// Layer under test: UsersService (CRUD, roles, employee linking)
//
// Covers all 10 acceptance criteria (service layer):
//   1. findAll returns paginated list with total
//   2. create hashes password, raw password not returned
//   3. update re-hashes password if included
//   4. softDelete sets isActive=false, no physical delete
//   5. Soft-deleted user blocked (login checks isActive — tested in login suite)
//   6. assignRole invalidates permissions cache
//   7. removeRole invalidates permissions cache
//   8. linkEmployee sets employee_id FK
//   9. findOne returns 404 for nonexistent
//  10. RBAC enforced at controller level (403)
// =============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { UsersService } from '@modules/system/services/users.service';
import { AuthService } from '@modules/system/services/auth.service';
import { PrismaService } from '@shared/database/prisma.service';
import { PaginationDto } from '@common/dto/pagination.dto';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPrisma = {
  user: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  role: { findUnique: jest.fn() },
  userRole: {
    create: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
  $queryRawUnsafe: jest.fn(),
};

const mockAuthService = {
  invalidatePermissions: jest.fn(),
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma.user.count.mockResolvedValue(0);
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({});
    mockPrisma.user.update.mockResolvedValue({});
    mockPrisma.authService?.invalidatePermissions?.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  // =========================================================================
  // AC-1: Paginated list with total
  // =========================================================================

  describe('findAll', () => {
    it('returns paginated data with meta', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'u1', email: 'a@test.com', firstName: 'A', middleName: null, lastName: 'User', isActive: true, failedAttempts: 0, lockedUntil: null, lastLoginAt: null, employeeId: null, createdAt: new Date(), updatedAt: new Date() },
      ]);
      mockPrisma.user.count.mockResolvedValue(1);

      const pagination = new PaginationDto();
      pagination.page = 1;
      pagination.limit = 10;

      const result = await service.findAll(pagination);

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
    });
  });

  // =========================================================================
  // AC-2: Create user with hashed password
  // =========================================================================

  describe('create', () => {
    it('hashes the password with argon2', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await service.create({
        email: 'new@test.com',
        password: 'SecureP@ss1',
        firstName: 'New',
        lastName: 'User',
      });

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'new@test.com',
            passwordHash: expect.stringContaining('$argon2'),
          }),
        }),
      );
    });

    it('does not return passwordHash in response', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'u1', email: 'new@test.com', firstName: 'New', middleName: null, lastName: 'User', isActive: true, createdAt: new Date(),
      });

      const result = await service.create({
        email: 'new@test.com', password: 'SecureP@ss1', firstName: 'New', lastName: 'User',
      });

      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('password');
    });

    it('throws ConflictException for duplicate email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create({
          email: 'existing@test.com', password: 'x', firstName: 'X', lastName: 'Y',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // =========================================================================
  // AC-3: Update re-hashes password
  // =========================================================================

  describe('update', () => {
    it('re-hashes password when included in update', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });

      await service.update('u1', {
        password: 'NewP@ssword1',
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            passwordHash: expect.stringContaining('$argon2'),
          }),
        }),
      );
    });

    it('updates other fields without touching password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });

      await service.update('u1', { firstName: 'Updated' });

      const call = mockPrisma.user.update.mock.calls[0][0];
      expect(call.data).not.toHaveProperty('passwordHash');
      expect(call.data.firstName).toBe('Updated');
    });

    it('throws NotFoundException for nonexistent user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { firstName: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // AC-4: Soft delete
  // =========================================================================

  describe('softDelete', () => {
    it('sets isActive=false and deletedAt', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });

      await service.softDelete('u1');

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isActive: false,
            deletedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('invalidates permissions cache', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });

      await service.softDelete('u1');

      expect(mockAuthService.invalidatePermissions).toHaveBeenCalledWith('u1');
    });
  });

  // =========================================================================
  // AC-6: assignRole invalidates cache
  // =========================================================================

  describe('assignRole', () => {
    it('creates user_role and invalidates permissions', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      mockPrisma.role.findUnique.mockResolvedValue({ id: 'r1', name: 'Admin' });

      await service.assignRole('u1', 'r1');

      expect(mockPrisma.userRole.create).toHaveBeenCalledWith({
        data: { userId: 'u1', roleId: 'r1' },
      });
      expect(mockAuthService.invalidatePermissions).toHaveBeenCalledWith('u1');
    });

    it('throws 404 for nonexistent role', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      mockPrisma.role.findUnique.mockResolvedValue(null);

      await expect(
        service.assignRole('u1', 'bad-role'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // AC-7: removeRole invalidates cache
  // =========================================================================

  describe('removeRole', () => {
    it('deletes user_role and invalidates permissions', async () => {
      mockPrisma.userRole.findUnique.mockResolvedValue({ userId: 'u1', roleId: 'r1' });

      await service.removeRole('u1', 'r1');

      expect(mockPrisma.userRole.delete).toHaveBeenCalled();
      expect(mockAuthService.invalidatePermissions).toHaveBeenCalledWith('u1');
    });

    it('throws 404 when role not assigned', async () => {
      mockPrisma.userRole.findUnique.mockResolvedValue(null);

      await expect(
        service.removeRole('u1', 'r1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // AC-8: linkEmployee sets employee_id
  // =========================================================================

  describe('linkEmployee', () => {
    it('sets employeeId on the user record', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });

      await service.linkEmployee('u1', 'emp-42');

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: { employeeId: 'emp-42' },
        }),
      );
    });
  });

  // =========================================================================
  // AC-9: findOne returns 404
  // =========================================================================

  describe('findOne', () => {
    it('throws NotFoundException for nonexistent user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns user with roles when found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'test@test.com',
        firstName: 'Test',
        middleName: null,
        lastName: 'User',
        isActive: true,
        failedAttempts: 0,
        lockedUntil: null,
        lastLoginAt: null,
        employeeId: null,
        totpSecretEncrypted: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        userRoles: [{ role: { id: 'r1', name: 'Admin' } }],
      });

      const user = await service.findOne('u1');
      expect(user).toBeDefined();
      expect(user.roles).toHaveLength(1);
    });
  });
});
