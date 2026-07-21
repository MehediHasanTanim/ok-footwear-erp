import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { BullModule } from '@nestjs/bullmq';

import { RedisModule } from '@infrastructure/redis';
import { EMAIL_QUEUE } from '@infrastructure/queue/queue.constants';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RbacGuard } from '@common/guards/rbac.guard';
import { HealthController } from './controllers/health.controller';
import { AuthController } from './controllers/auth.controller';
import { UsersController } from './controllers/users.controller';
import { RolesController } from './controllers/roles.controller';
import { NotificationsController } from './controllers/notifications.controller';
import { AuditController } from './controllers/audit.controller';
import { ComplianceController } from './controllers/compliance.controller';
import { AuthService } from './services/auth.service';
import { TotpService } from './services/totp.service';
import { AuditService } from './services/audit.service';
import { UsersService } from './services/users.service';
import { RolesService } from './services/roles.service';
import { NotificationsService } from './services/notifications.service';
import { SSEService } from './services/sse.service';
import { ComplianceService } from './services/compliance.service';

/**
 * System module — authentication, RBAC, users, roles, permissions, audit logs,
 * notifications, and compliance tracking.
 *
 * This module is imported first in AppModule because all other modules depend
 * on its auth/RBAC services.
 *
 * Controllers (Sprint 2+): auth, users, roles, permissions, audit-logs,
 *   notifications, compliance
 * Services (Sprint 2+): auth, users, roles, permissions, audit, notifications,
 *   compliance, totp
 */
@Module({
  imports: [
    RedisModule,
    BullModule.registerQueue({ name: EMAIL_QUEUE }),
    JwtModule.register({
      secret: process.env['JWT_SECRET'] ?? 'dev-secret-do-not-use-in-production',
      signOptions: {
        expiresIn: (process.env['JWT_ACCESS_TTL'] ?? '8h') as unknown as number,
      },
    }),
  ],
  controllers: [HealthController, AuthController, UsersController, RolesController, NotificationsController, AuditController, ComplianceController],
  providers: [AuthService, TotpService, AuditService, UsersService, RolesService, NotificationsService, SSEService, ComplianceService, JwtAuthGuard, RbacGuard],
  exports: [AuthService, TotpService, AuditService, UsersService, RolesService, NotificationsService, ComplianceService, JwtModule, JwtAuthGuard, RbacGuard],
})
export class SystemModule {}
