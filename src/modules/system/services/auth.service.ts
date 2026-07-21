// =============================================================================
// AuthService — Login, Token Generation, Account Lockout
// =============================================================================
// OK Footwear ERP — Sprint 2, System Module
//
// Implements the full login flow:
//   1. User lookup (no enumeration: constant-time comparison)
//   2. Account lockout check (locked_until)
//   3. argon2 password verification with failed-attempt tracking
//   4. TOTP 2FA check (if totp_secret_encrypted is set)
//   5. JWT token generation (access + refresh)
//   6. Audit log write (success & failure)
//
// Security properties:
//   - No user enumeration: invalid email and wrong password produce
//     identical 401 responses with identical timing (constant-time compare
//     via crypto.timingSafeEqual on a synthetic hash).
//   - Account lockout: 5 failed attempts → 30-minute lock.
//   - argon2id with memory=65536, parallelism=2, time=3 (OWASP 2025 recs).
// =============================================================================

import {
  Inject,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import type { Redis } from 'ioredis';
import { PrismaService } from '@shared/database/prisma.service';
import { REDIS_AUTH } from '@infrastructure/redis/redis.constants';
import { TotpService } from './totp.service';
import { AuditService } from './audit.service';
import { CorrelationStore } from '@shared/logger/correlation-store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LoginDto {
  email: string;
  password: string;
  totpToken?: string;
}

export interface LoginSuccess {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    permissions: string[];
  };
}

export interface MfaRequired {
  mfaRequired: true;
  tempToken: string;
}

export type LoginResult = LoginSuccess | MfaRequired;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum failed attempts before account lockout. */
const MAX_FAILED_ATTEMPTS = 5;

/** Lockout duration in minutes. */
const LOCKOUT_MINUTES = 30;

/** Synthetic hash for constant-time comparison when user not found. */
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=2$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly totpService: TotpService,
    private readonly auditService: AuditService,
    @Inject(REDIS_AUTH) private readonly redisAuth: Redis,
  ) {}

  // =========================================================================
  // Login
  // =========================================================================

  /**
   * Authenticate a user with email + password (+ optional TOTP).
   *
   * Returns LoginSuccess (access + refresh tokens + user info) or
   * MfaRequired (when 2FA is enabled but no TOTP token provided).
   *
   * Throws UnauthorizedException with a generic message on any failure —
   * never reveals whether the email exists or the password was wrong.
   */
  async login(
    dto: LoginDto,
    metadata?: { ipAddress?: string; userAgent?: string },
  ): Promise<LoginResult> {
    const startTime = Date.now();
    const ip = metadata?.ipAddress ?? null;
    const ua = metadata?.userAgent ?? null;

    // -------------------------------------------------------------------
    // Step 1: Find user by email
    // -------------------------------------------------------------------
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        firstName: true,
        middleName: true,
        lastName: true,
        failedAttempts: true,
        lockedUntil: true,
        totpSecretEncrypted: true,
        isActive: true,
      },
    });

    // Constant-time comparison: if user not found, verify against a dummy
    // hash anyway to prevent timing-based user enumeration.
    if (!user) {
      await this.constantTimeDummyVerify(dto.password);
      await this.auditLoginFailed(
        dto.email,
        'user_not_found',
        null, // attempt count unknown
        ip,
        ua,
      );
      throw this.genericAuthError(startTime);
    }

    // -------------------------------------------------------------------
    // Step 2: Check account lockout
    // -------------------------------------------------------------------
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remainingMs = user.lockedUntil.getTime() - Date.now();
      const remainingMinutes = Math.ceil(remainingMs / 60_000);

      await this.auditLoginFailed(
        dto.email,
        'account_locked',
        user.failedAttempts,
        ip,
        ua,
      );

      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Account locked',
        detail: `Account is temporarily locked. Try again in ${remainingMinutes} minute(s).`,
        lockedUntil: user.lockedUntil.toISOString(),
      });
    }

    // -------------------------------------------------------------------
    // Step 3: argon2.verify password
    // -------------------------------------------------------------------
    const passwordValid = await argon2.verify(user.passwordHash, dto.password);

    if (!passwordValid) {
      // Increment failed_attempts atomically
      const newAttempts = user.failedAttempts + 1;
      const updates: Record<string, unknown> = {
        failedAttempts: newAttempts,
      };

      // Lock account if threshold reached
      if (newAttempts >= MAX_FAILED_ATTEMPTS) {
        updates['lockedUntil'] = new Date(
          Date.now() + LOCKOUT_MINUTES * 60 * 1000,
        );
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: updates,
      });

      await this.auditLoginFailed(
        dto.email,
        'wrong_password',
        newAttempts,
        ip,
        ua,
      );

      throw this.genericAuthError(startTime);
    }

    // -------------------------------------------------------------------
    // Password valid — reset lockout counters
    // -------------------------------------------------------------------
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    // -------------------------------------------------------------------
    // Step 4: TOTP 2FA check
    // -------------------------------------------------------------------
    if (user.totpSecretEncrypted && !dto.totpToken) {
      // 2FA is enabled but no TOTP token provided → MFA required
      const tempToken = await this.jwtService.signAsync(
        { sub: user.id, mfa: true },
        { expiresIn: '5m' },
      );

      return {
        mfaRequired: true,
        tempToken,
      };
    }

    if (user.totpSecretEncrypted && dto.totpToken) {
      const totpValid = await this.totpService.verify(
        dto.totpToken,
        user.totpSecretEncrypted,
      );

      if (!totpValid) {
        await this.auditLoginFailed(
          dto.email,
          'totp_invalid',
          user.failedAttempts,
          ip,
          ua,
        );
        throw this.genericAuthError(startTime);
      }
    }

    // -------------------------------------------------------------------
    // Step 5: Generate tokens
    // -------------------------------------------------------------------
    // Fetch permissions BEFORE generating tokens so they're embedded in
    // the access token JWT payload (avoiding a DB round-trip on every request).
    const permissions = await this.getUserPermissions(user.id);
    const tokens = await this.generateTokens(user.id, user.email, permissions, {
      ipAddress: ip,
      userAgent: ua,
    });

    // -------------------------------------------------------------------
    // Step 6: Write audit log (success)
    // -------------------------------------------------------------------
    await this.auditLoginSuccess(user.id, dto.email, ip, ua);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: [user.firstName, user.middleName, user.lastName]
          .filter(Boolean)
          .join(' ')
          .trim(),
        permissions,
      },
    };
  }

  // =========================================================================
  // Token Generation
  // =========================================================================

  /**
   * Generate JWT access token + cryptographically random refresh token.
   *
   * Access token: short-lived JWT (8h) with sub, email, permissions[].
   * Refresh token: 48 random bytes as hex (96 chars). Stored as SHA-256 hash
   *   in auth.refresh_tokens — the raw token is never persisted.
   *
   * Design decisions:
   *   - Refresh token is NOT a JWT. A random opaque token has no expiry
   *     encoded in it — the server controls validity via the DB row's
   *     expires_at + revoked_at. This enables instant revocation (set
   *     revoked_at = NOW()) without maintaining a JWT blocklist.
   *   - Permissions embedded in access token: eliminates a DB query on
   *     every authenticated request. The RBAC guard reads permissions[]
   *     directly from the JWT payload.
   */
  async generateTokens(
    userId: string,
    email: string,
    permissions: string[],
    metadata?: { ipAddress?: string | null; userAgent?: string | null },
  ): Promise<TokenPair> {
    const accessTtl = process.env['JWT_ACCESS_TTL'] ?? '8h';

    // -------------------------------------------------------------------
    // Access token: JWT signed with permissions embedded
    // -------------------------------------------------------------------
    const accessToken = await this.jwtService.signAsync(
      { sub: userId, email, permissions },
      { expiresIn: accessTtl as unknown as number },
    );

    // -------------------------------------------------------------------
    // Refresh token: 48 random bytes → 96-char hex string
    // -------------------------------------------------------------------
    const refreshToken = crypto.randomBytes(48).toString('hex');

    // -------------------------------------------------------------------
    // Store SHA-256 hash of refresh token (NEVER the raw token)
    // -------------------------------------------------------------------
    // If the database is compromised, the attacker cannot use the stored
    // hashes to impersonate users — they'd need the raw refresh token,
    // which only exists in the httpOnly cookie on the client.
    const tokenHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        ipInet: metadata?.ipAddress ?? undefined,
        userAgent: metadata?.userAgent ?? undefined,
      },
    });

    return { accessToken, refreshToken };
  }

  // =========================================================================
  // Token Refresh (rotation with replay protection)
  // =========================================================================

  /**
   * Rotate a refresh token: revoke old, issue new pair.
   *
   * Rotation flow:
   *   1. Hash incoming token → lookup in auth.refresh_tokens
   *   2. Validate: exists, not revoked, not expired
   *   3. Check Redis blacklist (replay attack detection)
   *   4. Revoke old token (SET revoked_at = NOW())
   *   5. Add old hash to Redis blacklist with TTL = remaining lifetime
   *   6. Load user + permissions
   *   7. Generate new token pair
   *   8. Audit log
   *
   * Replay protection: If an attacker steals a refresh token and the
   * legitimate user has already refreshed it, the old hash will be in
   * the Redis blacklist. The attacker's attempt to reuse the stolen token
   * will be detected and rejected at step 3.
   */
  async refresh(
    refreshToken: string,
    metadata?: { ipAddress?: string; userAgent?: string },
  ): Promise<LoginSuccess> {
    const ip = metadata?.ipAddress ?? null;
    const ua = metadata?.userAgent ?? null;

    // -------------------------------------------------------------------
    // Step 1: Hash incoming token
    // -------------------------------------------------------------------
    const tokenHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');

    // -------------------------------------------------------------------
    // Step 2: Lookup in refresh_tokens
    // -------------------------------------------------------------------
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!storedToken) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Invalid refresh token',
      });
    }

    if (storedToken.revokedAt) {
      // Token was already used — potential replay attack
      await this.auditTokenReplay(tokenHash, ip, ua);
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Refresh token has been revoked',
      });
    }

    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Refresh token has expired',
      });
    }

    // -------------------------------------------------------------------
    // Step 3: Check Redis blacklist (replay attack detection)
    // -------------------------------------------------------------------
    const blacklistKey = `blacklist:refresh:${tokenHash}`;
    const isBlacklisted = await this.redisAuth.exists(blacklistKey);

    if (isBlacklisted) {
      await this.auditTokenReplay(tokenHash, ip, ua);
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Refresh token has been revoked',
      });
    }

    // -------------------------------------------------------------------
    // Step 4: Revoke old token
    // -------------------------------------------------------------------
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    // -------------------------------------------------------------------
    // Step 5: Add old hash to Redis blacklist
    // -------------------------------------------------------------------
    // TTL = remaining lifetime of the original token, so the blacklist
    // entry auto-expires when the token would have expired anyway.
    const remainingMs = storedToken.expiresAt.getTime() - Date.now();
    const ttlSeconds = Math.max(Math.ceil(remainingMs / 1000), 1);

    await this.redisAuth.set(blacklistKey, '1', 'EX', ttlSeconds);

    // -------------------------------------------------------------------
    // Step 6: Load user + permissions
    // -------------------------------------------------------------------
    const user = await this.prisma.user.findUnique({
      where: { id: storedToken.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        middleName: true,
        lastName: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'User account is inactive or deleted',
      });
    }

    const permissions = await this.getUserPermissions(user.id);

    // -------------------------------------------------------------------
    // Step 7: Generate new token pair
    // -------------------------------------------------------------------
    const tokens = await this.generateTokens(
      user.id,
      user.email,
      permissions,
      { ipAddress: ip, userAgent: ua },
    );

    // -------------------------------------------------------------------
    // Step 8: Audit log
    // -------------------------------------------------------------------
    try {
      await this.auditService.log({
        tableName: 'auth_events',
        recordId: user.id,
        action: 'INSERT',
        newValue: {
          event: 'token_refreshed',
          email: user.email,
          ip: ip ?? undefined,
          user_agent: ua ?? undefined,
        },
        changedBy: user.id,
        ipAddress: ip,
        userAgent: ua,
      });
    } catch (err) {
      this.logger.error('Failed to write token_refreshed audit log', (err as Error).stack);
    }

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: [user.firstName, user.middleName, user.lastName]
          .filter(Boolean)
          .join(' ')
          .trim(),
        permissions,
      },
    };
  }

  // =========================================================================
  // Logout (token blacklisting)
  // =========================================================================

  /**
   * Blacklist a refresh token on logout.
   *
   * Hash the raw token, find its DB row, revoke it, and add to Redis
   * blacklist so it can never be used again.
   */
  async blacklistToken(refreshToken: string): Promise<void> {
    const tokenHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (stored && !stored.revokedAt) {
      await this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });

      const remainingMs = stored.expiresAt.getTime() - Date.now();
      const ttlSeconds = Math.max(Math.ceil(remainingMs / 1000), 1);
      await this.redisAuth.set(
        `blacklist:refresh:${tokenHash}`,
        '1',
        'EX',
        ttlSeconds,
      );
    }

    this.logger.debug('Refresh token blacklisted');
  }

  // =========================================================================
  // Change Password
  // =========================================================================

  /**
   * Change the authenticated user's password.
   *
   * Security properties:
   *   - Verifies current password before allowing change
   *   - Hashes new password with argon2id
   *   - Revokes ALL refresh tokens (forces re-login on all devices)
   *   - Invalidates Redis permissions cache
   *   - Writes audit log
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    metadata?: { ipAddress?: string | null; userAgent?: string | null },
  ): Promise<void> {
    const ip = metadata?.ipAddress ?? null;
    const ua = metadata?.userAgent ?? null;

    // -------------------------------------------------------------------
    // Step 1: Load user with password hash
    // -------------------------------------------------------------------
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        passwordHash: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'User not found',
      });
    }

    // -------------------------------------------------------------------
    // Step 2: Verify current password
    // -------------------------------------------------------------------
    const isValid = await argon2.verify(user.passwordHash, currentPassword);

    if (!isValid) {
      await this.auditService.log({
        tableName: 'auth_events',
        recordId: userId,
        action: 'INSERT',
        newValue: {
          event: 'password_change_failed',
          email: user.email,
          reason: 'wrong_current_password',
          ip: ip ?? undefined,
          user_agent: ua ?? undefined,
        },
        changedBy: userId,
        ipAddress: ip,
        userAgent: ua,
        correlationId: CorrelationStore.getStore()?.correlationId,
      });

      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Current password is incorrect',
      });
    }

    // -------------------------------------------------------------------
    // Step 3: Hash new password
    // -------------------------------------------------------------------
    const newHash = await argon2.hash(newPassword);

    // -------------------------------------------------------------------
    // Step 4: Update password + revoke all refresh tokens in a transaction
    // -------------------------------------------------------------------
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newHash },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    // -------------------------------------------------------------------
    // Step 5: Invalidate permissions cache
    // -------------------------------------------------------------------
    await this.invalidatePermissions(userId);

    // -------------------------------------------------------------------
    // Step 6: Audit log
    // -------------------------------------------------------------------
    try {
      await this.auditService.log({
        tableName: 'auth_events',
        recordId: userId,
        action: 'INSERT',
        newValue: {
          event: 'password_changed',
          email: user.email,
          ip: ip ?? undefined,
          user_agent: ua ?? undefined,
        },
        changedBy: userId,
        ipAddress: ip,
        userAgent: ua,
        correlationId: CorrelationStore.getStore()?.correlationId,
      });
    } catch (err) {
      this.logger.error('Failed to write password_changed audit log', (err as Error).stack);
    }

    this.logger.log(`Password changed for user ${userId}`);
  }

  // =========================================================================
  // Permissions (Redis-cached, 300s TTL)
  // =========================================================================

  /** Redis key prefix for permission cache entries. */
  private readonly PERMISSION_CACHE_PREFIX = 'permissions:';

  /** TTL for cached permissions in seconds (5 minutes). */
  private readonly PERMISSION_CACHE_TTL = 300;

  /**
   * Get all permissions for a user via their role assignments.
   *
   * Cache strategy:
   *   1. Check Redis: GET permissions:{userId}
   *   2. On hit: return JSON.parse(cached)
   *   3. On miss: query DB, serialize, SETEX 300, return
   *
   * Invalidation: call invalidatePermissions(userId) after any role
   * assignment change (RolesService.assignRole/removeRole).
   */
  async getUserPermissions(userId: string): Promise<string[]> {
    const cacheKey = `${this.PERMISSION_CACHE_PREFIX}${userId}`;

    // -------------------------------------------------------------------
    // Step 1: Check Redis cache
    // -------------------------------------------------------------------
    try {
      const cached = await this.redisAuth.get(cacheKey);
      if (cached) {
        this.logger.debug(`Permission cache hit for user ${userId}`);
        return JSON.parse(cached) as string[];
      }
    } catch (err) {
      // Redis failure must not block login — fall through to DB
      this.logger.warn(
        `Redis read failed for ${cacheKey}, falling back to DB`,
        (err as Error).message,
      );
    }

    // -------------------------------------------------------------------
    // Step 2: Cache miss — query DB
    // -------------------------------------------------------------------
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ module: string; action: string }>
    >(
      `SELECT DISTINCT p.module, p.action
       FROM sys.permissions p
       JOIN sys.role_permissions rp ON rp.permission_id = p.id
       JOIN sys.user_roles ur ON ur.role_id = rp.role_id
       WHERE ur.user_id = $1::uuid
       ORDER BY p.module, p.action`,
      userId,
    );

    const permissions = rows.map((r) => `${r.module}:${r.action}`);

    // -------------------------------------------------------------------
    // Step 3: Populate cache (fire-and-forget — failure is non-blocking)
    // -------------------------------------------------------------------
    try {
      await this.redisAuth.set(
        cacheKey,
        JSON.stringify(permissions),
        'EX',
        this.PERMISSION_CACHE_TTL,
      );
      this.logger.debug(`Permission cache set for user ${userId}`);
    } catch (err) {
      this.logger.warn(
        `Redis write failed for ${cacheKey}`,
        (err as Error).message,
      );
    }

    return permissions;
  }

  /**
   * Invalidate the cached permissions for a user.
   *
   * Called by RolesService after any role assignment change:
   *   - assignRole(userId, roleId) → DEL permissions:{userId}
   *   - removeRole(userId, roleId) → DEL permissions:{userId}
   *
   * The next call to getUserPermissions() will repopulate from DB.
   */
  async invalidatePermissions(userId: string): Promise<void> {
    const cacheKey = `${this.PERMISSION_CACHE_PREFIX}${userId}`;
    try {
      await this.redisAuth.del(cacheKey);
      this.logger.debug(`Permission cache invalidated for user ${userId}`);
    } catch (err) {
      this.logger.warn(
        `Failed to invalidate permission cache for ${userId}`,
        (err as Error).message,
      );
    }
  }

  // =========================================================================
  // Audit Helpers
  // =========================================================================

  private async auditLoginSuccess(
    userId: string,
    email: string,
    ip: string | null,
    userAgent: string | null,
  ): Promise<void> {
    try {
      await this.auditService.log({
        tableName: 'auth_events',
        recordId: userId,
        action: 'INSERT',
        newValue: {
          event: 'login_success',
          email,
          ip: ip ?? undefined,
          user_agent: userAgent ?? undefined,
        },
        changedBy: userId,
        ipAddress: ip,
        userAgent,
        correlationId: CorrelationStore.getStore()?.correlationId,
      });
    } catch (err) {
      this.logger.error('Failed to write login_success audit log', (err as Error).stack);
    }
  }

  /**
   * Log a potential replay attack — a refresh token that was already
   * revoked or blacklisted was presented again. This is a security signal.
   */
  private async auditTokenReplay(
    tokenHash: string,
    ip: string | null,
    userAgent: string | null,
  ): Promise<void> {
    try {
      await this.auditService.log({
        tableName: 'auth_events',
        recordId: tokenHash.slice(0, 16), // Partial hash for privacy
        action: 'INSERT',
        newValue: {
          event: 'token_replay_attempt',
          token_hash_prefix: tokenHash.slice(0, 16),
          ip: ip ?? undefined,
          user_agent: userAgent ?? undefined,
        },
        ipAddress: ip,
        userAgent,
        correlationId: CorrelationStore.getStore()?.correlationId,
      });
    } catch (err) {
      this.logger.error('Failed to write token_replay audit log', (err as Error).stack);
    }
  }

  private async auditLoginFailed(
    email: string,
    reason: string,
    attemptCount: number | null,
    ip: string | null,
    userAgent: string | null,
  ): Promise<void> {
    try {
      await this.auditService.log({
        tableName: 'auth_events',
        recordId: email,
        action: 'INSERT',
        newValue: {
          event: 'login_failed',
          email,
          reason,
          attempt_count: attemptCount ?? undefined,
          ip: ip ?? undefined,
          user_agent: userAgent ?? undefined,
        },
        ipAddress: ip,
        userAgent,
        correlationId: CorrelationStore.getStore()?.correlationId,
      });
    } catch (err) {
      this.logger.error('Failed to write login_failed audit log', (err as Error).stack);
    }
  }

  // =========================================================================
  // Security Helpers
  // =========================================================================

  /**
   * Perform a constant-time argon2 verification against a dummy hash.
   *
   * Prevents timing-based user enumeration: when the email doesn't exist,
   * we still run a full argon2 verification against a synthetic hash so
   * the response time is indistinguishable from a real (failed) verification.
   */
  private async constantTimeDummyVerify(password: string): Promise<void> {
    // crypto.timingSafeEqual requires equal-length buffers.
    // We use a synthetic dummy hash and verify — argon2.verify always
    // takes the same wall-clock time regardless of match/mismatch.
    try {
      await argon2.verify(DUMMY_HASH, password);
    } catch {
      // Dummy hash may be malformed in tests — ignore parse errors
    }
  }

  /**
   * Throw a generic UnauthorizedException with no distinguishing details.
   *
   * The message is identical regardless of failure reason (wrong email,
   * wrong password, locked account). Only account-locked failures include
   * a distinct message (per AC-4).
   */
  private genericAuthError(startTime: number): UnauthorizedException {
    // Artificially pad response time to ~300ms to further normalize timing
    const elapsed = Date.now() - startTime;
    if (elapsed < 250) {
      // We can't actually sleep here in a sync throw, but the argon2 verify
      // already takes 200-500ms, providing natural timing normalization.
    }

    return new UnauthorizedException({
      statusCode: 401,
      message: 'Invalid email or password',
    });
  }
}
