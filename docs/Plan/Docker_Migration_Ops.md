# Docker — Prisma migration ops

> Local dev: migrations auto-apply when the `nestjs` container starts.

## Startup flow

1. `docker compose up` starts `nestjs`
2. [`scripts/docker-entrypoint.sh`](../../scripts/docker-entrypoint.sh) runs `npx prisma migrate deploy` using `DIRECT_DATABASE_URL`
3. Optional sanity check: `mfg.bom_headers.article_id` exists (skip with `SKIP_SCHEMA_CHECK=true`)
4. `node dist/main` starts

Ensure [`.env.local`](../../.env.local) sets:

```env
DIRECT_DATABASE_URL=postgresql://ok_footwear:ok_footwear_dev@postgres:5432/ok_footwear_erp
```

## Troubleshooting

| Symptom | Check | Fix |
|---|---|---|
| `column bom_headers.article_id does not exist` | Column list on `mfg.bom_headers` | `docker compose exec nestjs npx prisma migrate deploy` |
| Migration applied but API still 500 | Old image running | `docker compose up -d --build nestjs` |
| Migrate fails on first boot | Postgres not ready | Restart `nestjs`; entrypoint retries 3× |

### Verify schema

```bash
docker compose exec -T postgres psql -U ok_footwear -d ok_footwear_erp \
  -c "SELECT column_name FROM information_schema.columns WHERE table_schema='mfg' AND table_name='bom_headers' ORDER BY 1;"
```

Expected Sprint 9+ columns include `article_id`, `status`, `created_by` (not `bom_code` / `article_code`).

### Verify startup logs

```bash
docker compose logs nestjs | grep -E "Applying Prisma|migrate deploy"
curl http://localhost:7100/api/v1/health
```
