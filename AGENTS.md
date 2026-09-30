# AGENTS.md — instrucciones para agentes que trabajan en este proyecto

Leé esto **antes de tocar código**. Está escrito para un agente que no tiene
contexto previo del proyecto ni de las decisiones que lo dieron forma.

---

## 1. Qué es el proyecto

PWA mobile-first para **escanear cartas Pokémon con la cámara**, consultar su
**valor de mercado**, gestionar **colecciones personales** con control de
duplicados, y **compartir** el catálogo por link público o con amigos.

Dos proyectos **independientes** en la raíz, sin monorepo y sin workspaces:

```
pokemon-cards-scanner-app/
├── frontend/     Next.js 16 · React 19 · TypeScript · Tailwind 4
├── backend/      NestJS 12 · Prisma 6 · PostgreSQL 16
└── docker-compose.yml   Postgres + Redis
```

Cada uno tiene su `package.json`, su `pnpm-lock.yaml` y su `node_modules`.
**No comparten código**: los tipos del contrato están duplicados a mano
(`frontend/types/api.ts` ↔ DTOs del backend). Si tocás un DTO, actualizá el
otro lado en el mismo commit.

---

## 2. Versiones exactas (no las actualices sin motivo)

| | Versión | Nota |
|---|---|---|
| Node | 22.20.0 | Hay un `.nvmrc`-equivalente en `engines` |
| pnpm | 10.17.1 | **Único gestor de paquetes.** Nunca uses npm ni yarn |
| Next | 16.3.6 | App Router, Turbopack |
| React | 19.2.8 | StrictMode monta efectos **dos veces** en dev |
| NestJS | 12.1.0 | ESM + TypeScript 6 |
| Prisma | 6.19.3 | **No subir a 7**: Prisma 7 eliminó `url` del datasource |
| Tailwind | 4.x | Config por CSS, sin `tailwind.config.js` |
| tesseract.js | 7.0.0 | **Solo cliente**, nunca en el server |

---

## 3. ⚠️ Restricciones críticas (romper estas rompe la app)

### 3.1 Rate limit de la API externa — el límite más importante del proyecto

La fuente de datos es **pokemontcg.io v2 sin API key** (la API está deprecada,
ya no se dan keys nuevas).

| Límite | Valor |
|---|---|
| Requests por día | **1.000** |
| Requests por minuto | **30** |

De ahí salen decisiones de arquitectura en todo el código. **Nunca** llames a
pokemontcg.io desde un handler de request público. El flujo permitido es:

1. El catálogo de 20.670 cartas ya está **espejado en PostgreSQL** (sync manual/semanal).
2. Los **precios se piden bajo demanda** y se cachean 2 capas (Redis 1 h + Postgres 24 h).
3. Hay una **cola en background** con 2,3 s entre requests (~26/min).

Si tocás algo que genere requests externos, respetá el throttling.

### 3.2 Puerto de Postgres: **55432**, no 5432

El host expone Postgres en `localhost:55432` porque el 5432 suele estar ocupado
por un Postgres local del usuario. **Adentro del contenedor sigue siendo 5432.**

```
DATABASE_URL=postgresql://pokemon:pokemon@localhost:55432/pokemon_cards
```

### 3.3 ESM: los imports relativos llevan extensión `.js`

Ambos proyectos compilan a ESM. Un import sin extensión rompe el runtime aunque
TypeScript no se queje:

```ts
import { AppModule } from './app.module.js';   // ✅
import { AppModule } from './app.module';     // ❌ rompe en runtime
```

### 3.4 Las columnas son camelCase, las tablas snake_case

Prisma `@@map()` renombra la **tabla**, no las **columnas**. En SQL crudo:

```sql
SELECT "cardId" FROM card_prices;   -- ✅
SELECT "cardId" FROM card_prices;   -- ❌ "cardid" no existe
```

Las tablas están en snake_case (`card_prices`, `collection_items`), las columnas
en camelCase (`cardId`, `isActive`, `fetchedAt`).

### 3.5 `pg_trgm` no lo modela Prisma

La extensión y los índices trigram se crean en una **migración a mano**
(`prisma/migrations/20260925180600_add_pg_trgm/migration.sql`), no en el schema.
Si corrés `prisma migrate dev` y Prisma detecta los índices GIN como objetos
desconocidos, **te los va a dropear** y la búsqueda difusa pasa a un seq scan
sobre 20k cartas. Si pasa, restaurarlos antes de seguir.

### 3.6 Tesseract solo en el cliente

`tesseract.js` **nunca** debe entrar en el grafo del server. `pnpm run build`
falla si un Server Component lo importa. Todo lo que lo use va en un módulo
importado dinámicamente (`await import('tesseract.js')`) dentro de una función,
o en un archivo `'use client'`.

---

## 4. Comandos

Todo se corre con **pnpm** desde la raíz o desde la carpeta del proyecto.

```bash
pnpm run help            # lista los 33 comandos
pnpm run setup           # primera vez: deps + infra + schema
pnpm run dev             # API + web en paralelo, Ctrl+C baja ambos
pnpm run doctor          # diagnóstico del entorno
pnpm run check           # lint + types + tests + build
pnpm run stop            # liberar puertos 3000/3001
```

También existe `make <comando>` (equivalente), pero **el `make` de macOS no
funciona sin la licencia de Xcode CLItools**. No dependas de él.

### Puertos

| | |
|---|---|
| Web | 3000 |
| API | 3001 |
| Postgres (host) | 55432 |
| Redis | 6379 |

---

## 5. Verificar antes de dar algo por terminado

Ningún cambio se considera terminado sin esto en verde:

```bash
pnpm run check    # lint + typecheck + tests + build, todo proyecto
```

Y si tocaste algo con impacto de datos, probá el flujo real contra el stack
levantado (`pnpm run dev`), no solo los tests.

---

## 6. Documentación específica

| Tema | Dónde |
|---|---|
| Sistema completo, flujo de datos | [`docs/architecture.md`](docs/architecture.md) |
| Fuentes de datos, rate limits, migración a Scrydex | [`docs/data-sources.md`](docs/data-sources.md) |
| Decisiones de diseño y por qué | [`docs/decisions.md`](docs/decisions.md) |
| **API** (endpoints, auth, formas) | [`backend/docs/api.md`](backend/docs/api.md) |
| **Base de datos** (modelos, queries) | [`backend/docs/database.md`](backend/docs/database.md) |
| **Jobs y sync** | [`backend/docs/jobs.md`](backend/docs/jobs.md) |
| **Sistema de precios** | [`backend/docs/pricing.md`](backend/docs/pricing.md) |
| **Tests backend** | [`backend/docs/testing.md`](backend/docs/testing.md) |
| **Trampas del backend** | [`backend/docs/gotchas.md`](backend/docs/gotchas.md) |
| **Rutas y pantallas** | [`frontend/docs/routes.md`](frontend/docs/routes.md) |
| **Componentes** | [`frontend/docs/components.md`](frontend/docs/components.md) |
| **Cómo se trabaja en el frontend** | [`frontend/docs/build-guide.md`](frontend/docs/build-guide.md) |
| **Pipeline del escáner** | [`frontend/docs/scanner.md`](frontend/docs/scanner.md) |
| **Cliente HTTP y sesión** | [`frontend/docs/api-client.md`](frontend/docs/api-client.md) |
| **Design system** | [`frontend/docs/design-system.md`](frontend/docs/design-system.md) |
| **Tests frontend** | [`frontend/docs/testing.md`](frontend/docs/testing.md) |
| **Trampas del frontend** | [`frontend/docs/gotchas.md`](frontend/docs/gotchas.md) |
| **Historia del rediseño** (plan y estado) | [`frontend/docs/redesign-2026.md`](frontend/docs/redesign-2026.md) |

---

## 7. Convenciones de código

- **Idioma**: comentarios, mensajes al usuario y docs en **español rioplatense**
  ("Escaneá", "Sumá", "Consultá"). Los identificadores en inglés.
- **Comentarios**: explican **por qué**, no **qué**. Si el código se explica solo,
  no hace falta comentario.
- **sin `any`**. Si el tipo es unknowable, tipalo con un guard.
- **Validación de input**: DTOs de `class-validator` + `ValidationPipe` global
  con `whitelist: true`. Ningún input llega al service sin pasar por el DTO.
- **Ownership siempre en el `where`**, no como check aparte:
  `findFirst({ where: { id, userId } })` para que un id ajeno dé 404 y no 403
  (un 403 confirma que el recurso existe).
- **Cero N+1**: agregaciones con `$queryRaw` y `DISTINCT ON`, no loops que
  consulten.
- **Errores en español**, y nunca filtrar datos privados (email, passwordHash)
  en endpoints públicos.

---

## 8. El frontend tiene una sola versión

> Si llegás hoy y no sabés de esto, esta es la sección más importante del archivo.

El rediseño de UI/UX **terminó y se activó de golpe** (el "flip", 2026-09-28). No
hay dos apps, ni un prefijo de versión, ni una carpeta de "código viejo". El árbol
es el que ves: design system con tokens y tema claro/oscuro, 27 primitivas en
`components/ui/`, 13 rutas de página y una landing pública separada de la app PWA.

**No existe la regla "no toques la v1"**, porque no hay v1. Lo que queda de ella es
una regla de ubicación, que sí importa: si algo del rediseño necesitaba algo de la
app anterior, **se copió o se reimplementó; no se importó**, y el código viejo no
está. Los módulos sin JSX y sin estado (`hooks/use-auth`, `hooks/use-currency`,
`lib/format`, `lib/variants`, `lib/pokemon`, `lib/api/**`, `lib/scanner/**`) sí se
comparten entre las dos capas de la app, pero **no con el backend**: la duplicación
que importa es la de los tipos del contrato (§1).

### La estructura del `app/`

| Carpeta | Qué monta | `BottomNav` |
|---|---|---|
| `app/layout.tsx` + `app/providers.tsx` | `<html>`, metadata, script anti-flash, skip link, y los cuatro providers (`Theme` · `Auth` · `Currency` · `Toast`) | — |
| `app/(marketing)/` | Landing pública `/` y FAQ `/faq`, con `MarketingShell` | no |
| `app/(app)/` | `<AppShell>`: inicio `/inicio`, buscar, escanear, colecciones y ajustes | **sí** |
| `app/(auth)/` | `<PlainShell>`: login y registro | no |
| `app/share/` | `<PlainShell>`: la colección compartida pública | no |

Los providers están **arriba, en el layout raíz**, y no en los layouts de rama: son
de la app entera, y montarlos por rama los duplicaría y el estado de la moneda y
del tema se perdería al navegar. Los layouts de rama solo pintan el canvas y
deciden si hay `BottomNav`. La PWA abre `/inicio`; `/` queda para adquisición.
La razón por la que las cuatro ramas son carpetas hermanas y no route groups
anidados está en `frontend/docs/gotchas.md` §17.

### El linter de colores está enganchado

`frontend/scripts/check-no-raw-colors.mjs` corre como parte de `pnpm --dir frontend
run lint`, y sus raíces son **`app`, `components`, `lib` y `hooks`**. **Un color
crudo de Tailwind rompe el build.** Antes miraba solo las carpetas de la app nueva,
porque la app anterior usaba la paleta default en cientos de lugares; con una sola
versión, el guard es real.

### Dónde está la documentación

| Tema | Dónde |
|---|---|
| **Reglas de estilo** (la fuente de verdad) | [`frontend/docs/design-system.md`](frontend/docs/design-system.md) |
| **Cómo se trabaja acá** | [`frontend/docs/build-guide.md`](frontend/docs/build-guide.md) |
| Inventario de componentes | [`frontend/docs/components.md`](frontend/docs/components.md) |
| Rutas y pantallas | [`frontend/docs/routes.md`](frontend/docs/routes.md) |
| Historia del rediseño (plan de las 8 fases) | [`frontend/docs/redesign-2026.md`](frontend/docs/redesign-2026.md) |

`frontend/docs/gotchas.md` tiene las trampas que siguen vivas (§1–§25) y, al final,
una sección de histórico (§H) con las decisiones que se tomaron **a propósito** y
cuyo código ya no existe. Ninguna de las dos es opcional: las §H son el porqué de
cosas que hay que seguir respetando.

### Verificarla

```bash
pnpm run typecheck        # desde la raíz
pnpm --dir frontend run lint    # incluye check-no-raw-colors.mjs
pnpm --dir frontend run test    # incluye el test de regresión de cn()
```

O, todo junto, `pnpm run check` (lint + typecheck + tests + build de los dos
proyectos). **Ningún cambio del frontend está terminado sin `pnpm run check` en
verde** — el guard de colores es parte de eso.

> Si el typecheck falla con un error que no podés explicar leyendo el archivo, y da
> un resultado distinto en la segunda corrida, no estás arreglando código. Es
> `tsconfig.tsbuildinfo` stale, o un `next dev` corriendo que escribe los tipos de
> ruta al mismo tiempo. Ver `frontend/docs/gotchas.md` §18.

### Lo que quedó a medias

Tres capacidades que el backend **ya tiene** y cuya UI quedó con un honesto "esto
todavía no funciona": el modo de búsqueda por número y artista (B1), el orden por
precio (B2) y el filtro "para intercambio" server-side (B6). Ninguna bloquea una
pantalla. Está en `frontend/docs/redesign-2026.md` §10.2.
