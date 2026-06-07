import { Module } from '@nestjs/common';

/**
 * Inventory module — stock items, warehouses, stock transactions, stock counts.
 *
 * Schema: `inv` (8 tables)
 * Core domain: Warehouse management → stock items → GRN receipt transactions →
 *   production issue/return → FG receipt → dispatch → periodic stock counts.
 *
 * Controllers (Sprint 7+): stock-items, warehouses, stock-transactions,
 *   stock-counts
 * Services (Sprint 7+): stock-items, warehouses, stock-transactions,
 *   stock-counts
 */
@Module({
  imports: [],
  controllers: [],
  providers: [],
  exports: [],
})
export class InventoryModule {}
