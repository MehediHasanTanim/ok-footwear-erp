// =============================================================================
// RbacGuard — Permission-based Access Control
// =============================================================================
// OK Footwear ERP — Sprint 2
//
// Reads the required permission from @Permissions() decorator metadata,
// then checks if the authenticated user (from JWT payload) has that
// permission in their permissions[] array.
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
 * Usage: @Permissions('system.users.write')
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

    if (!user?.permissions) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Insufficient permissions',
      });
    }

    const hasPermission = requiredPerms.some((perm) =>
      user.permissions!.includes(perm),
    );

    if (!hasPermission) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Insufficient permissions',
        detail: `Required: ${requiredPerms.join(', ')}`,
      });
    }

    return true;
  }
}
