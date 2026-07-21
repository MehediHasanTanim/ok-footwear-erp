// =============================================================================
// RbacGuard — Permission-based Access Control
// =============================================================================
// OK Footwear ERP — Sprint 2
//
// Reads the required permission from @Permissions() decorator metadata,
// then checks if the authenticated user (from JWT payload) has that
// permission in their permissions[] array.
//
// Wildcard support:
//   *:*           — Super Admin: bypasses ALL permission checks
//   module:*      — Module-level wildcard: grants all actions in a module
//                    e.g., system:* matches system:read, system:create, etc.
// =============================================================================

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Decorator: declare required permission for a route.
 * Supports wildcard patterns:
 *   @Permissions('system:read')       — exact match
 *   @Permissions('orders:create')     — exact match
 *
 * Wildcard matching is handled in the guard, not the decorator:
 *   User with system:* can access @Permissions('system:read')
 *   User with *:* can access everything (Super Admin)
 */
export const Permissions = (...perms: string[]): MethodDecorator => {
  return (
    target: object,
    _key?: string | symbol,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    descriptor?: any,
  ) => {
    if (descriptor) {
      Reflect.defineMetadata(PERMISSIONS_KEY, perms, descriptor.value);
    } else {
      Reflect.defineMetadata(PERMISSIONS_KEY, perms, target);
    }
  };
};

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPerms = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No permissions required = public endpoint
    if (!requiredPerms || requiredPerms.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as unknown as Record<string, unknown>)['user'] as
      | { permissions?: string[] }
      | undefined;

    if (!user?.permissions || user.permissions.length === 0) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Insufficient permissions',
        detail: 'No permissions in token',
      });
    }

    // -------------------------------------------------------------------
    // Wildcard check: *:* grants access to everything (Super Admin)
    // -------------------------------------------------------------------
    if (user.permissions.includes('*:*')) {
      return true;
    }

    // -------------------------------------------------------------------
    // Permission matching with module-level wildcards
    // -------------------------------------------------------------------
    const hasPermission = requiredPerms.some((required) => {
      // Direct match
      if (user.permissions!.includes(required)) return true;

      // Module wildcard: user has "system:*" and required is "system:read"
      const [reqModule] = required.split(':');
      if (reqModule && user.permissions!.includes(`${reqModule}:*`)) return true;

      return false;
    });

    if (!hasPermission) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Insufficient permissions',
        detail: `Required: [${requiredPerms.join(', ')}]. User has ${user.permissions.length} permissions including wildcard: ${user.permissions.includes('*:*')}`,
      });
    }

    return true;
  }
}
