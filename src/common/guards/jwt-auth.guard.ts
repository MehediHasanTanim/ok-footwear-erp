import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

/**
 * JWT authentication guard stub.
 *
 * Full implementation in Sprint 2 (Auth module). Currently allows all requests
 * so the application can start without auth dependencies.
 *
 * Final implementation will:
 * 1. Extract Bearer token from Authorization header.
 * 2. Verify JWT signature (HS256) using ConfigService secret.
 * 3. Check Redis for blacklisted tokens (logout/refresh rotation).
 * 4. Attach decoded payload to request.user.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    // DEVIATION: Stub — always allows. Replace in Sprint 2.
    return true;
  }
}
