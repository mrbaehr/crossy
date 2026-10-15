# Multi-stage build: compile the TS monorepo, then run a slim production image.
FROM node:22-slim AS build
WORKDIR /app

# Install build toolchain for better-sqlite3's native addon.
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install deps (workspaces) with full dev deps for building.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci

# Build shared -> client -> server.
COPY . .
RUN npm run build

# Prune to production dependencies only.
RUN npm prune --omit=dev

# ---- runtime image ----
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# SQLite lives on the mounted volume; see fly.toml [mounts].
ENV DATABASE_PATH=/data/crossy.db

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/shared/package.json ./shared/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/drizzle ./server/drizzle
COPY --from=build /app/client/dist ./client/dist

EXPOSE 3000
CMD ["node", "server/dist/index.js"]
