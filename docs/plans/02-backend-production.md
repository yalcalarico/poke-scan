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
- El cron de precios era el que estaba bloqueado por la cola en memoria, y eso
  ya se resolvió (Fase 4). **Queda como decisión abierta**: tiene sentido
  automático, pero hay que decidir la periodicidad contra el ritmo global de 26
  requests/min, y hoy la demanda sola ya mantiene la cola alimentada.
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
