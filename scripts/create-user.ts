#!/usr/bin/env ts-node
// =============================================================================
// create-user.ts — CLI script to create a user and assign a role
// =============================================================================
// Usage:
//   # List all predefined roles
//   npx ts-node -r tsconfig-paths/register scripts/create-user.ts --list
//
//   # Interactive (prompts for missing fields)
//   npx ts-node -r tsconfig-paths/register scripts/create-user.ts "Super Admin"
//
//   # Fully flagged (non-interactive)
//   npx ts-node -r tsconfig-paths/register scripts/create-user.ts "Super Admin" \
//     --email admin@okfootwear.com \
//     --password changeme123 \
//     --firstName Admin \
//     --lastName User
//
//   # Create ad-hoc role (auto-created if not in catalog)
//   npx ts-node -r tsconfig-paths/register scripts/create-user.ts "Custom Role" \
//     --email custom@okfootwear.com
//
// Role names are matched case-insensitively against the predefined catalog.
// Non-catalog roles are auto-created with a default description.
// =============================================================================

import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import * as readline from 'readline';

// ---------------------------------------------------------------------------
// Role Catalog — predefined roles with descriptions
// ---------------------------------------------------------------------------

interface RoleDefinition {
  name: string;
  description: string;
  isSystem: boolean;
}

const ROLE_CATALOG: RoleDefinition[] = [
  // ── System / Admin Roles ──────────────────────────────────────────────
  {
    name: 'Super Admin',
    description:
      'Full system access, user/role management, audit log access',
    isSystem: true,
  },
  {
    name: 'System Admin',
    description:
      'User management, role assignment, compliance register; no financial approval rights',
    isSystem: true,
  },

  // ── Management Roles ──────────────────────────────────────────────────
  {
    name: 'CEO / Managing Director',
    description: 'Board module, cross-module read, KPI dashboard',
    isSystem: true,
  },
  {
    name: 'Finance Manager',
    description:
      'Full Finance module, payroll approval, GL period lock, LC management',
    isSystem: true,
  },
  {
    name: 'HR Manager',
    description:
      'Full HR & Payroll module, employee management, payroll run',
    isSystem: true,
  },
  {
    name: 'Operations Manager',
    description:
      'Orders, Manufacturing, Inventory read/write; no financial posting',
    isSystem: true,
  },
  {
    name: 'Procurement Manager',
    description:
      'Full Procurement module, PO approval up to threshold',
    isSystem: true,
  },

  // ── Operational / Staff Roles ─────────────────────────────────────────
  {
    name: 'Sales / Merchandiser',
    description:
      'Orders module (create/edit orders, quotations, samples, complaints)',
    isSystem: false,
  },
  {
    name: 'Procurement Officer',
    description:
      'PO creation (not approval), GRN entry, vendor management',
    isSystem: false,
  },
  {
    name: 'Production Supervisor',
    description: 'Daily production entry, QC recording, BOM view',
    isSystem: false,
  },
  {
    name: 'Inventory Officer',
    description:
      'Stock transfers, stock count entry, warehouse management',
    isSystem: false,
  },
  {
    name: 'Finance Officer',
    description:
      'GL entry, AP/AR, invoices, delivery challans; no period lock',
    isSystem: false,
  },
  {
    name: 'HR Officer',
    description:
      'Employee records, leave management, attendance; no payroll run',
    isSystem: false,
  },
  {
    name: 'Payroll Officer',
    description:
      'Payroll run execution, payslip generation; no employee record edit',
    isSystem: false,
  },

  // ── Self-Service Roles (all employees) ────────────────────────────────
  {
    name: 'Employee (ESS)',
    description:
      'Leave apply, payslip download, expense claim, attendance self-view',
    isSystem: false,
  },
  {
    name: 'Manager (MSS)',
    description:
      'ESS rights + approval queue (leave, expense, overtime, attendance)',
    isSystem: false,
  },

  // ── Board / Governance Roles ──────────────────────────────────────────
  {
    name: 'Board Director',
    description:
      'Board module read (meetings, resolutions, AGM, shareholding)',
    isSystem: false,
  },
  {
    name: 'Company Secretary',
    description:
      'Full Board module write, director register, dividend processing',
    isSystem: false,
  },

  // ── Integration / Service Roles ───────────────────────────────────────
  {
    name: 'Biometric Sync Service',
    description:
      'Write-only access to attendance webhook endpoint (Phase 2)',
    isSystem: true,
  },
  {
    name: 'Report Viewer',
    description:
      'Read-only access to dashboards and exported reports; no write anywhere',
    isSystem: false,
  },
];

// Normalized lookup map (lowercase name → definition)
const ROLE_MAP = new Map<string, RoleDefinition>();
for (const def of ROLE_CATALOG) {
  ROLE_MAP.set(def.name.toLowerCase(), def);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CliArgs {
  roleName: string;
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  isActive?: boolean;
  employeeId?: string;
  listRoles?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = { roleName: '' };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--email':
        result.email = args[++i];
        break;
      case '--password':
        result.password = args[++i];
        break;
      case '--firstName':
        result.firstName = args[++i];
        break;
      case '--lastName':
        result.lastName = args[++i];
        break;
      case '--isActive':
        result.isActive = args[++i]?.toLowerCase() !== 'false';
        break;
      case '--employeeId':
        result.employeeId = args[++i];
        break;
      case '--list':
        result.listRoles = true;
        break;
      default:
        if (!args[i]?.startsWith('--')) {
          result.roleName = args[i]!;
        }
    }
  }

  return result;
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function promptPassword(): Promise<string> {
  const password = await prompt('Password (min 8 chars): ');
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }
  const confirm = await prompt('Confirm password: ');
  if (password !== confirm) {
    console.error('Passwords do not match.');
    process.exit(1);
  }
  return password;
}

function isValidUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

function listRoles(): void {
  console.log();
  console.log('┌──────────────────────────────────────────────────────────────────────┐');
  console.log('│                    OK Footwear ERP — Role Catalog                     │');
  console.log('├──────────────────────────────────────────────────────────────────────┤');

  const categories = [
    { title: 'System / Admin Roles', roles: ['Super Admin', 'System Admin'] },
    {
      title: 'Management Roles',
      roles: [
        'CEO / Managing Director',
        'Finance Manager',
        'HR Manager',
        'Operations Manager',
        'Procurement Manager',
      ],
    },
    {
      title: 'Operational / Staff Roles',
      roles: [
        'Sales / Merchandiser',
        'Procurement Officer',
        'Production Supervisor',
        'Inventory Officer',
        'Finance Officer',
        'HR Officer',
        'Payroll Officer',
      ],
    },
    {
      title: 'Self-Service Roles',
      roles: ['Employee (ESS)', 'Manager (MSS)'],
    },
    {
      title: 'Board / Governance Roles',
      roles: ['Board Director', 'Company Secretary'],
    },
    {
      title: 'Integration / Service Roles',
      roles: ['Biometric Sync Service', 'Report Viewer'],
    },
  ];

  for (const cat of categories) {
    console.log(`├──────────────────────────────────────────────────────────────────────┤`);
    console.log(`│  ${cat.title.padEnd(66)} │`);
    console.log(`├──────────────────────────────────────────────────────────────────────┤`);
    for (const roleName of cat.roles) {
      const def = ROLE_MAP.get(roleName.toLowerCase());
      if (def) {
        const sys = def.isSystem ? ' [SYS]' : '';
        console.log(`│  ${roleName.padEnd(50)}${sys.padEnd(16)} │`);
      }
    }
  }

  console.log('└──────────────────────────────────────────────────────────────────────┘');
  console.log();
  console.log('[SYS] = System role (isSystem=true in database)');
  console.log();
  console.log('Usage: npx ts-node scripts/create-user.ts "<Role Name>" [--flags...]');
  console.log();
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   OK Footwear ERP — Create User Script      ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log();

  const cli = parseArgs();

  // -----------------------------------------------------------------------
  // 0. --list flag: display role catalog and exit
  // -----------------------------------------------------------------------
  if (cli.listRoles) {
    listRoles();
    process.exit(0);
  }

  // -----------------------------------------------------------------------
  // 1. Validate role argument
  // -----------------------------------------------------------------------
  if (!cli.roleName) {
    console.error('ERROR: Role name is required as the first argument.');
    console.error('Usage: npx ts-node scripts/create-user.ts <ROLE> [--email ...]');
    console.error('       npx ts-node scripts/create-user.ts --list   (show roles)');
    console.error();
    console.error('💡 With npm: use -- to separate npm flags from script flags:');
    console.error('   npm run create-user -- "Super Admin" --email admin@okfootwear.com');
    process.exit(1);
  }

  // Guard: if roleName looks like an email or flag, the user probably forgot --
  if (cli.roleName.includes('@') || cli.roleName.startsWith('-')) {
    console.error(`ERROR: "${cli.roleName}" does not look like a valid role name.`);
    console.error('Did you forget the -- separator when using npm?');
    console.error();
    console.error('  ❌  npm run create-user "Super Admin" --email admin@okfootwear.com');
    console.error('  ✅  npm run create-user -- "Super Admin" --email admin@okfootwear.com');
    console.error();
    console.error('  With npx directly, -- is not needed:');
    console.error('  ✅  npx ts-node -r tsconfig-paths/register scripts/create-user.ts "Super Admin" --email admin@okfootwear.com');
    process.exit(1);
  }

  // Look up in catalog (case-insensitive)
  const roleDef = ROLE_MAP.get(cli.roleName.toLowerCase());
  if (roleDef) {
    console.log(`Role: ${roleDef.name} (${roleDef.isSystem ? 'system' : 'user'})`);
    console.log(`      ${roleDef.description}`);
  } else {
    console.log(`Role: ${cli.roleName} (custom — not in catalog)`);
  }
  console.log();

  // -----------------------------------------------------------------------
  // 2. Gather user details (interactive if not provided)
  // -----------------------------------------------------------------------
  const email = cli.email || (await prompt('Email: '));
  if (!email.includes('@')) {
    console.error('ERROR: Invalid email address.');
    process.exit(1);
  }

  const firstName = cli.firstName || (await prompt('First name: '));
  if (!firstName) {
    console.error('ERROR: First name is required.');
    process.exit(1);
  }

  const lastName = cli.lastName || (await prompt('Last name: '));
  if (!lastName) {
    console.error('ERROR: Last name is required.');
    process.exit(1);
  }

  const password = cli.password || (await promptPassword());
  const isActive = cli.isActive ?? true;

  // Validate optional employeeId
  if (cli.employeeId && !isValidUUID(cli.employeeId)) {
    console.error('ERROR: --employeeId must be a valid UUID.');
    process.exit(1);
  }

  // -----------------------------------------------------------------------
  // 3. Connect to database and create user
  // -----------------------------------------------------------------------
  const prisma = new PrismaClient();

  try {
    // Check for duplicate email
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.error(`ERROR: User with email "${email}" already exists (ID: ${existing.id}).`);
      process.exit(1);
    }

    // Find or create the role (use catalog definition if available)
    const targetName = roleDef?.name ?? cli.roleName;
    let role = await prisma.role.findUnique({ where: { name: targetName } });

    if (!role) {
      console.log(`Role "${targetName}" not found. Creating it...`);
      role = await prisma.role.create({
        data: {
          name: targetName,
          description:
            roleDef?.description ??
            `Auto-created by create-user script`,
          isSystem: roleDef?.isSystem ?? false,
        },
      });
      console.log(`Created role: ${role.name} (ID: ${role.id}, system: ${role.isSystem})`);
    } else {
      console.log(`Found existing role: ${role.name} (ID: ${role.id})`);
    }

    // Hash password
    console.log('Hashing password with argon2id...');
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      parallelism: 2,
      timeCost: 3,
    });

    // Create user + assign role in a transaction
    const [user] = await prisma.$transaction([
      prisma.user.create({
        data: {
          email,
          passwordHash,
          firstName,
          lastName,
          isActive,
          ...(cli.employeeId ? { employeeId: cli.employeeId } : {}),
        },
        select: { id: true, email: true, firstName: true, lastName: true, isActive: true },
      }),
    ]);

    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: role.id,
      },
    });

    // -------------------------------------------------------------------
    // 4. Success summary
    // -------------------------------------------------------------------
    console.log();
    console.log('✅ User created successfully!');
    console.log('──────────────────────────────────────────────');
    console.log(`  ID:         ${user.id}`);
    console.log(`  Email:      ${user.email}`);
    console.log(`  Name:       ${user.firstName} ${user.lastName}`);
    console.log(`  Role:       ${targetName}`);
    console.log(`  Active:     ${user.isActive ? 'Yes' : 'No'}`);
    if (cli.employeeId) {
      console.log(`  Employee:   ${cli.employeeId}`);
    }
    console.log('──────────────────────────────────────────────');
    console.log();

  } catch (error) {
    console.error('ERROR: Failed to create user.');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
