# Sprint 9 — Manufacturing BOM Versioning & Cost Sheets

> Backend only. Status: Implemented  
> Baseline: Empty [`ManufacturingModule`](../../src/modules/manufacturing/manufacturing.module.ts); stub `mfg.bom_headers` (`bom_code` / integer version)

Align `mfg` BOM + cost sheets to [`docs/design/OK_Footwear_ERP_Schema.sql`](../design/OK_Footwear_ERP_Schema.sql) plus sprint table `bom_size_overrides`. Nest patterns: `@Permissions`, RFC 7807, Jest unit + integration.

---

## Locked decisions

| Decision | Choice |
|---|---|
| Stub table | DROP and recreate `mfg.bom_headers` from design SQL |
| Status | `draft` \| `approved` \| `superseded`. Dual PM+Finance sign-off deferred |
| Active BOM | `UNIQUE (article_id, version)` + partial unique one `approved` per article |
| Size overrides | `mfg.bom_size_overrides (bom_id, item_id, size_label, qty_per_unit)` |
| Vendor rates | Latest non-cancelled PO line `unit_price`; else max `stock_balances.avg_cost`; else 0 + `rateSource` |
| Labour / overhead | DTO inputs (SAM deferred to Sprint 10) |
| Selling price | `total_cost × (1 + margin_pct/100)` persisted |
| Template sheet | Partial unique `(bom_id) WHERE order_id IS NULL` |
| ProductionBlockGuard | `BomService.assertApprovedBom`; S10 wires `@UseGuards` on production-order create |
| Quotations | Populate from approved BOM template cost sheet (replaces 501) |
| Frontend | Out of scope |

DTO aliases: `qtyPerUnit` → `quantity_per_pair`; `targetMarginPct` → `margin_pct`.

---

## API (`/api/v1`)

| Method | Path | Perm |
|---|---|---|
| POST | `/manufacturing/bom` | create |
| GET | `/articles/:id/bom` | manufacturing:read (approved) |
| GET | `/articles/:id/bom/versions` | manufacturing:read |
| GET/PATCH | `/manufacturing/bom/:id` | read / update (draft) |
| POST | `/manufacturing/bom/:id/approve` | approve |
| GET/POST | `/manufacturing/bom/:id/cost-sheet` | read / create |
| PATCH | `/manufacturing/cost-sheets/:id` | update |

After schema/code: `docker compose up -d --build nestjs` and `GET /api/v1/health`.
