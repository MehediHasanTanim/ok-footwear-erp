// =============================================================================
// AuthController — Authentication Endpoints
// =============================================================================
// OK Footwear ERP — Sprint 2, System Module
// =============================================================================

import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  HttpCode,
  UseGuards,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { Request, Response } from 'express';
import {
  AuthService,
  LoginResult,
  LoginSuccess,
} from '../services/auth.service';
import { TotpService } from '../services/totp.service';
import { JwtAuthGuard, JwtPayload } from '@common/guards/jwt-auth.guard';
import { LoginDto, LoginResponseDto, MfaRequiredDto, ChangePasswordDto } from '../dto/auth.dto';
import { PrismaService } from '@shared/database/prisma.service';

const REFRESH_COOKIE = {
  httpOnly: true,
  secure: process.env['NODE_ENV'] === 'production',
  sameSite: 'strict' as const,
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: '/',
};

const CLEAR_COOKIE = {
  httpOnly: true,
  secure: process.env['NODE_ENV'] === 'production',
  sameSite: 'strict' as const,
  maxAge: 0,
  path: '/',
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly totpService: TotpService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Authenticate with email + password (+ optional TOTP)' })
  @ApiBody({ type: LoginDto, description: 'Login credentials' })
  @ApiResponse({ status: 200, description: 'Login successful', type: LoginResponseDto })
  @ApiResponse({ status: 200, description: 'MFA required', type: MfaRequiredDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials or account locked' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Omit<LoginResult, 'refreshToken'> & { refreshToken?: never }> {
    const result = await this.authService.login(dto, {
      ipAddress: req.ip ?? undefined,
      userAgent: req.headers['user-agent'] ?? undefined,
    });
    if ('mfaRequired' in result) return result;
    res.cookie('refresh_token', result.refreshToken, REFRESH_COOKIE);
    const { refreshToken: _, ...body } = result;
    return body;
  }

  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Logout — blacklist refresh token' })
  @ApiResponse({ status: 200, description: 'Logged out' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    const token = req.cookies?.['refresh_token'];
    if (token) await this.authService.blacklistToken(token);
    res.cookie('refresh_token', '', CLEAR_COOKIE);
    return { message: 'Logged out successfully' };
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate refresh token' })
  @ApiResponse({ status: 200, description: 'Tokens rotated' })
  @ApiResponse({ status: 401, description: 'Invalid or missing refresh token' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Omit<LoginSuccess, 'refreshToken'>> {
    const token = req.cookies?.['refresh_token'];
    if (!token) throw new UnauthorizedException({ statusCode: 401, message: 'Refresh token is missing' });
    const result = await this.authService.refresh(token, {
      ipAddress: req.ip ?? undefined,
      userAgent: req.headers['user-agent'] ?? undefined,
    });
    res.cookie('refresh_token', result.refreshToken, REFRESH_COOKIE);
    const { refreshToken: _, ...body } = result;
    return body;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile (JWT payload)' })
  @ApiResponse({ status: 200, description: 'User profile' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  getMe(@Req() req: Request): JwtPayload {
    return (req as unknown as Record<string, unknown>)['user'] as JwtPayload;
  }

  @Get('me/profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get full user profile including roles and permissions' })
  @ApiResponse({ status: 200, description: 'Full user profile with roles' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  async getMyProfile(@Req() req: Request) {
    const jwt = (req as unknown as Record<string, unknown>)['user'] as JwtPayload;

    const user = await this.prisma.user.findUnique({
      where: { id: jwt.sub },
      select: {
        id: true,
        email: true,
        firstName: true,
        middleName: true,
        lastName: true,
        isActive: true,
        employeeId: true,
        lastLoginAt: true,
        createdAt: true,
        userRoles: {
          select: {
            role: {
              select: {
                id: true,
                name: true,
                description: true,
                isSystem: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'User not found',
      });
    }

    return {
      ...user,
      userRoles: undefined,
      roles: user.userRoles.map((ur) => ur.role),
      permissions: jwt.permissions,
    };
  }

  @Post('2fa/setup')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set up 2FA — returns secret + QR URL' })
  @ApiResponse({ status: 200, description: '2FA setup data' })
  async setup2fa(): Promise<{ secret: string; encrypted: string; otpauthUrl: string }> {
    return this.totpService.setup2fa();
  }

  @Post('2fa/verify')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify TOTP token and enable 2FA' })
  @ApiResponse({ status: 200, description: '2FA enabled' })
  @ApiResponse({ status: 400, description: 'Invalid TOTP token' })
  async verify2fa(
    @Body('token') token: string,
    @Body('encryptedSecret') encryptedSecret: string,
  ): Promise<{ verified: boolean }> {
    const verified = this.totpService.verify(token, encryptedSecret);
    return { verified };
  }

  @Post('2fa/disable')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disable 2FA' })
  @ApiResponse({ status: 200, description: '2FA disabled' })
  disable2fa(): { message: string } {
    this.totpService.disable2fa();
    return { message: '2FA disabled' };
  }

  // =========================================================================
  // POST /auth/change-password
  // =========================================================================

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password (requires current password)' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 401, description: 'Current password is incorrect' })
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    const jwt = (req as unknown as Record<string, unknown>)['user'] as JwtPayload;

    await this.authService.changePassword(
      jwt.sub,
      dto.currentPassword,
      dto.newPassword,
      {
        ipAddress: req.ip ?? undefined,
        userAgent: req.headers['user-agent'] ?? undefined,
      },
    );

    return { message: 'Password changed successfully. Please log in again on all devices.' };
  }
}
