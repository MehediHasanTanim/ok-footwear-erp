// =============================================================================
// TC-ROLES-U — RolesService Unit Tests
// =============================================================================
// OK Footwear ERP — Sprint 2
// =============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { RolesService } from '@modules/system/services/roles.service';
import { PrismaService } from '@shared/database/prisma.service';
import { REDIS_AUTH } from '@infrastructure/redis/redis.constants';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPrisma = {
  role: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  permission: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  rolePermission: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  userRole: {
    findMany: jest.fn(),
  },
};

const mockRedis = {
  pipeline: jest.fn(() => ({
    del: jest.fn(),
    exec: jest.fn().mockResolvedValue([]),
  })),
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('RolesService', () => {
  let service: RolesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: REDIS_AUTH, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<RolesService>(RolesService);
  });

  // =========================================================================
  // CRUD
  // =========================================================================

  describe('CRUD', () => {
    it('findAll returns roles with counts', async () => {
      mockPrisma.role.findMany.mockResolvedValue([
        { id: 'r1', name: 'Admin', description: null, isSystem: false, createdAt: new Date(), _count: { userRoles: 1, rolePermissions: 3 } },
      ]);

      const roles = await service.findAll();
      expect(roles).toHaveLength(1);
    });

    it('create returns new role', async () => {
      mockPrisma.role.create.mockResolvedValue({ id: 'r1', name: 'NewRole', description: null, createdAt: new Date() });

      const role = await service.create({ name: 'NewRole' });
      expect(role.name).toBe('NewRole');
    });

    it('update returns updated role', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({ id: 'r1' });
      mockPrisma.role.update.mockResolvedValue({ id: 'r1', name: 'Updated', description: null, updatedAt: new Date() });

      const role = await service.update('r1', { name: 'Updated' });
      expect(role.name).toBe('Updated');
    });

    it('throws 404 on update nonexistent', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(null);
      await expect(service.update('bad', {})).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // AC-4: Cannot delete role with users
  // =========================================================================

  describe('delete', () => {
    it('throws ConflictException when role has users', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({
        id: 'r1', _count: { userRoles: 3 },
      });

      await expect(service.delete('r1')).rejects.toThrow(ConflictException);
    });

    it('deletes role with no users', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({
        id: 'r1', _count: { userRoles: 0 },
      });

      await service.delete('r1');
      expect(mockPrisma.role.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
    });
  });

  // =========================================================================
  // AC-2: addPermission + bulk cache invalidation
  // =========================================================================

  describe('addPermission', () => {
    it('creates role_permission and invalidates cache for affected users', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({ id: 'r1' });
      mockPrisma.permission.findUnique.mockResolvedValue({ id: 'p1', module: 'orders', action: 'read' });
      mockPrisma.rolePermission.findUnique.mockResolvedValue(null); // no existing assignment

      // 2 users have this role
      mockPrisma.userRole.findMany.mockResolvedValue([
        { userId: 'u1' }, { userId: 'u2' },
      ]);

      await service.addPermission('r1', { permissionId: 'p1' });

      expect(mockPrisma.rolePermission.create).toHaveBeenCalledWith({
        data: { roleId: 'r1', permissionId: 'p1' },
        include: { permission: { select: { module: true, action: true } } },
      });

      // Verify pipeline was used for batch DEL
      expect(mockRedis.pipeline).toHaveBeenCalled();
    });

    it('throws 404 for nonexistent permission', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({ id: 'r1' });
      mockPrisma.permission.findUnique.mockResolvedValue(null);

      await expect(service.addPermission('r1', { permissionId: 'p99' })).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // AC-3: removePermission + bulk cache invalidation
  // =========================================================================

  describe('removePermission', () => {
    it('deletes role_permission and invalidates cache', async () => {
      mockPrisma.rolePermission.findUnique.mockResolvedValue({ roleId: 'r1', permissionId: 'p1' });
      mockPrisma.userRole.findMany.mockResolvedValue([{ userId: 'u1' }]);

      await service.removePermission('r1', 'p1');

      expect(mockPrisma.rolePermission.delete).toHaveBeenCalled();
      expect(mockRedis.pipeline).toHaveBeenCalled();
    });

    it('throws 404 when permission not assigned', async () => {
      mockPrisma.rolePermission.findUnique.mockResolvedValue(null);
      await expect(service.removePermission('r1', 'p99')).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // AC-1: Permission matrix
  // =========================================================================

  describe('getPermissionMatrix', () => {
    it('returns {module: {action: boolean}} nested object', async () => {
      mockPrisma.permission.findMany.mockResolvedValue([
        { module: 'orders', action: 'read' },
        { module: 'orders', action: 'create' },
        { module: 'inventory', action: 'read' },
      ]);

      mockPrisma.rolePermission.findMany.mockResolvedValue([
        { permission: { module: 'orders', action: 'read' } },
        { permission: { module: 'inventory', action: 'read' } },
      ]);

      const matrix = await service.getPermissionMatrix();

      expect(matrix).toEqual({
        orders: { read: true, create: false },
        inventory: { read: true },
      });
    });

    it('returns empty object when no permissions exist', async () => {
      mockPrisma.permission.findMany.mockResolvedValue([]);
      mockPrisma.rolePermission.findMany.mockResolvedValue([]);

      const matrix = await service.getPermissionMatrix();
      expect(matrix).toEqual({});
    });
  });

  // =========================================================================
  // AC-5: Matrix reflects current state
  // =========================================================================

  describe('matrix accuracy', () => {
    it('matrix correctly reflects assigned permissions', async () => {
      const perms = [
        { module: 'system', action: 'users.read' },
        { module: 'system', action: 'users.write' },
        { module: 'orders', action: 'read' },
      ];

      mockPrisma.permission.findMany.mockResolvedValue(perms);

      // Only system.users.read is assigned
      mockPrisma.rolePermission.findMany.mockResolvedValue([
        { permission: { module: 'system', action: 'users.read' } },
      ]);

      const matrix = await service.getPermissionMatrix();

      expect(matrix['system']!['users.read']).toBe(true);
      expect(matrix['system']!['users.write']).toBe(false);
      expect(matrix['orders']!['read']).toBe(false);
    });
  });
});
