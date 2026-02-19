# ---------- build stage ----------
FROM node:22-slim AS builder

WORKDIR /app

# Copy workspace root files for pnpm resolution
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .pnpmrc ./

# Copy all workspace package.json files for lockfile validation
COPY frontend/package.json ./frontend/
COPY server/package.json ./server/
COPY contracts/package.json ./contracts/

# Install only frontend dependencies
RUN corepack enable && pnpm install --frozen-lockfile --filter frontend...

# Copy frontend source
COPY frontend/ ./frontend/

# Next.js bakes NEXT_PUBLIC_* vars into the JS bundle at build time
ARG NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_CHAIN_ID

# Build Next.js (standalone output)
RUN pnpm --filter frontend run build

# ---------- runtime stage ----------
FROM node:22-slim

WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Copy standalone output (self-contained server + minimal node_modules)
COPY --from=builder /app/frontend/.next/standalone ./
COPY --from=builder /app/frontend/.next/static ./frontend/.next/static

# Create public dir (empty for now; add COPY if static assets are added later)
RUN mkdir -p ./frontend/public

EXPOSE 3000

# Standalone server.js is at the workspace-relative path
CMD ["node", "frontend/server.js"]
