// =============================================================================
// JwtAuthGuard — JWT Authentication Guard (Sprint 2)
// =============================================================================
// OK Footwear ERP — Sprint 2
//
// Extracts Bearer token from Authorization header, verifies JWT signature,
// and attaches the decoded payload to request.user for downstream use.
// =============================================================================

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

export interface JwtPayload {
  sub: string;
  email: string;
  permissions: string[];
  iat?: number;
  exp?: number;
  mfa?: boolean;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Missing or invalid Authorization header',
      });
    }

    const token = authHeader.slice(7);

    try {
      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: process.env['JWT_SECRET'],
      });

      if (payload.mfa && request.path !== '/api/v1/auth/2fa/verify') {
        throw new UnauthorizedException({
          statusCode: 401,
          message: 'MFA verification required',
        });
      }

      (request as unknown as Record<string, unknown>)['user'] = payload;
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Invalid or expired access token',
      });
    }
  }
}
