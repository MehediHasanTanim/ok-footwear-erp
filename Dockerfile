# =============================================================================
# OK Footwear ERP — Multi-stage Dockerfile
# =============================================================================
# Stage 1: builder  — compiles TypeScript, generates Prisma client, prunes dev deps
# Stage 2: runner   — minimal production image, non-root user, < 200MB target
#
# Build:
#   docker build -t ok-footwear-erp:latest .
#
# Run:
#   docker run -p 7100:7100 --env-file .env ok-footwear-erp:latest
#
# Build specific stage:
#   docker build --target builder -t ok-footwear-erp:builder .
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Builder
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder

# Build-time dependencies:
#   - openssl: required by Prisma engine
#   - python3/make/g++: may be needed by native modules (e.g., bcrypt)
RUN apk add --no-cache openssl python3 make g++

WORKDIR /app

# --- Layer 1: Dependencies (cached unless package*.json changes) ---
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && \
    # Rebuild native modules for Alpine musl
    npm rebuild

# --- Layer 2: Prisma client generation ---
# Generate BEFORE copying src/ so this layer is cached when only source changes.
COPY prisma/ ./prisma/
RUN npx prisma generate

# --- Layer 3: Build configuration ---
COPY tsconfig.json tsconfig.build.json nest-cli.json ./

# --- Layer 4: Source code (last — most frequently changing) ---
COPY src/ ./src/

# --- Compile TypeScript ---
# nest build: TypeScript compilation via NestJS CLI
# tsc-alias: rewrites path aliases (@/*, @modules/*) in JS output
RUN npm run build

# --- Strip dev dependencies ---
# After build, only production deps are needed in the runner.
RUN npm prune --production

# =============================================================================
# Stage 2: Runner
# =============================================================================
FROM node:20-alpine AS runner

# Runtime dependencies:
#   - curl: needed for HEALTHCHECK
#   - openssl: needed by Prisma query engine (libssl)
#   - tini: lightweight init process for proper signal handling (SIGTERM)
RUN apk add --no-cache curl openssl tini

WORKDIR /app

# --- Create non-root user ---
# node:20-alpine already has 'node' user (uid 1000). We use it explicitly.
# App files are owned by node:node so the process can read them.
RUN chown node:node /app
USER node

# --- Copy production artifacts from builder ---
# dist/        — compiled JavaScript (nest build + tsc-alias output)
# node_modules — production dependencies only (npm prune --production)
# package.json — needed for module resolution at runtime
# prisma/      — schema.prisma + generated client
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/package.json ./
COPY --chown=node:node --from=builder /app/prisma ./prisma
COPY --chown=node:node scripts/docker-entrypoint.sh ./docker-entrypoint.sh

# --- Environment ---
# NODE_ENV=production: enables production optimizations in NestJS, pino, etc.
# PORT=3000: NestJS application port (overridden by runtime env if needed)
ENV NODE_ENV=production
ENV PORT=3000

# --- Expose application port ---
EXPOSE 7100

# --- Health check ---
# Kubernetes uses this for liveness and readiness probes.
# Default: check every 30s, timeout 5s, 3 retries.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=15s \
  CMD curl -sf http://localhost:7100/api/v1/health || exit 1

# --- Runtime ---
# tini: forward signals (SIGTERM → Node.js graceful shutdown)
# docker-entrypoint.sh: prisma migrate deploy (DIRECT_DATABASE_URL) then exec CMD
ENTRYPOINT ["/sbin/tini", "--", "sh", "./docker-entrypoint.sh"]
CMD ["node", "dist/main"]
