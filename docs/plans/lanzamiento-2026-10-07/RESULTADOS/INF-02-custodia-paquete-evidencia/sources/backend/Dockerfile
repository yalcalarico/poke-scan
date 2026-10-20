# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:22.20.0-bookworm-slim
ARG PNPM_VERSION=10.17.1

FROM ${NODE_IMAGE} AS builder
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
ARG PNPM_VERSION
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=inf02-pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN cd node_modules/onnxruntime-node && node script/install.js
COPY . .
RUN pnpm exec prisma generate --schema prisma/schema.prisma && pnpm run build

# Podar el árbol generado conserva los symlinks de pnpm y el cliente Prisma.
FROM builder AS prod-deps
RUN pnpm prune --prod

FROM ${NODE_IMAGE} AS runner-base
ENV NODE_ENV=production PORT=3001
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends libstdc++6 openssl \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs --home-dir /app --no-create-home nextjs
COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/scripts/scanner-visual-worker.mjs ./scripts/scanner-visual-worker.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/scanner-visual-engine.mjs ./scripts/scanner-visual-engine.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/scanner-visual-index.mjs ./scripts/scanner-visual-index.mjs
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
USER nextjs
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]

# La variante consume únicamente un contexto separado de código permitido; no datos privados.
FROM runner-base AS custody-runner
USER root
COPY --from=custody-ops --chown=0:0 --chmod=0444 /scripts/inf03-custody-common.mjs /scripts/inf03-custody-common.mjs
COPY --from=custody-ops --chown=0:0 --chmod=0444 /scripts/inf03-inventory-common.mjs /scripts/inf03-inventory-common.mjs
COPY --from=custody-ops --chown=0:0 --chmod=0444 /scripts/inf03-transfer-common.mjs /scripts/inf03-transfer-common.mjs
RUN chmod 0555 /scripts
USER nextjs

# Conservá el target legado como predeterminado para los builds existentes.
FROM runner-base AS runner
