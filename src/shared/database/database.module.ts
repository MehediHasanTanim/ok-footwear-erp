import { Module, Global } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/**
 * Database module — provides PrismaService globally.
 *
 * @Global decorator: PrismaService is available in every feature module
 * without requiring explicit imports of DatabaseModule.
 *
 * Lifecycle:
 * - onModuleInit: PrismaService.$connect() — opens connections to PgBouncer.
 * - onModuleDestroy: PrismaService.$disconnect() — graceful shutdown.
 *
 * PgBouncer transaction mode:
 * - DATABASE_URL includes ?pgbouncer=true → Prisma disables prepared statements.
 * - connection_limit=20 in schema.prisma datasource → max 20 conns to PgBouncer.
 * - PgBouncer multiplexes these onto its own pool of PostgreSQL connections.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
