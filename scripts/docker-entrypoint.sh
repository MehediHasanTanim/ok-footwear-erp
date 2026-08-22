#!/bin/sh
# Apply pending Prisma migrations before starting NestJS (dev Docker / same script for prod init).
set -e

run_migrate() {
  attempt=1
  max=3
  while [ "$attempt" -le "$max" ]; do
    if npx prisma migrate deploy; then
      return 0
    fi
    if [ "$attempt" -eq "$max" ]; then
      echo "ERROR: prisma migrate deploy failed after ${max} attempts"
      return 1
    fi
    echo "Migrate failed (attempt ${attempt}/${max}), retrying in 2s..."
    sleep 2
    attempt=$((attempt + 1))
  done
}

check_bom_schema() {
  if [ "$SKIP_SCHEMA_CHECK" = "true" ]; then
    echo "SKIP_SCHEMA_CHECK=true — skipping bom_headers sanity check"
    return 0
  fi

  node <<'NODE'
const { PrismaClient } = require('@prisma/client');

const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('ERROR: DIRECT_DATABASE_URL or DATABASE_URL required for schema check');
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

(async () => {
  try {
    const rows = await prisma.$queryRaw`
      SELECT 1 AS ok FROM information_schema.columns
      WHERE table_schema = 'mfg'
        AND table_name = 'bom_headers'
        AND column_name = 'article_id'
      LIMIT 1
    `;
    if (!Array.isArray(rows) || rows.length === 0) {
      console.error(
        'ERROR: Schema out of date — mfg.bom_headers.article_id missing. Run: npx prisma migrate deploy',
      );
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
})().catch((err) => {
  console.error('ERROR: Schema sanity check failed:', err.message);
  process.exit(1);
});
NODE
}

if [ -n "$DIRECT_DATABASE_URL" ]; then
  echo "Applying Prisma migrations (direct Postgres)..."
  run_migrate
  check_bom_schema
else
  echo "WARN: DIRECT_DATABASE_URL unset; skipping prisma migrate deploy"
fi

exec "$@"
