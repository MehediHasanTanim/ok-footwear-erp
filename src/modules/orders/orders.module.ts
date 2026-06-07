import { Module } from '@nestjs/common';

/**
 * Orders module — orders, buyers, articles, quotations, samples, complaints.
 *
 * Schema: `ord` (9 tables)
 * Core domain: Order lifecycle from quotation → sample → PI → LC → production
 *   → inspection → shipment → complaint.
 *
 * Controllers (Sprint 3+): orders, buyers, articles, quotations, samples,
 *   complaints
 * Services (Sprint 3+): orders, buyers, articles, quotations, samples,
 *   complaints, capa
 */
@Module({
  imports: [],
  controllers: [],
  providers: [],
  exports: [],
})
export class OrdersModule {}
