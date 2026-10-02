# Plan Backend: Hardening, Jobs y Producción

> Plan de trabajo del backend. Lo hecho está marcado; lo que queda, con el
> motivo por el que quedó.

## Objetivo

Eliminar riesgos operativos, robustecer el backend para producción, ordenar los
jobs y dejar preparada la migración de proveedores.

## Restricciones

- Mantener NestJS 12, Prisma 6 y PostgreSQL 16. **No subir Prisma a 7**.
- No usar `prisma migrate dev` contra bases con los índices trigram a mano:
  los dropea. En deploy, `prisma migrate deploy`.
- Los handlers públicos **nunca** llaman a la fuente externa.
- Mantener `MIN_GAP_MS = 2300` de la cola de precios.
- Ownership siempre en el `where`, para que un id ajeno dé 404 y no 403.
- Cero N+1: `$queryRaw` y `DISTINCT ON`.
- Cualquier cambio de DTO se refleja en `frontend/types/api.ts` **en el mismo
  commit**.

## Fase 0: Baseline

```bash
pnpm --dir backend run lint
pnpm --dir backend run test
pnpm --dir backend run test:e2e
pnpm --dir backend run build
pnpm --dir backend exec prisma validate
```

## Fase 1: Cotizaciones ✅ hecho

`currency.service.ts:187` usaba `preferredView!` sobre un valor que puede ser
`null`: si la cotización preferida fallaba y la otra estaba disponible, el
endpoint tiraba 500. Ahora elige la que haya, devuelve el `rateType` **realmente
usado** y solo responde 503 si fallan las dos.

## Fase 2: Lock de catálogo ✅ hecho

`POST /api/jobs/sync-catalog` no tenía exclusión: dos llamadas simultáneas
corrían dos sincronizaciones contra la misma API externa y el mismo cursor de
Redis. Ahora hay un lock en Redis con token único, TTL y liberación atómica
(`SET NX` + `EVAL` de compare-and-delete), y un segundo `running` devuelve
`409` en vez de duplicar trabajo.

## Fase 3: Scheduler ✅ hecho

`ScheduleModule.forRoot()` es lo que activa los `@Cron`. Estaba en `package.json`
desde el principio y **no estaba en `app.module.ts`**, así que los decorators se
registraban y no se ejecutaban nunca.

| Job | Cada cuánto | Por qué ese ritmo |
|---|---|---|
| Sync de catálogo | `7 4 * * 1` (lunes 04:07) | 83 requests contra una cuota de 1.000/día. Diario serían 8,3 % del presupuesto en una tarea que el catálogo no necesita cada día, y la fuente es deprecada (keys muertas el 1/3/2027) |
| Backfill de precios | `13 * * * *` (cada hora) | Decisión medida: con `PRICE_PROVIDER=tcgdex` recién migrado, **20.667 de 20.670** cartas estaban sin precio vigente. 300/día tardaba 69 días en vaciar el backlog; 300/hora son 7.200/día y cada drenaje dura 12 min, así que la cola no le queda llena de cartas de backfill por delante de la que el usuario está mirando |
| Retención de `card_prices` | `23 3 1 * *` (mensual) | Corre la misma política del script, con los defaults de producción. Sin esto la tabla crece linealmente |

Todos apagables con `ENABLE_CATALOG_SYNC_CRON`, `ENABLE_PRICE_BACKFILL_CRON` y
`ENABLE_RETENTION_CRON`. **Una variable vacía no apaga**: `VAR=` en un compose es
más probable que sea un valor sin querer que una intención, y si vacío fuera
"apagado" un typo dejaría el sync sin correr hasta que el catálogo quedara viejo.

La orquestación del sync (`lock` + `ScanJob` + corrida) salió del controller a
`CatalogSyncService` porque la usan dos disparadores, y no por prolijidad: si el
cron tuviera su propio camino, el lock solo se pediría en el endpoint, y "alguien
pidió el sync mientras ya había uno corriendo" multiplicaría los requests contra
pokemontcg.io. Un test fija que un segundo `start` no arranca nada.

**El backfill** es la última pieza de la migración de proveedores: la maquinaria
de coexistencia ya estaba, faltaba que la fuente nueva escribiera. Encola, no
pide: pasar por la cola es lo que garantiza que compita en el mismo reloj global
que las lecturas públicas. Hay un test que asserta que `getCardPrices` no se
llama nunca.

### Un bug que encontró la verificación end-to-end

`WHERE ${scope} AND NOT EXISTS (...)` con el scope opcional produce `WHERE AND
NOT EXISTS (...)` cuando no hay scope: error de sintaxis, con el cron horario
entero fallando cada hora. Ningún test unitario lo vio porque todos pasaban
scope. Lo encontró un spec temporal contra la base de verdad. Ahora el `WHERE`
se arma con `Prisma.join` de una lista de condiciones, que pone el `AND` quien
corresponde.
## Fase 4: Cola de precios persistente ✅ hecho

La cola era un array en memoria y, peor, el ritmo también: `lastProviderCallAt`
era un `Date.now()` en memoria, o sea **un reloj por proceso**. Con dos
instancias del backend el ritmo real hacia TCGdex se duplicaba, que es la
restricción más dura del proyecto.

Ahora hay tres piezas y una tabla:

- `price_refresh_jobs`: una fila por carta, `cardId` único como deduplicación
  (el refresh no es por variante, así que no hace falta la `deduplicationKey` que
  decía este plan), `availableAt` como backoff y reloj del claim, y
  `FOR UPDATE SKIP LOCKED` para el claim.
- `provider_rate_limits`: una fila por proveedor. El hueco se toma con un
  `UPDATE` condicional, y si está tomado el que espera lee cuándo se liberó y
  duerme esa diferencia. **Es lo que hace que el `MIN_GAP_MS` sea global.**
- `PriceQueueWorker`: el loop, con un `catch` que lo mantiene vivo si la DB falla.

Y un cambio de semántica que la cola hacía necesario: `fetchAndStore` propaga el
fallo del proveedor en vez de tragárselo. Antes un 500 de tcgdex y una carta que
tcgdex no tiene se veían igual, así que un proveedor caído se guardaba como
"terminado" y no se volvía a pedir nunca.

`main.ts` también ganó `enableShutdownHooks()`: sin eso, un SIGTERM no frena el
worker y la fila que tenía tomada queda en `processing` hasta que la recupera el
arranque siguiente.

**Verificado**: los tests de dos instancias sobre la misma base (nunca la misma
fila, y el gap respetado entre las dos), la recuperación de `processing`
abandonados, y el backoff. Ver [gotchas.md](../../backend/docs/gotchas.md) §33.

## Fase 3.5: Cursor de sync y recuperación de jobs ✅ hecho

El cursor del sync eran dos claves Redis sin TTL y de granularidad global. Un
`flushall` reiniciaba el sync desde la página 1 —83 requests de una cuota de
1.000/día para comprobar algo que la base ya sabía— y el día que entre un segundo
proveedor de catálogo ambos syncs compartirían el mismo número de página. Ahora es
una fila de `sync_state` con id `cards:<providerId>`.

`JobsRecoveryService` reconcilia en el arranque lo que quedó a medias: los
`processing` de la cola y los `running` de `scan_jobs`, que antes quedaban
colgados para siempre y un `GET /api/jobs/:id` seguía diciendo `running`.

El cursor se migra con `pnpm run sync-state:migrate`, que no puede ser una
migración de Prisma porque una migración no puede leer Redis. Ver
[gotchas.md](../../backend/docs/gotchas.md) §34.

## Fase 5: Retención de `card_prices` ✅ hecho

`card_prices` es append-only sin poda. Ahora hay una política y un script con dry
run por default (`pnpm run prices:retention`).

La decisión no fue "borrar lo viejo" sino **consolidar**: los días fuera de la
ventana de detalle (90) se colapsan a un punto por día, y el histórico (730)
poda días completos sin tocar nunca la última fila de un grupo.

El motivo está medido, no supuesto: `CardsService.referencePrices` toma la fila
más reciente **más vieja que la ventana** como precio de referencia del delta de
30 días. Un `DELETE` por edad rompería el delta de las cartas viejas —pasa a
`null` y la píldora de variación desaparece sin error— y dejaría sin fallback a
las cartas que solo tienen precio viejo. Consolidar preserva las dos cosas.

Lo que se midió y quedó documentado en `pricing.md`: los índices pesan 5,5x la
tabla, y el índice de 3 columnas tiene `idx_scan = 0`. **No se dropea** porque
`idx_scan` de una base de 184 filas no distingue "nadie lo usa" de "el planner no
lo eligió": la decisión necesita las estadísticas del volumen real.

## Fase 6: Redis degradado ✅ hecho

`redis.service.ts` caía a "sin caché" en silencio. Ahora:

- `GET /api/health` expone `detail.redis` con `configured`, `available`,
  `degradedSince` y `lastErrorAt`. **`status` sigue siendo `ok`**: la app
  funciona sin Redis, y un `503` haría que un orquestador matara un pod sano. Lo
  que se informa es la degradación, para alerting, y el `status` no miente.
- Los avisos de degradación tienen **rate limit de 1/min por tipo de
  operación**, y el siguiente aviso dice cuántos se suprimieron. Sin eso, una
  Redis que está arriba pero fallando generaba un `warn` por request.

**Hallazgo que la fase destapó y que sigue abierto**: la caché **no se
recupera sola**. `retryStrategy` abandona a los 3 reintentos y nada reconecta,
así que después de un corte de Redis el proceso queda sin caché hasta que se
reinicie. No es una regresión de este commit —ya era así— pero antes era
invisible; ahora el health lo muestra. Es un follow-up de unas líneas, no lo
metí porque no estaba en el alcance de la fase.

## Fase 7: Sets sin mapeo de precios

`cel25c` y `me55c` (Classic Collection) no mapean a TCGdex a propósito: la
numeración de pokemontcg.io no coincide con la de TCGdex y la validación los
rechaza. Documentado en `backend/docs/jobs.md`.

Se cierra explícitamente para que no quede colgando como pendiente: **no hay nada
que implementar**. Si algún día se quiere, es sumarlos a `SET_ID_OVERRIDES` en
`tcgdex-set-mapping.service.ts` y correr `pnpm run db:map-tcgdex -- --retry-misses`.

## Fase 8: Base de tests separada ✅ hecho (el E2E sigue abierto)

Los specs corren contra `DATABASE_URL_TEST`, o contra una base **derivada** de
`DATABASE_URL` con el nombre terminado en `_test`. Por omisión nunca tocan la base
de desarrollo, sin configurar nada: `pnpm run test:db:setup` la crea una vez como
**copia**, porque varios specs dependen del catálogo espejado (`cards.service.spec`
mide el tramo cotizado de `sort=price` sobre las 20.670 cartas reales).

El `pg_dump` va por Docker porque el host no tiene client tools de Postgres, y el
script **se niega a correr** si el nombre de la base no contiene "test": es la
única barrera contra un DROP sobre la base equivocada.

### El guard que hacía falta antes que la base

Con la cola de precios persistente, los specs dejaron de ser deterministas: un
backend corriendo drena la **misma** `price_refresh_jobs` y se lleva los jobs que
un test acaba de encolar. La falla no era del código, pero se veía como si lo
fuera. `test/global-setup.ts` falla rápido con el motivo y el comando para
arreglarlo, y avisa que la suite necesita el puerto de la API libre.

### Lo que sigue abierto

E2E de verdad. Hay `scripts/verify-app.mjs`, que es un chequeo de humo
**end-to-end contra el stack corriendo**: health, carta, precio, histórico,
búsqueda por nombre y por número, orden por precio, registro, colección, totales,
filtro de intercambio, link público y las seis pantallas del frontend. Sale con
código 1 si algo falla, así que sirve después de un cambio de esquema o de un
deploy (`pnpm run verify:app`).

No es un e2e de integración: no hay login por UI, ni cobertura de rutas, ni
asserts sobre DOM. Falta auth por UI, ownership y esos casos.

## Fase 9: Deploy — parcial

Esta fase quedó **pospuesta por pedido del usuario** para cerrar primero el
backfill y verificar el funcionamiento de la app local. No se intenta levantar
el perfil `deploy` hasta retomar esta fase.

Lo que estaba mal era **peor** que lo que decía este plan:

- **La imagen del backend no construía.** No por el healthcheck, sino porque
  `corepack enable` a secas descarga la última pnpm publicada —hoy 12.x—, que ya
  no lee `onlyBuiltDependencies` desde `package.json`, y el install moría con
  `ERR_PNPM_IGNORED_BUILDS`. El `packageManager` del package.json raíz no ayuda:
  el contexto del build es `./backend`, que no lo tiene. Ahora
  `ARG PNPM_VERSION=10.17.1` lo fija.
  **Sin verificar**: no se comprobó que la imagen llegue a construir.
- El healthcheck del backend **sí** estaba declarado, en el `Dockerfile`, y
  `depends_on: backend: condition: service_healthy` lo honra. El diagnóstico de
  este plan era incorrecto en ese punto.
- **Los secretos por defecto siguen puestos** (`change-me-in-production`). Es lo
  más urgente que queda: con esos valores, cualquiera que firmara un token con el
  secret público del repo firmaría tokens válidos.
- **No hay backup/restore de PostgreSQL documentado ni probado.**

## Fase 10: Documentación

✅ Actualizados `backend/docs/api.md`, `jobs.md`, `pricing.md`, `testing.md`,
`gotchas.md`, `README.md`, `.env.example`, `AGENTS.md`, `docs/data-sources.md` y
este plan para reflejar la cola persistente, el scheduler, la política de
proveedores, la retención, el health de Redis y la base aislada de tests.

La documentación de deploy/backup se completa al retomar la Fase 9, junto con
la verificación de la imagen en Docker.
