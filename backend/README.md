# Backend — pokemon-cards-scanner-app

> API REST del backend de la PWA para escanear cartas Pokémon. Sirve el catálogo
> espejo de cartas, precios de mercado bajo demanda, colecciones con duplicados,
> links públicos de compartir y el sistema de amigos. Corre en el puerto **3001**
> y **no** comparte código con el frontend: los tipos del contrato están
> duplicados a mano (`frontend/types/api.ts` ↔ DTOs de acá).

## Stack (versiones exactas, no subir sin motivo)

| | Versión | Nota |
|---|---|---|
| Node | 22.20.0 | |
| pnpm | 10.17.1 | **Único gestor de paquetes.** Nunca npm ni yarn |
| NestJS | 12.x | ESM puro (`"type": "module"` en `package.json`) |
| TypeScript | 6.x | `module`/`moduleResolution`: `nodenext` |
| Prisma | **6.19.3 clavado** | Prisma 7 eliminó `url` del datasource: no subir |
| PostgreSQL | 16 | Puerto **55432** en el host (5432 suele estar ocupado) |
| Redis | 7 (ioredis 6) | Caché y flags de sync. Opcional: si no está, la app sigue |
| Vitest | 4.x | `fileParallelism: false` (ver [docs/testing.md](docs/testing.md)) |
| Lint | oxlint + tsgolint | `oxlint --type-aware src/ test/` |

## Arrancar

```bash
# 1. infra (Postgres :55432 + Redis :6379) desde la raíz del monorepo
docker compose up -d db redis

# 2. dependencias + schema + cliente de Prisma
pnpm install && pnpm run db:generate

# 3. migraciones (desde la raíz: prisma migrate deploy && prisma generate)
pnpm --dir . exec prisma migrate deploy

# 4. catálogo (20.670 cartas, ~85 requests, varios minutos)
pnpm run db:sync

# 5. API en watch
pnpm run start:dev          # http://localhost:3001/api
```

Desde la raíz del monorepo, `pnpm run dev` levanta API y web juntos.

Variables de entorno (`.env`, con los defaults de ejemplo):

| Variable | Default | Para qué |
|---|---|---|
| `DATABASE_URL` | `postgresql://pokemon:pokemon@localhost:55432/pokemon_cards` | Prisma |
| `REDIS_URL` | `redis://localhost:6379` | Caché de precios, rate, share, flags de sync |
| `PORT` | `3001` | Puerto del API |
| `FRONTEND_URL` | `http://localhost:3000` | Origen CORS por defecto |
| `CORS_ORIGINS` | — | Lista separada por comas; pisa a `FRONTEND_URL` |
| `JWT_SECRET` | `change-me-in-production` | Firma del access token (15 min) |
| `JWT_ACCESS_TTL` | `15m` | |
| `JWT_REFRESH_TTL_DAYS` | `30` | Vigencia del refresh token |
| `JWT_REFRESH_SECRET` | `change-me-too-in-production` | **Hoy no se usa**: ver nota en [docs/gotchas.md](docs/gotchas.md) |
| `ADMIN_KEY` | — | Sin valor, los endpoints de `/jobs` dan 403 |
| `CURRENCY_ARS_ENABLED` | — | Solo `'false'` desactiva los precios en ARS |
| `SHARE_BASE_URL` | `http://localhost:3001/api/s` | Base de las URLs públicas |
| `LOG_SQL` | — | `=1` loguea todas las queries de Prisma |

## Cómo está armado

- **Prefijo global `/api`**, `helmet()`, CORS con allowlist y
  `ValidationPipe({ whitelist: true, transform: true })` global (`src/main.ts:27`).
- **Auth**: access token JWT de 15 min + refresh token opaco (SHA-256 en BD) con
  rotación y detección de reuso. `JwtAuthGuard` se aplica con `@UseGuards`
  explícito por controller, **no** global.
- **Catálogo**: 20.670 cartas y 176 sets espejados en Postgres. La búsqueda usa
  índices trigram de `pg_trgm` + `ILIKE` en una sola query SQL.
- **Precios**: bajo demanda, cacheados en 2 capas (Redis 1 h + Postgres 24 h) y
  con una cola en background a ~26 req/min. Un handler público nunca llama a
  pokemontcg.io.
- **Moneda**: cotización USD→ARS desde DolarApi, cacheada 1 h en Redis. La
  conversión a ARS la aplica el cliente.

## Estructura de carpetas

```
backend/
├── prisma/
│   ├── schema.prisma          10 modelos, tablas snake_case vía @@map
│   └── migrations/            3 migraciones (una a mano: pg_trgm)
├── scripts/                   seed.ts · sync-full.ts · api-smoke.ts
├── src/
│   ├── main.ts                bootstrap: helmet, CORS, /api, ValidationPipe
│   ├── app.module.ts          ConfigModule, Throttler, Prisma, Redis, Jobs
│   ├── app.controller.ts      GET /api/health
│   ├── common/                guard JWT, decoradores @Public/@CurrentUser, tipos
│   ├── prisma/                PrismaService (@Global) + PrismaModule
│   ├── redis/                 RedisService tolerante a Redis caído (@Global)
│   ├── jobs/                  SyncSets / SyncCards / SyncPrices + controller admin
│   └── modules/               auth · users · cards · collections · share
│                              currency · friends · providers
└── docs/                      esta documentación
```

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm run start:dev` | API en watch (3001) |
| `pnpm run build` | `nest build` → `dist/` |
| `pnpm run start:prod` | `node dist/main` |
| `pnpm run lint` | oxlint type-aware |
| `pnpm run test` | Vitest (8 archivos, 104 tests) |
| `pnpm run test:watch` / `test:cov` / `test:debug` | Variantes de Vitest |
| `pnpm run test:e2e` | Solo `*.e2e-spec.ts` (hoy solo `/api/health`) |
| `pnpm run db:generate` | `prisma generate` |
| `pnpm run db:migrate` | `prisma migrate dev` ⚠️ dropea los índices trigram |
| `pnpm run db:seed` | Importa 2 páginas del catálogo + precios de muestra |
| `pnpm run db:sync` | Catálogo completo (reanudable) |

## Documentación

| Doc | Qué resuelve |
|---|---|
| [docs/api.md](docs/api.md) | Referencia de los 40 endpoints (+ `/health`): auth, DTOs, respuestas, errores, ejemplos |
| [docs/database.md](docs/database.md) | Los 10 modelos, las 3 migraciones, índices y patrones de query |
| [docs/modules.md](docs/modules.md) | Mapa de los 8 módulos y sus dependencias |
| [docs/providers.md](docs/providers.md) | Patrón `CardDataProvider`, `VARIANT_MAP`, cómo migrar a Scrydex |
| [docs/pricing.md](docs/pricing.md) | Precios bajo demanda, 2 capas de caché, cola y conversión ARS |
| [docs/jobs.md](docs/jobs.md) | Sync de catálogo y precios, reanudación, endpoints admin |
| [docs/testing.md](docs/testing.md) | Cómo escribir specs, por qué `fileParallelism: false` |
| [docs/gotchas.md](docs/gotchas.md) | **Las trampas**: fallas reales que costaron tiempo, leé esto primero |

Los tipos del contrato con el frontend están duplicados a mano: si tocás un DTO
de acá, actualizá `frontend/types/api.ts` en el mismo commit.
