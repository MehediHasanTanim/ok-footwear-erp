import { Module } from '@nestjs/common';

/**
 * Finance module — GL entries, chart of accounts, bank accounts, fixed assets,
 * depreciation, budgets, import/export LCs, delivery challans, buyer invoices.
 *
 * Schema: `fin` (19 tables)
 * Core domain: Double-entry GL → chart of accounts → bank reconciliation →
 *   AR (buyer invoices) → AP (vendor invoices) → fixed asset register →
 *   depreciation (straight-line/reducing balance) → budget vs actual →
 *   import/export LC management.
 *
 * Controllers (Sprint 6+): gl-entries, gl-periods, chart-of-accounts,
 *   bank-accounts, fixed-assets, budgets, import-lcs, export-lcs,
 *   delivery-challans, buyer-invoices
 * Services (Sprint 6+): gl, gl-periods, chart-of-accounts, bank, fixed-assets,
 *   depreciation, budgets, import-lcs, export-lcs, delivery-challans,
 *   buyer-invoices
 */
@Module({
  imports: [],
  controllers: [],
  providers: [],
  exports: [],
})
export class FinanceModule {}
