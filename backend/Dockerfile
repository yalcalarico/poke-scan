# syntax=docker/dockerfile:1
#
# Backend NestJS — imagen de produccion (fase 6, tarea 6.4).
# Solo se usa con `docker compose --profile deploy up`.

# La versión de pnpm está **fijada**, y no es cosmetico.
#
# `corepack enable` a secas descarga la última pnpm publicada. Hoy eso es
# pnpm 12.x, que ya no lee `pnpm.onlyBuiltDependencies` desde `package.json`
# (se mudó a `pnpm-workspace.yaml`), así que `pnpm install --frozen-lockfile`
# falla con ERR_PNPM_IGNORED_BUILDS y **la imagen no construye**. El
# `packageManager` del package.json raíz tampoco ayuda: el contexto de este
# build es `./backend`, que no tiene ese campo.
#
# Además, una imagen que se construye con "la última pnpm del día" no es
# reproducible: un major nuevo rompe el build sin que nadie toque el repo.
ARG PNPM_VERSION=10.17.1

FROM node:22-alpine AS builder
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
ARG PNPM_VERSION
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .

# Prisma genera el cliente dentro de node_modules/.prisma, que despues hay que
# copiar a mano al stage de runtime.
RUN pnpm run build && pnpm exec prisma generate

# ─── deps de produccion ──────────────────────────────────────────────────────
FROM node:22-alpine AS prod-deps
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
ARG PNPM_VERSION
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod
# argon2 y los engines de prisma son binarios nativos: recompilan en esta capa.
RUN pnpm exec prisma generate

# ─── runner ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

# argon2 (bcrypt nativo) necesita libstdc++/g++ para compilar en el deps stage.
RUN apk add --no-cache libstdc++ \
 && addgroup -g 1001 -S nodejs \
 && adduser -S nextjs -u 1001

COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

USER nextjs
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
