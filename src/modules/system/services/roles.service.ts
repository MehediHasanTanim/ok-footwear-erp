// =============================================================================
// RolesService — Role CRUD, Permission Matrix, Cache Invalidation
// =============================================================================
// OK Footwear ERP — Sprint 2, System Module
//
// On any permission change (addPermission/removePermission):
//   1. Find all users assigned to the affected role
//   2. Batch-invalidate their Redis permissions cache via pipeline
//
// Why pipeline: calling DEL N times sequentially would add N round-trips.
// A Redis pipeline sends all DEL commands in a single network call.
// =============================================================================

import {
  Injectable,
  NotFoundException,
  ConflictException,
  Inject,
  Logger,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { PrismaService } from '@shared/database/prisma.service';
import { REDIS_AUTH } from '@infrastructure/redis/redis.constants';
import { CreateRoleDto, UpdateRoleDto } from '../dto/roles.dto';

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_AUTH) private readonly redisAuth: Redis,
  ) {}

  // =========================================================================
  // CRUD
  // =========================================================================

  async findAll() {
    return this.prisma.role.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        isSystem: true,
        createdAt: true,
        _count: { select: { userRoles: true, rolePermissions: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
        _count: { select: { userRoles: true } },
      },
    });

    if (!role) throw new NotFoundException({ statusCode: 404, message: 'Role not found' });

    return {
      ...role,
      permissions: role.rolePermissions.map((rp) => rp.permission),
      userCount: role._count.userRoles,
    };
  }

  async create(dto: CreateRoleDto) {
    return this.prisma.role.create({
      data: { name: dto.name, description: dto.description },
      select: { id: true, name: true, description: true, createdAt: true },
    });
  }

  async update(id: string, dto: UpdateRoleDto) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException({ statusCode: 404, message: 'Role not found' });

    return this.prisma.role.update({
      where: { id },
      data: { name: dto.name, description: dto.description },
      select: { id: true, name: true, description: true, updatedAt: true },
    });
  }

  async delete(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { userRoles: true } } },
    });

    if (!role) throw new NotFoundException({ statusCode: 404, message: 'Role not found' });

    if (role._count.userRoles > 0) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Cannot delete a role that has users assigned',
        detail: `This role has ${role._count.userRoles} user(s). Remove all users first.`,
      });
    }

    await this.prisma.role.delete({ where: { id } });
    this.logger.log(`Role deleted: ${id}`);
  }

  // =========================================================================
  // Permission Management
  // =========================================================================

  async addPermission(
    roleId: string,
    params: { permissionId?: string; module?: string; action?: string },
  ) {
    await this.ensureRoleExists(roleId);

    let permissionId: string;

    if (params.permissionId) {
      // Direct permission ID lookup
      permissionId = params.permissionId;
      const perm = await this.prisma.permission.findUnique({ where: { id: permissionId } });
      if (!perm) throw new NotFoundException({ statusCode: 404, message: 'Permission not found' });
    } else if (params.module && params.action) {
      // Lookup by module + action (composite unique key)
      const perm = await this.prisma.permission.findUnique({
        where: { module_action: { module: params.module, action: params.action } },
      });
      if (!perm) {
        throw new NotFoundException({
          statusCode: 404,
          message: `Permission not found: ${params.module}:${params.action}`,
        });
      }
      permissionId = perm.id;
    } else {
      throw new NotFoundException({
        statusCode: 400,
        message: 'Provide either permissionId or both module and action',
      });
    }

    // Check for duplicate assignment
    const existing = await this.prisma.rolePermission.findUnique({
      where: { roleId_permissionId: { roleId, permissionId } },
    });
    if (existing) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Role already has this permission',
      });
    }

    const rolePermission = await this.prisma.rolePermission.create({
      data: { roleId, permissionId },
      include: { permission: { select: { module: true, action: true } } },
    });

    // Bulk-invalidate cache for all users with this role
    await this.invalidateUsersWithRole(roleId);

    this.logger.log(`Permission ${permissionId} added to role ${roleId}`);
    return {
      roleId,
      permissionId,
      module: rolePermission.permission.module,
      action: rolePermission.permission.action,
    };
  }

  async removePermission(roleId: string, permissionId: string) {
    const existing = await this.prisma.rolePermission.findUnique({
      where: { roleId_permissionId: { roleId, permissionId } },
    });

    if (!existing) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Role does not have this permission',
      });
    }

    await this.prisma.rolePermission.delete({
      where: { roleId_permissionId: { roleId, permissionId } },
    });

    // Bulk-invalidate cache for all users with this role
    await this.invalidateUsersWithRole(roleId);

    this.logger.log(`Permission ${permissionId} removed from role ${roleId}`);
  }

  // =========================================================================
  // Permission Matrix
  // =========================================================================

  /**
   * Returns all available permissions (id, module, action, description).
   * Used by the frontend to populate permission dropdowns/selectors.
   */
  async findAllPermissions() {
    return this.prisma.permission.findMany({
      select: { id: true, module: true, action: true, description: true },
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });
  }

  /**
   * Returns all modules × actions as a nested boolean grid.
   *
   * Shape: { moduleName: { actionName: true/false } }
   *
   * This is consumed by the frontend PermissionMatrix component to render
   * a checkbox grid for role permission editing.
   */
  async getPermissionMatrix(): Promise<Record<string, Record<string, boolean>>> {
    const allPerms = await this.prisma.permission.findMany({
      select: { module: true, action: true },
    });

    const assigned = await this.prisma.rolePermission.findMany({
      include: {
        permission: { select: { module: true, action: true } },
      },
    });

    // Build set of assigned module:action pairs
    const assignedSet = new Set(
      assigned.map((rp) => `${rp.permission.module}:${rp.permission.action}`),
    );

    // Build matrix
    const matrix: Record<string, Record<string, boolean>> = {};
    for (const p of allPerms) {
      if (!matrix[p.module]) matrix[p.module] = {};
      matrix[p.module]![p.action] = assignedSet.has(`${p.module}:${p.action}`);
    }

    return matrix;
  }

  // =========================================================================
  // Cache Invalidation
  // =========================================================================

  /**
   * Find all users assigned to a role and invalidate their permissions cache.
   *
   * Uses Redis pipeline for batch DEL — N keys in one network round-trip.
   */
  private async invalidateUsersWithRole(roleId: string): Promise<void> {
    try {
      const userRoles = await this.prisma.userRole.findMany({
        where: { roleId },
        select: { userId: true },
      });

      if (userRoles.length === 0) return;

      const pipeline = this.redisAuth.pipeline();
      for (const ur of userRoles) {
        pipeline.del(`permissions:${ur.userId}`);
      }

      await pipeline.exec();
      this.logger.debug(
        `Invalidated permissions cache for ${userRoles.length} user(s) affected by role ${roleId}`,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to invalidate permission cache for role ${roleId}`,
        (err as Error).message,
      );
    }
  }

  private async ensureRoleExists(id: string) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException({ statusCode: 404, message: 'Role not found' });
  }
}
