import { Module } from '@nestjs/common';

import { HealthController } from './controllers/health.controller';

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
  imports: [],
  controllers: [HealthController],
  providers: [],
  exports: [],
})
export class SystemModule {}
