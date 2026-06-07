import { Module } from '@nestjs/common';

/**
 * Manufacturing module — BOM, cost sheets, production orders, daily production,
 * QC results, machines, lasts & moulds, scrap.
 *
 * Schema: `mfg` (15 tables)
 * Core domain: Bill of Materials → cost sheet → production order → daily
 *   production tracking → QC inspection → scrap/wastage.
 *
 * Controllers (Sprint 9+): bom, cost-sheets, production-orders,
 *   daily-productions, qc-results, machines, lasts-moulds, scrap
 * Services (Sprint 9+): bom, cost-sheets, production-orders, daily-productions,
 *   qc-results, machines, lasts-moulds, scrap
 */
@Module({
  imports: [],
  controllers: [],
  providers: [],
  exports: [],
})
export class ManufacturingModule {}
