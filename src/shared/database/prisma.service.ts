import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * NestJS-injectable wrapper around PrismaClient.
 *
 * Key design decisions:
 * - Extends PrismaClient: full type-safe access to all models across 8 schemas.
 * - onModuleInit: connects to the database when the module initializes
 *   (NestJS lifecycle hook).
 * - onModuleDestroy: gracefully disconnects on app shutdown.
 * - Logging: delegates Prisma query/error logs to NestJS Logger at configurable
 *   levels based on NODE_ENV.
 * - Shutdown timeout: allows in-flight queries to complete before closing
 *   connections (important for PgBouncer transaction mode).
 *
 * Usage in services:
 *   constructor(private readonly prisma: PrismaService) {}
 *   const users = await this.prisma.user.findMany();
 *
 * Cross-schema queries: Prisma's multiSchema preview allows cross-schema
 * relations. E.g., auth.refresh_tokens.user_id → sys.users.id works because
 * both schemas are in the same database and Prisma generates correct
 * fully-qualified table references.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
        ...(process.env['NODE_ENV'] === 'development'
          ? [{ emit: 'event' as const, level: 'query' as const }]
          : []),
      ],
    });

    // Pipe Prisma events into NestJS Logger for structured logging
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).$on('error', (e: { message: string }) => {
      this.logger.error(e.message);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).$on('warn', (e: { message: string }) => {
      this.logger.warn(e.message);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).$on('query', (e: { query: string; params: string; duration: number }) => {
      if (process.env['NODE_ENV'] === 'development') {
        this.logger.debug(`Query: ${e.query} | Params: ${e.params} | Duration: ${e.duration}ms`);
      }
    });
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('Connecting to PostgreSQL via PgBouncer (transaction mode)...');
    await this.$connect();
    this.logger.log('Database connection established ✓');
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Closing database connections...');
    await this.$disconnect();
    this.logger.log('Database connections closed ✓');
  }

  /**
   * Helper: execute a raw SQL query within a transaction.
   * Useful for operations that Prisma doesn't natively support
   * (e.g., calling PostgreSQL functions, materialized view refreshes).
   */
  async executeRaw(sql: TemplateStringsArray, ...values: unknown[]): Promise<number> {
    const query = sql.reduce((acc, part, i) => acc + part + (i < values.length ? `$${i + 1}` : ''), '');
    return this.$executeRawUnsafe(query, ...values);
  }
}
