# syntax=docker/dockerfile:1
#
# Frontend de PokéScan — imagen de produccion (fase 6, tarea 6.4).
# Multi-stage con `output: "standalone"` de Next: la imagen final no incluye
# ni node_modules completos ni el codigo fuente.

# ─── deps ────────────────────────────────────────────────────────────────────
ARG NODE_IMAGE=node:22.20.0-alpine
ARG PNPM_VERSION=10.17.1
FROM ${NODE_IMAGE} AS deps
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
ARG PNPM_VERSION
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app

# Solo los manifests: la capa de dependencias se cachea mientras no cambie el lockfile.
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ─── build ───────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS builder
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1
# La vista previa de la landing es decorativa; esta URL solo de build falla rápido
# sin depender de una API de desarrollo ni incrustar su host.
ENV API_INTERNAL_URL=http://127.0.0.1:1/api
ARG PNPM_VERSION
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_API_URL=http://localhost:3001/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN pnpm run build

# ─── runner ──────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app

# next/image (optimizacion de imagenes) necesita compatibilidad con libc en Alpine.
RUN apk add --no-cache libc6-compat && addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# `output: "standalone"` ya trae un server.js con el trace minimo de node_modules.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# public/ NO se copia solo en el trace: sin esto faltan manifest.json, sw.js,
# los iconos.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/manifest.json').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
