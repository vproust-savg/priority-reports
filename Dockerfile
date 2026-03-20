# ═══════════════════════════════════════════════════════════════
# FILE: Dockerfile
# PURPOSE: Multi-stage build for Priority ERP Dashboard.
#          Builds client and server separately, produces a slim
#          production image that serves both API and static files.
# USED BY: Railway deployment, local docker build
# ═══════════════════════════════════════════════════════════════

# ── Stage 1: Build client ─────────────────────────────────────
FROM node:20-alpine AS builder-client

WORKDIR /app

# WHY: Client tsconfig.app.json includes "../shared" for shared types
COPY shared/ shared/

# WHY: Copy package files first for layer caching — npm ci only
# re-runs when package.json or package-lock.json change.
COPY client/package.json client/package-lock.json client/
RUN cd client && npm ci

COPY client/ client/
RUN cd client && npm run build

# ── Stage 2: Build server ─────────────────────────────────────
FROM node:20-alpine AS builder-server

WORKDIR /app

# WHY: Server tsconfig has rootDir=".." and includes "../shared/**/*"
COPY shared/ shared/

COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci

COPY server/ server/
RUN cd server && npm run build

# ── Stage 3: Production image ─────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# WHY: Only install production dependencies (no tsx, vitest, typescript)
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --omit=dev

# Copy compiled server output
COPY --from=builder-server /app/server/dist/ server/dist/

# WHY: Must be at /app/client/dist/ so the server's
# path.join(__dirname, '../../../../client/dist') resolves correctly.
# __dirname at runtime = /app/server/dist/server/src/
# ../../../../client/dist = /app/client/dist/
COPY --from=builder-client /app/client/dist/ client/dist/

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "server/dist/server/src/index.js"]
