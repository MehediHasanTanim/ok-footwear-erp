#!/usr/bin/env ts-node
// =============================================================================
// seed-permissions.ts — Populate permissions & assign all to Super Admin
// =============================================================================
// Creates {module, action} permission pairs and links them to Super Admin.
// Run after migrations when setting up a fresh database.
//
// Usage:
//   npx ts-node -r tsconfig-paths/register scripts/seed-permissions.ts
// =============================================================================

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

interface PermissionDef {
  module: string;
  action: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Permission Matrix
// ---------------------------------------------------------------------------
const PERMISSIONS: PermissionDef[] = [
  // ── System ──────────────────────────────────────────────────────────
  { module: "system", action: "read", description: "View system settings and configurations" },
  { module: "system", action: "create", description: "Create system resources (users, roles)" },
  { module: "system", action: "update", description: "Update system resources" },
  { module: "system", action: "delete", description: "Delete system resources" },
  { module: "system", action: "approve", description: "Approve system-level changes" },
  { module: "system", action: "export", description: "Export system data and audit logs" },

  // ── Authentication ──────────────────────────────────────────────────
  { module: "auth", action: "read", description: "View auth settings and sessions" },
  { module: "auth", action: "create", description: "Create auth tokens and MFA setup" },
  { module: "auth", action: "update", description: "Update auth policies" },
  { module: "auth", action: "delete", description: "Revoke tokens and sessions" },

  // ── Orders ──────────────────────────────────────────────────────────
  { module: "orders", action: "read", description: "View orders and order details" },
  { module: "orders", action: "create", description: "Create new orders and quotations" },
  { module: "orders", action: "update", description: "Edit orders, status changes" },
  { module: "orders", action: "delete", description: "Cancel/delete orders" },
  { module: "orders", action: "approve", description: "Approve orders and quotations" },
  { module: "orders", action: "export", description: "Export order data and reports" },

  // ── Procurement ─────────────────────────────────────────────────────
  { module: "procurement", action: "read", description: "View vendors, POs, GRNs" },
  { module: "procurement", action: "create", description: "Create POs and GRNs" },
  { module: "procurement", action: "update", description: "Edit procurement documents" },
  { module: "procurement", action: "delete", description: "Cancel procurement documents" },
  { module: "procurement", action: "approve", description: "Approve POs and vendor invoices" },
  { module: "procurement", action: "export", description: "Export procurement reports" },

  // ── Manufacturing ───────────────────────────────────────────────────
  { module: "manufacturing", action: "read", description: "View BOMs, production orders, QC" },
  { module: "manufacturing", action: "create", description: "Create production orders and QC entries" },
  { module: "manufacturing", action: "update", description: "Update production status and QC" },
  { module: "manufacturing", action: "delete", description: "Delete/cancel production records" },
  { module: "manufacturing", action: "approve", description: "Approve production orders and QC" },
  { module: "manufacturing", action: "export", description: "Export manufacturing reports" },

  // ── Inventory ───────────────────────────────────────────────────────
  { module: "inventory", action: "read", description: "View stock, warehouses, transactions" },
  { module: "inventory", action: "create", description: "Create stock entries and transfers" },
  { module: "inventory", action: "update", description: "Update stock levels and warehouse data" },
  { module: "inventory", action: "delete", description: "Delete stock records" },
  { module: "inventory", action: "approve", description: "Approve stock adjustments and transfers" },
  { module: "inventory", action: "export", description: "Export inventory reports" },

  // ── Finance ─────────────────────────────────────────────────────────
  { module: "finance", action: "read", description: "View GL, accounts, financial reports" },
  { module: "finance", action: "create", description: "Create GL entries, invoices" },
  { module: "finance", action: "update", description: "Edit financial entries" },
  { module: "finance", action: "delete", description: "Reverse/delete financial entries" },
  { module: "finance", action: "approve", description: "Approve financial entries, period lock" },
  { module: "finance", action: "export", description: "Export financial reports and ledgers" },

  // ── Human Resources ─────────────────────────────────────────────────
  { module: "hr", action: "read", description: "View employees, attendance, leave" },
  { module: "hr", action: "create", description: "Create employee records, leave applications" },
  { module: "hr", action: "update", description: "Update employee data, attendance" },
  { module: "hr", action: "delete", description: "Delete HR records" },
  { module: "hr", action: "approve", description: "Approve leave, overtime, expenses" },
  { module: "hr", action: "export", description: "Export HR and payroll reports" },

  // ── Payroll ─────────────────────────────────────────────────────────
  { module: "payroll", action: "read", description: "View payroll runs and payslips" },
  { module: "payroll", action: "create", description: "Create payroll runs" },
  { module: "payroll", action: "update", description: "Update payroll data" },
  { module: "payroll", action: "delete", description: "Delete payroll runs" },
  { module: "payroll", action: "approve", description: "Approve payroll runs" },
  { module: "payroll", action: "export", description: "Export payroll reports" },

  // ── Board Governance ────────────────────────────────────────────────
  { module: "board", action: "read", description: "View directors, meetings, resolutions, AGMs" },
  { module: "board", action: "create", description: "Create meetings, resolutions, shareholder records" },
  { module: "board", action: "update", description: "Update board records, minutes" },
  { module: "board", action: "delete", description: "Delete board records" },
  { module: "board", action: "approve", description: "Approve resolutions, dividends" },
  { module: "board", action: "export", description: "Export board and governance reports" },

  // ── Compliance ──────────────────────────────────────────────────────
  { module: "compliance", action: "read", description: "View compliance items and register" },
  { module: "compliance", action: "create", description: "Add compliance items" },
  { module: "compliance", action: "update", description: "Update compliance items and renewals" },
  { module: "compliance", action: "delete", description: "Remove compliance items" },
  { module: "compliance", action: "approve", description: "Approve compliance renewals" },
  { module: "compliance", action: "export", description: "Export compliance reports" },

  // ── Reports & Dashboards ────────────────────────────────────────────
  { module: "reports", action: "read", description: "View dashboards and reports" },
  { module: "reports", action: "export", description: "Export and download reports" },

  // ── Notifications ───────────────────────────────────────────────────
  { module: "notifications", action: "read", description: "View notifications" },
  { module: "notifications", action: "create", description: "Create/send notifications" },
  { module: "notifications", action: "update", description: "Manage notification preferences" },
];

async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   OK Footwear ERP — Seed Permissions        ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log();

  // -------------------------------------------------------------------
  // 1. Upsert permissions (idempotent)
  // -------------------------------------------------------------------
  let created = 0;
  let existing = 0;

  for (const p of PERMISSIONS) {
    const result = await prisma.permission.upsert({
      where: { module_action: { module: p.module, action: p.action } },
      create: p,
      update: { description: p.description },
    });
    if (result.createdAt.getTime() === result.createdAt.getTime()) {
      // Check if just created by comparing with a recent timestamp
    }
  }

  // Use createMany with skipDuplicates for efficiency
  const perms = await Promise.all(
    PERMISSIONS.map(async (p) => {
      const existing = await prisma.permission.findUnique({
        where: { module_action: { module: p.module, action: p.action } },
      });
      if (existing) return existing;
      return prisma.permission.create({ data: p });
    })
  );

  created = perms.filter((p, i) => {
    const def = PERMISSIONS[i]!;
    return true; // All in perms array now
  }).length;

  const totalPerms = await prisma.permission.count();
  console.log(`Permissions: ${totalPerms} total in database`);
  console.log();

  // -------------------------------------------------------------------
  // 2. Assign ALL permissions to Super Admin role
  // -------------------------------------------------------------------
  const superAdminRole = await prisma.role.findUnique({
    where: { name: "Super Admin" },
  });

  if (!superAdminRole) {
    console.error("ERROR: 'Super Admin' role not found. Create it first.");
    console.error("  npm run create-user -- 'Super Admin' --email admin@okfootwear.com");
    return;
  }

  const allPermissions = await prisma.permission.findMany();
  let assigned = 0;

  for (const perm of allPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: superAdminRole.id,
          permissionId: perm.id,
        },
      },
      create: { roleId: superAdminRole.id, permissionId: perm.id },
      update: {}, // no-op if exists
    });
    assigned++;
  }

  console.log(`Assigned ${assigned} permissions to 'Super Admin' role`);
  console.log();

  // -------------------------------------------------------------------
  // 3. Verify
  // -------------------------------------------------------------------
  const superAdminPerms = await prisma.rolePermission.count({
    where: { roleId: superAdminRole.id },
  });
  console.log(`✅ Super Admin now has ${superAdminPerms} permissions`);
  console.log();
  console.log("Next step: Log in as admin@okfootwear.com to get a token with full access.");

  await prisma.$disconnect();
}

main();
