// =============================================================================
// UsersService — User CRUD, Role Management, Employee Linking
// =============================================================================
// OK Footwear ERP — Sprint 2, System Module
// =============================================================================

import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '@shared/database/prisma.service';
import { AuthService } from './auth.service';
import { CreateUserDto, UpdateUserDto } from '../dto/users.dto';
import { PaginationDto } from '@common/dto/pagination.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  // =========================================================================
  // CRUD
  // =========================================================================

  async findAll(pagination: PaginationDto) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take: limit,
        where: { deletedAt: null },
        select: {
          id: true,
          email: true,
          firstName: true,
          middleName: true,
          lastName: true,
          isActive: true,
          failedAttempts: true,
          lockedUntil: true,
          lastLoginAt: true,
          employeeId: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where: { deletedAt: null } }),
    ]);

    return {
      data: users,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        middleName: true,
        lastName: true,
        isActive: true,
        failedAttempts: true,
        lockedUntil: true,
        lastLoginAt: true,
        employeeId: true,
        totpSecretEncrypted: true,
        createdAt: true,
        updatedAt: true,
        userRoles: {
          select: {
            role: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!user || user['deletedAt' as keyof typeof user]) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'User not found',
      });
    }

    return {
      ...user,
      roles: user.userRoles.map((ur) => ur.role),
    };
  }

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException({
        statusCode: 409,
        message: 'A user with this email already exists',
      });
    }

    const passwordHash = await argon2.hash(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        middleName: dto.middleName,
        lastName: dto.lastName,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        middleName: true,
        lastName: true,
        isActive: true,
        createdAt: true,
      },
    });

    this.logger.log(`User created: ${user.id}`);
    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException({ statusCode: 404, message: 'User not found' });
    }

    const data: Record<string, unknown> = {};

    if (dto.email !== undefined) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException({
          statusCode: 409,
          message: 'A user with this email already exists',
        });
      }
      data['email'] = dto.email;
    }

    if (dto.password !== undefined) {
      data['passwordHash'] = await argon2.hash(dto.password);
    }

    if (dto.firstName !== undefined) data['firstName'] = dto.firstName;
    if (dto.middleName !== undefined) data['middleName'] = dto.middleName;
    if (dto.lastName !== undefined) data['lastName'] = dto.lastName;
    if (dto.isActive !== undefined) data['isActive'] = dto.isActive;

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        middleName: true,
        lastName: true,
        isActive: true,
        updatedAt: true,
      },
    });

    this.logger.log(`User updated: ${id}`);
    return updated;
  }

  async softDelete(id: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException({ statusCode: 404, message: 'User not found' });
    }

    await this.prisma.user.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });

    // Invalidate permissions cache
    await this.authService.invalidatePermissions(id);

    this.logger.log(`User soft-deleted: ${id}`);
  }

  // =========================================================================
  // Role Management
  // =========================================================================

  async assignRole(userId: string, roleId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException({ statusCode: 404, message: 'User not found' });

    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException({ statusCode: 404, message: 'Role not found' });

    await this.prisma.userRole.create({
      data: { userId, roleId },
    });

    // Invalidate Redis permissions cache
    await this.authService.invalidatePermissions(userId);

    this.logger.log(`Role ${roleId} assigned to user ${userId}`);
    return { userId, roleId, roleName: role.name };
  }

  async removeRole(userId: string, roleId: string) {
    const existing = await this.prisma.userRole.findUnique({
      where: { userId_roleId: { userId, roleId } },
    });

    if (!existing) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'User does not have this role',
      });
    }

    await this.prisma.userRole.delete({
      where: { userId_roleId: { userId, roleId } },
    });

    // Invalidate Redis permissions cache
    await this.authService.invalidatePermissions(userId);

    this.logger.log(`Role ${roleId} removed from user ${userId}`);
  }

  // =========================================================================
  // Employee Linking
  // =========================================================================

  async linkEmployee(userId: string, employeeId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException({ statusCode: 404, message: 'User not found' });

    await this.prisma.user.update({
      where: { id: userId },
      data: { employeeId },
    });

    this.logger.log(`User ${userId} linked to employee ${employeeId}`);
    return { userId, employeeId };
  }
}
