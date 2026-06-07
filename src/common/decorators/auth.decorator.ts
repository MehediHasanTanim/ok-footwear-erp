/**
 * Authentication decorators.
 *
 * @CurrentUser — extracts the authenticated user from the request context.
 *   Usage: @CurrentUser() user: JwtPayload
 *   Implementation details: creates a custom parameter decorator that reads
 *   `request.user` set by the JwtAuthGuard.
 *
 * @Roles — declares required roles for a route handler.
 *   Usage: @Roles('admin', 'finance_manager')
 *   Evaluated by RbacGuard.
 *
 * @Permissions — declares required permissions (resource + action).
 *   Usage: @Permissions('orders', 'create')
 *   Evaluated by RbacGuard for fine-grained control.
 *
 * Stub implementations — full implementations arrive in Sprint 2 (Auth module).
 */
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
