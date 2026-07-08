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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request, Response } from 'express';
import {
  AuthService,
  LoginDto,
  LoginResult,
  LoginSuccess,
} from '../services/auth.service';
import { TotpService } from '../services/totp.service';
import { JwtAuthGuard, JwtPayload } from '@common/guards/jwt-auth.guard';

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
  ) {}

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Authenticate with email + password' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
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
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  getMe(@Req() req: Request): JwtPayload {
    return (req as unknown as Record<string, unknown>)['user'] as JwtPayload;
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
}
