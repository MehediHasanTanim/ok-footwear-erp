import { Module } from '@nestjs/common';

/**
 * Procurement module — vendors, purchase orders, goods receipt notes (GRN),
 * vendor invoices, tenders.
 *
 * Schema: `prc` (10 tables)
 * Core domain: Procure-to-pay cycle — vendor management → purchase requisition
 *   → PO → GRN → quality inspection → vendor invoice → payment.
 *
 * Controllers (Sprint 5+): vendors, purchase-orders, goods-receipts,
 *   vendor-invoices, tenders
 * Services (Sprint 5+): vendors, purchase-orders, goods-receipts,
 *   vendor-invoices, tenders
 */
@Module({
  imports: [],
  controllers: [],
  providers: [],
  exports: [],
})
export class ProcurementModule {}
