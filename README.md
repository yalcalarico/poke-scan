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

### Probar en el celu por Wi-Fi

Corré `pnpm run lan:cert` e instalá la CA local en el celu siguiendo
[la guía de red local](docs/local-network.md). Después, `pnpm run dev:lan` levanta
HTTPS y muestra la dirección que tenés que abrir. Incluye el acceso a la API y
permite probar la cámara sin Cloudflare ni publicar la app.

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
└── package.json         comandos de desarrollo, tests y verificación
```

Dos proyectos independientes, sin monorepo. Cada uno con su `package.json` y su
lockfile. Los tipos del contrato están duplicados a mano
(`frontend/types/api.ts` ↔ DTOs del backend): **si tocás un DTO, actualizá el
otro lado.**

---

## Qué hace

| Pantalla | Qué resuelve |
|---|---|
| **Escanear** | Cámara automática en teléfonos o foto subida → DINOv2 en la API → primera predicción y precio en la sesión. Requiere conexión y cuenta. |
| **Buscar** | Catálogo completo de 20.670 cartas con búsqueda difusa (tolerante a typos), búsqueda por nombre, número o artista, filtros por set y rareza, y orden por nombre, precio, rareza o número. |
| **Colecciones** | Nombres y duplicados, valor total, portada con tus cartas, progreso por set y binder, qué marcar para intercambio. |
| **Comparte** | Link público de solo lectura, o el sistema de amigos. |
| **Perfil** | Moneda (USD/ARS), enlaces compartidos, cuenta. |

App instalable (PWA): se agrega a la pantalla de inicio. Algunos datos visitados quedan en caché; reconocer cartas y sincronizar requiere conexión.

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
- ✅ Verificación integral con `pnpm run check` (backend y frontend)
- ✅ Autenticación con rotación de tokens y detección de reuso
- ✅ Reconocimiento DINOv2 con verificación geométrica, cámara automática móvil y selección del candidato #1
- ✅ Precios USD y ARS con caché de 2 capas
- ✅ Identidad/procedencia de proveedores, cola de precios persistente y ritmo global
- ✅ Backfill horario de precios del proveedor activo
- ✅ Links públicos + sistema de amigos
- ✅ Búsqueda por nombre/número/artista, orden por precio, filtro server-side de intercambio
- ✅ Suite aislada en `pokemon_cards_test`; smoke test end-to-end (`pnpm run verify:app`)
- ⏳ Deploy de producción: imagen Docker corregida pero build no verificado; faltan secrets de producción y backup/restore probado

### Limitaciones conocidas

- **La API de cartas está deprecada.** pokemontcg.io no da keys nuevas y las
  existentes mueren el 1/3/2027. Hay una capa de abstracción lista para migrar a
  Scrydex. Ver [`docs/data-sources.md`](docs/data-sources.md).
- **DINOv2 puede confundir reimpresiones o acabados.** Revisá la edición al organizar la sesión; también hay búsqueda manual. Requiere modelo e índice locales en la API y una sesión autenticada.
- **Las claves de pokemontcg.io mueren el 1/3/2027.** El sync semanal es
  configurable; Scrydex sigue pendiente de decisión de producto y costo.
- **Redis no se reconecta solo** si falla después de agotar los reintentos. El
  health lo informa como degradado y la app sigue sirviendo sin caché; hace falta
  reiniciar el backend para que vuelva a conectarse.
- **El smoke test no reemplaza Playwright/E2E por navegador.** `verify:app`
  comprueba HTTP real de API y páginas, mientras auth/ownership/UI se cubren
  parcialmente por tests de servicio y componentes.
- **El deploy sigue pendiente.** El stack local funciona; la imagen del backend
  tiene pnpm fijado pero aún no se comprobó el build final, y faltan secrets y
  backup/restore de producción.
- **Las rutas inexistentes devuelven HTTP 200** renderizando la 404, por el
  streaming de Next 16. Ver `frontend/docs/routes.md`.

## Planes de trabajo

| | |
|---|---|
| [`docs/plans/01-frontend-product.md`](docs/plans/01-frontend-product.md) | Integraciones de producto, robustez del scanner y sincronización de docs |
| [`docs/plans/02-backend-production.md`](docs/plans/02-backend-production.md) | Cotizaciones, lock de jobs y lo que falta para producción |

Los dos planes marcan **qué se hizo** y **qué quedó con su motivo**. No son una
lista de deseos: registran las decisiones abiertas y los límites operativos del
producto.
