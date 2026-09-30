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

## Fase 3: Scheduler

`@nestjs/schedule` está en dependencias pero **no hay ningún `@Cron`**. El sync
del catálogo es manual (`pnpm run sync`) y el de precios, bajo demanda.

Lo que falta y por qué no se hizo junto con el lock:

- Un cron de catálogo necesita una decisión de producto primero: la fuente
  externa es deprecada y las keys mueren el **1 de marzo de 2027**, así que
  automatizar el sync de una fuente que va a morir es trabajo que puede quedar
  viejo.
- Un cron de precios sí tiene sentido, pero convive mal con una cola en memoria:
  ver Fase 4.

## Fase 4: Cola de precios persistente

Hoy la cola es **en memoria** (`sync-prices.service.ts`). Un reinicio del backend
pierde lo pendiente, y `scan-capture.controller.ts` depende de ella para capturar
cartas.

El diseño está detallado en `backend/docs/pricing.md` §"Cola persistente".
Resumen: tabla `price_refresh_jobs` con `deduplicationKey`, `attempts`,
`availableAt` y estados `pending`/`processing`/`completed`/`failed`, worker
secuencial con el mismo `MIN_GAP_MS`, y recuperación de `processing` abandonados
al arrancar.

**Por qué no está hecho:** es un cambio de esquema y de flujo de datos, no un
fix. Toca el path que maneja el rate limit externo, que es la restricción más
dura del proyecto (`AGENTS.md` §3.1). Merece su propio commit con su propia
verificación de que el throttling se sigue respetando.

## Fase 5: Retención de `card_prices`

`card_prices` es **append-only sin poda**. El histórico es una feature válida,
pero el almacenamiento crece sin techo y las consultas de variación se
entrecifican.

Falta definir la política (conservar N días en detalle y consolidar a un punto
diario más atrás, nunca borrando el último precio vigente). Antes hay que medir
filas y tamaño de índices reales; la decisión depende de eso.

## Fase 6: Redis degradado

`redis.service.ts` cae a "sin caché" en silencio. Es resiliente, y está bien que
lo sea, pero una caída sostenida de Redis es indistinguible de un cache miss
frío: sube la latencia y el tráfico externo sin que nada lo indique. Falta
exponer el estado en el health detail y limitar el rate de los logs de
degradación.

## Fase 7: Sets sin mapeo de precios

`cel25c` y `me55c` (Classic Collection) no mapean a TCGdex a propósito: la
numeración de pokemontcg.io no coincide con la de TCGdex y la validación los
rechaza. Documentado en `backend/docs/jobs.md`; no es un bug.

## Fase 8: E2E y aislamiento de tests

La suite es buena en servicios y casi inexistente en integración: el único e2e
verifica health. Falta auth, ownership, precios, sharing y jobs.

**Por qué no está hecho junto con lo anterior:** los tests actuales corren
contra la **base de desarrollo** y hay specs que limpian usuarios globalmente.
Agregar E2E contra esa base sería hacer la suite destructiva. Lo correcto es una
base de tests separada (`DATABASE_URL_TEST`, esquema temporal, fixtures
deterministas, prohibición de correr contra una base no marcada como test), y
eso es un proyecto en sí mismo.

## Fase 9: Deploy

`docker-compose.yml` tiene perfil `deploy` con backend y frontend, pero:

- Los secretos por defecto (`change-me-in-production`) están puestos y solo
  funcionan si nadie overridea nada.
- El healthcheck del backend no está declarado, y el frontend declara
  `depends_on: backend: condition: service_healthy` — lo que hace que el perfil
  `deploy` no arranque.
- No hay backup/restore de PostgreSQL documentado ni probado.

## Fase 10: Documentación

`backend/docs/api.md`, `jobs.md`, `pricing.md`, `testing.md` y `gotchas.md`, más
`README.md` y `docs/`.
