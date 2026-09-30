# Pokémon Cards Scanner

PWA mobile-first para **escanear cartas Pokémon con la cámara**, consultar su
**valor de mercado**, gestionar **colecciones personales** con control de
duplicados, y **compartirlas** por link público o con amigos.

Precios en **USD** y **ARS** (dólar blue / oficial).

---

## Arranque rápido

```bash
pnpm run setup    # primera vez: deps + Postgres/Redis + schema
pnpm run sync     # carga el catálogo de 20.670 cartas (varios minutos)
pnpm run dev      # levanta API + web juntos, Ctrl+C baja ambos
```

| | |
|---|---|
| **Web** | http://localhost:3000 |
| **API** | http://localhost:3001/api/health |
| **Diagnóstico** | `pnpm run doctor` |
| **Todos los comandos** | `pnpm run help` |

> `make <comando>` también funciona (son equivalentes), pero el `make` de macOS
> necesita la licencia de Xcode CLItools. Si te dice que no la aceptaste,
> usá `pnpm run`.

### Requisitos

Node 22 · pnpm 10 · Docker Desktop. Nada más.

---

## Estructura

```
pokemon-cards-scanner-app/
├── frontend/            Next.js 16 · React 19 · Tailwind 4   (puerto 3000)
├── backend/             NestJS 12 · Prisma 6 · PostgreSQL   (puerto 3001)
├── docs/                arquitectura, fuentes de datos, decisiones
├── scripts/             utilidades de desarrollo
├── docker-compose.yml   Postgres (55432) + Redis (6379)
├── AGENTS.md            ← leelo antes de tocar código
├── Makefile             atajo equivalente a pnpm run
└── package.json         33 scripts de orquestación
```

Dos proyectos independientes, sin monorepo. Cada uno con su `package.json` y su
lockfile. Los tipos del contrato están duplicados a mano
(`frontend/types/api.ts` ↔ DTOs del backend): **si tocás un DTO, actualizá el
otro lado.**

---

## Qué hace

| Pantalla | Qué resuelve |
|---|---|
| **Escanear** | Apunta la cámara → OCR en el dispositivo → identifica la carta en el catálogo y te muestra el precio. Sin internet. |
| **Buscar** | Catálogo completo de 20.670 cartas con búsqueda difusa (tolerante a typos), búsqueda por nombre, número o artista, filtros por set y rareza, y orden por nombre, precio, rareza o número. |
| **Colecciones** | Nombres y duplicados, valor total, portada con tus cartas, progreso por set y binder, qué marcar para intercambio. |
| **Comparte** | Link público de solo lectura, o el sistema de amigos. |
| **Perfil** | Moneda (USD/ARS), enlaces compartidos, cuenta. |

App instalable (PWA): se agrega a la pantalla de inicio y funciona offline.

---

## Documentación

**[`AGENTS.md`](AGENTS.md)** es el punto de partida de cualquier agente: stack,
versiones exactas, las restricciones que rompen la app si se incumplen, y
convenciones de código.

| | |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Cómo se arma el sistema y por qué |
| [`docs/data-sources.md`](docs/data-sources.md) | pokemontcg.io, DolarApi, rate limits, cómo migrar a Scrydex |
| [`docs/decisions.md`](docs/decisions.md) | 18 decisiones de diseño con sus alternativas descartadas |
| [`backend/docs/`](backend/docs/) | API, base de datos, módulos, precios, jobs, testing, trampas |
| [`frontend/docs/`](frontend/docs/) | Rutas, componentes, escáner, cliente API, design system, testing, trampas |

---

## Estado

- ✅ 20.670 cartas · 176 sets sincronizados
- ✅ 223 tests backend · 336 frontend
- ✅ Autenticación con rotación de tokens y detección de reuso
- ✅ Escáner por cámara con OCR (acierta ~7/8 cartas, la UI siempre confirma)
- ✅ Precios USD y ARS con caché de 2 capas
- ✅ Links públicos + sistema de amigos
- ✅ Orden por precio en el catálogo y en la colección
- ⏳ Deploy a producción

### Limitaciones conocidas

- **La API de cartas está deprecada.** pokemontcg.io no da keys nuevas y las
  existentes mueren el 1/3/2027. Hay una capa de abstracción lista para migrar a
  Scrydex. Ver [`docs/data-sources.md`](docs/data-sources.md).
- **El OCR no es perfecto.** ~7/8 cartas. Por eso siempre hay confirmación
  manual y búsqueda a mano.
- **El OCR necesita ~12 MB** en el primer uso (ya auto-hospedados, cacheados
  por el service worker).
- **La cola de refresco de precios vive en memoria.** Un reinicio del backend
  pierde lo pendiente.
- **El histórico de precios no tiene poda.** `card_prices` es append-only y
  crece sin techo.
- **Los jobs no están programados.** El sync de catálogo es manual; hay un lock
  distribuido que impide dos syncs a la vez, pero ningún cron.
- **La E2E es mínima.** Solo health; falta auth, ownership, precios y sharing.
- **Las rutas inexistentes devuelven HTTP 200** renderizando la 404, por el
  streaming de Next 16. Ver `frontend/docs/routes.md`.

## Planes de trabajo

| | |
|---|---|
| [`docs/plans/01-frontend-product.md`](docs/plans/01-frontend-product.md) | Integraciones de producto, robustez del scanner y sincronización de docs |
| [`docs/plans/02-backend-production.md`](docs/plans/02-backend-production.md) | Cotizaciones, lock de jobs y lo que falta para producción |

Los dos planes marcan **qué se hizo** y **qué quedó con su motivo**. No son una
lista de deseos: son el registro de por qué el backend tieneScheduler pero no
tiene cron, y de por qué la cola de precios no se persistió todavía.
