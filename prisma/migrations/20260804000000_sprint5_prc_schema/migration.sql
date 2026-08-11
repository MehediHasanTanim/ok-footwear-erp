-- Sprint 5: Full prc schema (replace thin Vendor / PurchaseOrder stubs)

-- Drop stub dependency graph
ALTER TABLE IF EXISTS "prc"."purchase_orders" DROP CONSTRAINT IF EXISTS "purchase_orders_vendor_id_fkey";
DROP TABLE IF EXISTS "prc"."purchase_orders";
DROP TABLE IF EXISTS "prc"."vendors";
DROP TYPE IF EXISTS "prc"."POStatus";

-- Enums
CREATE TYPE "prc"."VendorType" AS ENUM (
  'raw_material', 'sole', 'accessory', 'packaging', 'machine', 'service'
);
CREATE TYPE "prc"."VendorStatus" AS ENUM ('approved', 'blacklisted', 'under_review');
CREATE TYPE "prc"."PurchaseOrderStatus" AS ENUM (
  'draft', 'pending_approval', 'approved', 'partially_received', 'received', 'cancelled'
);
CREATE TYPE "prc"."GoodsReceiptStatus" AS ENUM ('draft', 'qc_pending', 'approved', 'rejected');
CREATE TYPE "prc"."GrLineQcStatus" AS ENUM ('pending', 'accepted', 'rejected', 'hold');
CREATE TYPE "prc"."VendorInvoiceStatus" AS ENUM (
  'pending', 'partial', 'paid', 'disputed', 'cancelled'
);

CREATE TABLE "prc"."vendor_categories" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(100) NOT NULL,
  "code" VARCHAR(20) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "vendor_categories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vendor_categories_name_key" ON "prc"."vendor_categories"("name");
CREATE UNIQUE INDEX "vendor_categories_code_key" ON "prc"."vendor_categories"("code");

CREATE TABLE "prc"."vendors" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "vendor_code" VARCHAR(30) NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "type" "prc"."VendorType" NOT NULL,
  "category_id" UUID,
  "contact_name" VARCHAR(100),
  "email" VARCHAR(255),
  "phone" VARCHAR(30),
  "address" TEXT,
  "trade_license" VARCHAR(100),
  "tin_number" VARCHAR(50),
  "bank_name" VARCHAR(100),
  "bank_account" VARCHAR(50),
  "payment_terms" SMALLINT NOT NULL DEFAULT 30,
  "credit_limit" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "status" "prc"."VendorStatus" NOT NULL DEFAULT 'approved',
  "rating" DECIMAL(3,1),
  "notes" TEXT,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vendors_vendor_code_key" ON "prc"."vendors"("vendor_code");
CREATE INDEX "vendors_status_idx" ON "prc"."vendors"("status");
CREATE INDEX "vendors_category_id_idx" ON "prc"."vendors"("category_id");
CREATE INDEX "vendors_name_trgm_idx" ON "prc"."vendors" USING GIN ("name" gin_trgm_ops);
ALTER TABLE "prc"."vendors"
  ADD CONSTRAINT "vendors_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "prc"."vendor_categories"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "prc"."purchase_orders" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "po_number" VARCHAR(30) NOT NULL,
  "vendor_id" UUID NOT NULL,
  "status" "prc"."PurchaseOrderStatus" NOT NULL DEFAULT 'draft',
  "currency" CHAR(3) NOT NULL DEFAULT 'BDT',
  "total_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "delivery_date" DATE NOT NULL,
  "notes" TEXT,
  "rejection_reason" TEXT,
  "required_approver_role" VARCHAR(50),
  "approved_by" UUID,
  "approved_at" TIMESTAMPTZ,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "purchase_orders_po_number_key" ON "prc"."purchase_orders"("po_number");
CREATE INDEX "purchase_orders_vendor_id_idx" ON "prc"."purchase_orders"("vendor_id");
CREATE INDEX "purchase_orders_status_idx" ON "prc"."purchase_orders"("status");
ALTER TABLE "prc"."purchase_orders"
  ADD CONSTRAINT "purchase_orders_vendor_id_fkey"
  FOREIGN KEY ("vendor_id") REFERENCES "prc"."vendors"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "prc"."po_lines" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "po_id" UUID NOT NULL,
  "item_id" UUID NOT NULL,
  "ordered_qty" DECIMAL(12,3) NOT NULL,
  "received_qty" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "unit_price" DECIMAL(12,4) NOT NULL,
  "uom" VARCHAR(20) NOT NULL,
  "delivery_date" DATE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "po_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "po_lines_ordered_qty_check" CHECK ("ordered_qty" > 0),
  CONSTRAINT "po_lines_unit_price_check" CHECK ("unit_price" >= 0)
);
CREATE INDEX "po_lines_po_id_idx" ON "prc"."po_lines"("po_id");
ALTER TABLE "prc"."po_lines"
  ADD CONSTRAINT "po_lines_po_id_fkey"
  FOREIGN KEY ("po_id") REFERENCES "prc"."purchase_orders"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "prc"."goods_receipts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "grn_number" VARCHAR(30) NOT NULL,
  "po_id" UUID NOT NULL,
  "receipt_date" DATE NOT NULL DEFAULT CURRENT_DATE,
  "status" "prc"."GoodsReceiptStatus" NOT NULL DEFAULT 'draft',
  "received_by" UUID NOT NULL,
  "approved_by" UUID,
  "approved_at" TIMESTAMPTZ,
  "vehicle_no" VARCHAR(50),
  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "goods_receipts_grn_number_key" ON "prc"."goods_receipts"("grn_number");
CREATE INDEX "goods_receipts_po_id_idx" ON "prc"."goods_receipts"("po_id");
ALTER TABLE "prc"."goods_receipts"
  ADD CONSTRAINT "goods_receipts_po_id_fkey"
  FOREIGN KEY ("po_id") REFERENCES "prc"."purchase_orders"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "prc"."gr_lines" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "grn_id" UUID NOT NULL,
  "po_line_id" UUID NOT NULL,
  "received_qty" DECIMAL(12,3) NOT NULL,
  "accepted_qty" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "rejected_qty" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "qc_status" "prc"."GrLineQcStatus" NOT NULL DEFAULT 'pending',
  "rejection_reason" TEXT,
  "batch_lot" VARCHAR(50),
  "unit_cost" DECIMAL(12,4),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "gr_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gr_lines_received_qty_check" CHECK ("received_qty" > 0),
  CONSTRAINT "chk_gr_qty" CHECK ("accepted_qty" + "rejected_qty" <= "received_qty")
);
CREATE INDEX "gr_lines_grn_id_idx" ON "prc"."gr_lines"("grn_id");
ALTER TABLE "prc"."gr_lines"
  ADD CONSTRAINT "gr_lines_grn_id_fkey"
  FOREIGN KEY ("grn_id") REFERENCES "prc"."goods_receipts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prc"."gr_lines"
  ADD CONSTRAINT "gr_lines_po_line_id_fkey"
  FOREIGN KEY ("po_line_id") REFERENCES "prc"."po_lines"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "prc"."gr_line_photos" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "gr_line_id" UUID NOT NULL,
  "s3_key" VARCHAR(500) NOT NULL,
  "content_type" VARCHAR(100) NOT NULL,
  "uploaded_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "gr_line_photos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "gr_line_photos_gr_line_id_idx" ON "prc"."gr_line_photos"("gr_line_id");
ALTER TABLE "prc"."gr_line_photos"
  ADD CONSTRAINT "gr_line_photos_gr_line_id_fkey"
  FOREIGN KEY ("gr_line_id") REFERENCES "prc"."gr_lines"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "prc"."vendor_invoices" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "vendor_id" UUID NOT NULL,
  "invoice_no" VARCHAR(50) NOT NULL,
  "invoice_date" DATE NOT NULL,
  "due_date" DATE NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'BDT',
  "gross_amount" DECIMAL(15,2) NOT NULL,
  "tds_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "net_payable" DECIMAL(15,2) NOT NULL,
  "paid_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "status" "prc"."VendorInvoiceStatus" NOT NULL DEFAULT 'pending',
  "grn_id" UUID,
  "gl_entry_id" UUID,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "vendor_invoices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vendor_invoices_vendor_id_invoice_no_key"
  ON "prc"."vendor_invoices"("vendor_id", "invoice_no");
CREATE INDEX "vendor_invoices_vendor_id_idx" ON "prc"."vendor_invoices"("vendor_id");
CREATE INDEX "vendor_invoices_status_idx" ON "prc"."vendor_invoices"("status");
CREATE INDEX "vendor_invoices_due_date_idx" ON "prc"."vendor_invoices"("due_date");
ALTER TABLE "prc"."vendor_invoices"
  ADD CONSTRAINT "vendor_invoices_vendor_id_fkey"
  FOREIGN KEY ("vendor_id") REFERENCES "prc"."vendors"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "prc"."vendor_invoices"
  ADD CONSTRAINT "vendor_invoices_grn_id_fkey"
  FOREIGN KEY ("grn_id") REFERENCES "prc"."goods_receipts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Ensure PO / GRN document sequences exist (idempotent)
INSERT INTO sys.document_sequences (prefix, last_number, pad_length, separator)
VALUES ('PO', 0, 6, '-'), ('GRN', 0, 6, '-')
ON CONFLICT (prefix) DO NOTHING;
