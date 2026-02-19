# ---------- build stage ----------
FROM node:22-slim AS builder

# Build tools for better-sqlite3 native module
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy workspace root files for pnpm resolution
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .pnpmrc ./

# Copy root tsconfig (server/tsconfig.json extends it)
COPY tsconfig.json ./

# Copy all workspace package.json files for lockfile validation
COPY server/package.json ./server/
COPY frontend/package.json ./frontend/
COPY contracts/package.json ./contracts/

# Install only server dependencies
RUN corepack enable && pnpm install --frozen-lockfile --filter @agentic-street/server...

# Copy server source
COPY server/ ./server/

# Build TypeScript
RUN pnpm --filter @agentic-street/server run build

# ---------- runtime stage ----------
FROM node:22-slim

# curl for Docker healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy workspace structure with built artifacts
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/.pnpmrc ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server ./server
COPY skill/ ./skill/

# Create data directory (volume mount target)
RUN mkdir -p /app/data /app/data/backups

WORKDIR /app/server

EXPOSE 3001
CMD ["node", "dist/http.js"]
