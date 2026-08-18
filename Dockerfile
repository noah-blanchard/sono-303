# syntax=docker/dockerfile:1

# ---- Stage 1: build the static bundle with Bun ----
FROM oven/bun:1-alpine AS build
WORKDIR /app

# Dependencies first so this layer caches across source-only changes.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# ---- Stage 2: serve dist/ with nginx ----
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
