# syntax=docker/dockerfile:1
# Targets: `dev` (Vite with HMR) and `prod` (static build served by nginx).

FROM node:24-alpine AS base
WORKDIR /app
RUN npm install -g pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ---- dev: compose mounts the source; VITE_API_PROXY_TARGET points /api at the backend ----
FROM base AS dev
ENV VITE_API_PROXY_TARGET=http://backend:8000
COPY . .
EXPOSE 5173
CMD ["pnpm", "exec", "vite", "--host", "0.0.0.0", "--port", "5173"]

# ---- build ----
FROM base AS build
COPY . .
RUN pnpm build

# ---- prod: nginx serves dist with SPA fallback and proxies /api/ ----
FROM nginx:1.29-alpine AS prod
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
