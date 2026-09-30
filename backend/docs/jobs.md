# Jobs — sincronización del catálogo y precios

> Los servicios de sync, cómo el sync de cartas es **reanudable**, el **mapeo
> de IDs de set** que habilita los precios en vivo, cuánto cuesta en requests,
> el script de catálogo completo y los endpoints de admin. Requisito previo: el
> rate limit de pokemontcg.io (30/min, 1.000/día) y [pricing.md](pricing.md).

## Dónde vive

`src/jobs/` está **fuera** de `src/modules/`: es infraestructura, no dominio.

| Archivo | Qué es |
|---|---|
| `jobs.module.ts` | Módulo con los services + el controller de admin |
| `jobs.controller.ts` | 3 endpoints de admin, auth por `x-admin-key` |
| `sync-sets.service.ts` | Espeja los sets |
| `sync-cards.service.ts` | Espeja las cartas. **Reanudable** |
| `sync-prices.service.ts` | Precios bajo demanda + cola (ver [pricing.md](pricing.md)) |
| `tcgdex-set-mapping.service.ts` | Traduce nuestros set IDs a los de tcgdex |
| `sync.constants.ts` | Los valores compartidos del sync |
| `retry.ts` | `withPageRetry`, el retry de paginación |

```ts
// sync.constants.ts
export const REQUEST_PAUSE_MS = 2100;   // pausa entre páginas (~28 req/min)
export const DEFAULT_PAGE_SIZE = 250;   // el máximo de pokemontcg.io
export const KEY_CARDS_LAST_PAGE = 'sync:cards:lastPage';
export const KEY_CARDS_COMPLETE   = 'sync:cards:complete';
```

## `SyncSetsService`

El más simple. Trae los 176 sets y los upserta.

```ts
async syncAll(pageSize: number = DEFAULT_PAGE_SIZE): Promise<SyncSetsResult> {
  const first = await withPageRetry(this.logger, 'Sync sets: página 1', () =>
    this.provider.getSets(1, pageSize));
  if (!first) { /* aborta */ return { processed: 0, total: 0 }; }
  ...
  for (let page = 2; page <= totalPages; page++) {
    await wait(REQUEST_PAUSE_MS);
    const result = await withPageRetry(..., () => this.provider.getSets(page, pageSize));
    if (!result) break;              // ← una página fallida corta el sync
    await this.upsertBatch(result.data);
  }
}
```

- **1 request**: con 176 sets y `pageSize: 250` entra todo en la primera página.
- `releaseDate` llega como `"1999/01/01"`, no ISO. El parseo lo hace
  `parseReleaseDate` (`sync-sets.service.ts:15`), que además tiene un fallback a
  `new Date(value)`.
- `upsertBatch` mete cada set en un `try/catch` individual: una carta/set
  corrupto no tira la página entera.
- `rawJson` guarda el objeto remoto completo (`set.raw`).

## `SyncCardsService` — el reanudable

Trae las 20.670 cartas. Es el que tarda, el que gasta requests y el que se corta
a la mitad, así que tiene tres mecanismos para sobrevivir.

### 1. La bandera de "ya está completo"

```ts
const alreadyComplete = !options.force && (await this.redis.get(KEY_CARDS_COMPLETE)) !== null;
if (alreadyComplete) {
  this.logger.log('Sync cards omitido: el catálogo ya está completo. Usá { force: true } para rehacerlo.');
  // 1 request barato: solo para conocer el total remoto
  const probe = await withPageRetry(..., () => this.provider.getCardsPage(1, 1));
  return { processed: 0, total: probe?.total ?? 0, skipped: true };
}
```

`KEY_CARDS_COMPLETE` se escribe **solo** si se llegó a la última página
(`lastPage >= totalPages`). Un sync interrumpido no la escribe, así que el
próximo corre de nuevo.

Con `force: true` se saltea la bandera **y** el punto de reanudación: es el
"rehacer todo desde cero".

### 2. El punto de reanudación

```ts
const resumeFrom = options.force
  ? 0
  : ((await this.redis.getNumber(KEY_CARDS_LAST_PAGE)) ?? 0);
if (resumeFrom > 0) this.logger.log(`Sync cards reanudando desde la página ${resumeFrom + 1}`);

// La página inicial siempre se pide: es de donde sale `total`.
// Con reanudación se pide con pageSize: 1 para no reprocesar 250 cartas.
const first = await withPageRetry(..., () =>
  resumeFrom === 0 ? this.provider.getCardsPage(1, pageSize)
                    : this.provider.getCardsPage(1, 1));
```

Y después de cada página, el cursor avanza:

```ts
for (let page = resumeFrom + 1; page <= lastPage; page++) {
  if (page === 1) continue;
  await wait(REQUEST_PAUSE_MS);
  const result = await withPageRetry(..., () => this.provider.getCardsPage(page, pageSize));
  if (!result) {
    interrupted = true;
    this.logger.error(`Sync cards detenido en la página ${page}: se puede reanudar con POST /api/jobs/sync-catalog`);
    break;                                   // ← la página queda sin avanzar el cursor
  }
  const saved = await this.upsertBatch(result.data);
  processed += saved;
  await this.redis.set(KEY_CARDS_LAST_PAGE, String(page));   // ← checkpoint
}
```

**La invariante**: `sync:cards:lastPage` se escribe **después** de que la página
está commiteada en Postgres. Si el proceso muere entre medio, el cursor no
avanzó y esa página se reprocesa en el próximo intento. `upsert` hace que
reprocesar sea idempotente.

Si una página falla después de 8 intentos, el sync se corta pero **no borra el
cursor**: la próxima corrida arranca desde ahí. Ese es todo el mecanismo de
reanudación.

### 3. El retry de página

`retry.ts`:

```ts
const BASE_BACKOFF_MS = 3000;
const MAX_BACKOFF_MS = 30000;

function backoffFor(attempt: number): number {
  const exponential = BASE_BACKOFF_MS * 2 ** (attempt - 1);   // 3s, 6s, 12s, 24s
  const capped = Math.min(exponential, MAX_BACKOFF_MS);       // tope 30s
  return capped + Math.floor(Math.random() * 2000);           // jitter 0-2s
}

export async function withPageRetry<T>(
  logger: Logger, label: string, fn: () => Promise<T>, intentos = 8,
): Promise<T | null> {
  for (let attempt = 1; attempt <= intentos; attempt++) {
    try { return await fn(); }
    catch (error) { logger.warn(...); if (attempt < intentos) await wait(backoffFor(attempt)); }
  }
  logger.error(`${label} abortada después de ${intentos} intentos: ...`);
  return null;      // ← null, no throw: el caller decide si aborta o sigue
}
```

Ocho intentos, tope de 30 s + 2 s de jitter. Devuelve `null` en vez de tirar,
para que cada service decida: `SyncSetsService` corta el loop, `SyncCardsService`
corta el sync pero conserva el cursor.

> **Los dos retries se suman.** `PokemonTcgIoProvider.fetchWithRetry` ya hace
> 4 intentos por request; `withPageRetry` envuelve eso con 8. Es intencional
> (el primero es por request, el segundo por página), pero effective puede
> llevar bastante rato en el peor caso: 4 × (8 s + backoff) × 8 páginas.

### `upsertBatch`

```ts
private async upsertBatch(cards: RemoteCard[]): Promise<number> {
  let saved = 0;
  for (const card of cards) {
    try {
      if (!card.setId) { this.logger.warn(`Carta ${card.id} (${card.name}) sin setId: se omite`); continue; }
      await this.prisma.card.upsert({
        where: { id: card.id },
        create: { id: card.id, setId: card.setId, ...data },
        update: { setId: card.setId, ...data },
      });
      saved += 1;
    } catch (error) { this.logger.error(`No se pudo guardar la carta ${card.id}: ...`); }
  }
  return saved;
}
```

Un `upsert` por carta, **no** un `createMany`: cada carta tiene su `rawJson` y
`setId` distintos, así que un lote homogeneo no se puede armar sin serializar.
Son ~2.100 inserts por página de 250, contra la base local: rápido comparado con
el 2.1 s de pausa entre páginas.

Las cartas sin `setId` se omiten (puede pasar si el set no se sincronizó) y los
errores de una carta no cortan la página.

## `TcgdexSetMappingService` — el puente entre las dos fuentes

El catálogo se espeja desde pokemontcg.io y los precios salen de tcgdex. Cada
fuente numera los sets distinto (`me55` vs `30th`, `sv4` vs `sv04`), así que
pedir un precio exige traducir. Este service lo hace **una vez por set** y lo
persiste en `card_sets.tcgdexSetId`.

```ts
const SETS_CACHE_KEY = 'tcgdex:sets';        // el listado de sets de tcgdex, 24 h
const MISS_KEY_PREFIX = 'tcgdex:map:miss:';  // un set descartado, 24 h
const VALIDATION_SAMPLE = 25;                // cartas con las que se valida
const MIN_VALIDATION_RATIO = 0.5;            // mitad de aciertos: mínimo para creer
const MAP_ALL_PAUSE_MS = 250;                // courtesy en el backfill
```

El matcheo va en cascada y **valida antes de persistir**:

1. `SET_ID_OVERRIDES` — a mano, para lo que no matchea de ninguna forma
   (hoy: `fut20` → `fut2020`).
2. **Nombre normalizado** (minúsculas, sin acentos ni puntuación): cubre 168
   de los 176 sets.
3. **Igualdad de ID**: tcgdex desciende de la misma numeración, así que
   `base1` (nuestro "Base") es `base1` (su "Base Set"). Cubre los otros 6.
4. Si no hay candidato → miss marker de 24 h y `null`. No se reintenta en cada
   refresh.

Antes de guardar, `validate()` pide el detalle del set candidato (`GET
/sets/{id}`, que trae todos los `localId`) y chequea que **al menos la mitad** de
nuestras cartas existan ahí, comparando sin ceros a la izquierda
(`numberKey('018') === numberKey('18')`). Esto es lo que impide que un falso
matcheo de nombre contamine el mapeo.

### Los 2 sets que quedan sin mapear (a propósito)

`cel25c` y `me55c`, las "Classic Collection": pokemontcg.io les guarda la
**numeración original** de cada carta clásica (`"15"`, `"107"`, con números
repetidos entre cartas distintas) mientras tcgdex las numera `CC001`..`CC025`.
La validación los rechaza y sus cartas se quedan con lo último que haya en
`card_prices`. Un override no las arreglaría: el problema es la numeración, no
el nombre del set.

### Correr el mapeo

```bash
pnpm --dir backend run db:map-tcgdex            # idempotente: ya mapeados se saltan
pnpm --dir backend run db:map-tcgdex -- --retry-misses   # reintenta los descartados
```

Imprime el reporte y sale con código 1 si quedó algún set sin mapeo, para que
CI lo note. En el flujo normal **no hace falta correrlo**: el mapper es lazy y
se resuelve solo la primera vez que se pide el precio de una carta de un set
nuevo (`sv4` → `sv04` pasó por acá sin intervención). Un error de red durante
el matcheo o la validación **no** marca miss: deja el set para la próxima.

## `SyncPricesService`

No es un sync de catálogo sino el **refresco bajo demanda** de precios. Está
documentado entero en [pricing.md](pricing.md). Lo único que vive en este doc:

- `MAX_AGE_MS = 24h` (frescura en Postgres), `CACHE_TTL_SECONDS = 1h` (Redis),
  `NEGATIVE_CACHE_TTL_SECONDS = 6h` (cuando la fuente todavía no cotiza).
- `MIN_GAP_MS = 2300` se aplica en `withProviderSlot`, la única puerta al
  proveedor de precios, y la comparten la cola y el lote del admin (~26 req/min
  por cortesía hacia TCGdex; no consume la cuota de pokemontcg.io). La lectura
  pública es stale-while-revalidate y no espera ese slot: ver
  [pricing.md](pricing.md).
- `refreshMany(cardIds)` es **bloqueante y en serie** (lo usa el endpoint admin).
  Con N cartas tarda N × 2,3 s a propósito, para respetar el ritmo del proveedor
  configurado.
- `refresh(cardId)` **sí hace HTTP**: resuelve el set (lazy si hace falta) y
  pide el precio a tcgdex por (set, localId), pasando por el gap compartido.
  Desde un handler público de lectura, usá `getPricesForCard`: devuelve el dato
  disponible y encola los vencidos, sin bloquear la respuesta.

### La cola es en memoria, y eso es una limitación

`enqueueRefresh` procesa en un `setTimeout` sobre un array del proceso. Dos
consecuencias, y conviene conocerlas antes de tocar nada acá:

1. **Un reinicio del backend pierde lo pendiente.** No es un error ni una
   inconsistencia: el precio de esa carta simplemente queda para la próxima
   lectura, que lo encola de nuevo. Pero si el reinicio cae en el medio de un
   lote grande, las primeras cartas quedan sin refrescar hasta que alguien las
   mira.
2. **No sobrevive a un despliegue con más de una instancia.** El catálogo
   espejado es compartido, pero la cola no: cada proceso tendría la suya.

El diseño de la cola persistente (tabla `price_refresh_jobs` con
`deduplicationKey`, `attempts`, `availableAt` y recuperación de `processing`
abandonados al arrancar) está en
[`docs/plans/02-backend-production.md`](../../docs/plans/02-backend-production.md).
No está hecho a propósito: toca el path que maneja el rate limit externo, que es
la restricción más dura del proyecto, y merece su propio commit con su propia
verificación de que el `MIN_GAP_MS` se sigue respetando.

## No hay scheduler

`@nestjs/schedule` está en `package.json` y **no hay ningún `@Cron` en el
proyecto**. El sync del catálogo es manual (`pnpm run sync` o el endpoint de
admin) y el de precios es bajo demanda.

El motivo de no automatizar el sync de catálogo todavía es de producto: la fuente
es deprecada y las keys mueren el **1 de marzo de 2027**, así que un cron que la
mantenga al día puede quedar viejo antes de necesitarse. El de precios sí tendría
sentido, pero convive mal con la cola en memoria: dos planificadores disparando
sobre una cola que no persiste es peor que uno solo.

## Endpoints de admin

En [jobs.controller.ts](../src/jobs/jobs.controller.ts). **No piden JWT**: se autentican con
el header `x-admin-key` contra `ADMIN_KEY`. Sin `ADMIN_KEY` configurado, los tres
responden `403 ADMIN_KEY no está configurado: endpoint deshabilitado`.

### `POST /api/jobs/sync-catalog` → 202

```ts
// El lock va ANTES de crear el ScanJob: si el segundo proceso esperara al
// registro para ver que ya hay uno corriendo, la ventana entre el create y el
// acquire alcanza para que entren los dos.
const lockToken = randomUUID();
if (!(await this.redis.acquireLock(SYNC_LOCK_KEY, lockToken, SYNC_LOCK_TTL_SECONDS))) {
  throw new ConflictException('Ya hay un sync de catálogo en curso.');
}
const job = await this.prisma.scanJob.create({ /* … */ });
void this.runSync(job.id, dto, lockToken);      // ← fire and forget
return { started: true, jobId: job.id };
```

El request devuelve **de inmediato** y el sync corre en background. El progreso
se consulta con `GET /jobs/:id`. El body es `{ "force": boolean }` opcional.

**Un sync a la vez.** El cursor (`sync:cards:lastPage`) es un único número
compartido, así que dos syncs simultáneos se pisan la página reanudable —el
primero que retoma, reanuda desde donde está el otro— y multiplican los requests
contra la fuente externa, que es el recurso más escaso del proyecto
(`AGENTS.md` §3.1). El lock es un `SET NX EX` en Redis con **token único**, y la
liberación es un `EVAL` de compare-and-delete: un `DEL` a secas no distinguiría
"mi lock" de "el lock de otro" y podría borrar el de un sync que ya había
tomado el relevo.

El TTL (30 min) es la **red de seguridad**, no el mecanismo: `runSync` lo renueva
a mitad de vida mientras el trabajo sigue vivo, así que el lock solo expira solo
si el proceso muere. Si la liberación falla porque el TTL ya venció, se loguea
un warning —no es un error, pero significa que otro sync pudo haber trabajado
sobre el mismo cursor.

Un `409` significa que hay otro sync corriendo, no que este endpoint esté roto.

El `ScanJob` se cuelga del **primer usuario por `createdAt`**, o de un usuario
`system@pokemon-cards-scanner.app` con `passwordHash: 'not-usable'` si la base
está vacía. Es un detalle raro pero es lo que hace el código
(`jobs.controller.ts:110`): `ScanJob.userId` es obligatorio, así que hacía falta
algún user.

`runSync` actualiza la fila al terminar: `completed` / `skipped` (con
`processed` y `total`) o `failed` (con `lastError` truncado a 2000 chars).

```bash
curl -X POST http://localhost:3001/api/jobs/sync-catalog \
  -H "x-admin-key: $ADMIN_KEY" -H 'content-type: application/json' \
  -d '{"force":true}'
```

### `GET /api/jobs/:id` → 200

La fila `ScanJob` cruda, o `null`. Sirve para ver el progreso en vivo.

```bash
curl http://localhost:3001/api/jobs/$JOB_ID -H "x-admin-key: $ADMIN_KEY"
```

### `POST /api/jobs/refresh-prices` → 200

`{ cardIds: string[] }`, no vacío, máx. 200. Refresca en serie, bloqueante.
Devuelve `{ requested, refreshed, failed }`.

```bash
curl -X POST http://localhost:3001/api/jobs/refresh-prices \
  -H "x-admin-key: $ADMIN_KEY" -H 'content-type: application/json' \
  -d '{"cardIds":["base1-4"]}'
```

## `scripts/sync-full.ts` — el catálogo completo

Para la primera carga (o para reconstruir) conviene el script y no el endpoint:
no necesita el server levantado y **no depende de `ADMIN_KEY`**.

```bash
pnpm run db:sync     # = tsc -p tsconfig.seed.json && node --env-file-if-exists=.env dist-seed/scripts/sync-full.js
```

El script construye los services a mano, sin el contenedor de Nest:

```ts
const prisma = new PrismaService();
await prisma.$connect();
const redis = new RedisService(new ConfigService({}));
await redis.onModuleInit();
const provider = new PokemonTcgIoProvider();
const syncSets  = new SyncSetsService(prisma, provider);
const syncCards = new SyncCardsService(prisma, syncSets, redis, provider);
const result = await syncCards.syncAll({ pageSize: 250 });
```

Detalle importante: `await redis.onModuleInit()` **no** espera a que Redis
conecte. `RedisService.onModuleInit` arranca la conexión en background y
devuelve. `sync-full` funciona igual (el cursor se pierde si Redis no está, pero
el sync termina), mientras que los tests de `CurrencyService` sí hacen polling
de `isAvailable()`.

`tsconfig.seed.json` compila `src` + `scripts` a `dist-seed/` y **excluye los
`*.spec.ts`**. Por eso el output de los scripts no arrastra Vitest.

### Costo real y cuánto tarda

| Métrica | Valor |
|---|---|
| Requests de sets | 1 |
| Requests de cartas | `ceil(20670 / 250)` = **83** |
| Total | **~84** requests (≈85 si hay que reintentar) |
| Pausa entre páginas | 2.1 s × 83 = **~3 minutos** |
| Tiempo por request | ~8 s (la API externa es lenta) |
| **Tiempo total** | **~15 minutos** de reloj, dominado por la latencia |
| Requests por minuto | ~28/min en el peor caso (latencia 0), ~6/min con la latencia real de ~8 s |
| Requests por día | 1 sola pasada ≈ 84 ≪ 1.000 |

El ritmo real queda **muy por debajo** de los 30/min: la pausa de 2.1 s
solo existe para cubrir el caso de respuestas rápidas. `pageSize: 250` ya es el
máximo de pokemontcg.io, así que no hay margen para subirlo.

El script loguea el antes y el después:

```
[2026-09-25T…] Estado inicial: 0 cartas. Redis: ok
[2026-09-25T…] Iniciando sync COMPLETO del catálogo (esto puede tardar varios minutos)...
[2026-09-25T…] Sync cards: página 1/83 — 250 cartas (250 guardadas)
...
[2026-09-25T…] Sync cards completado: 20670 cartas
[2026-09-25T…] Sync finalizado. Cartas en BD: 0 -> 20670
```

### El otro script: `scripts/seed.ts`

`pnpm run db:seed` es la versión corta: importa **2 páginas** (500 cartas) con
`{ force: true, maxPages: 2 }` y trae los precios de 3 cartas de muestra, para
tener un entorno de desarrollo usable sin 15 minutos de espera. Con cartas
cargadas ya, se saltea la importación salvo que le pases `--import`.

`scripts/api-smoke.ts` no toca la base: solo instancia el provider e imprime
qué devuelve la API real. Sirve para ver si pokemontcg.io está caído sin
arrancar nada.

## Ciclo de vida completo de una carga

```
pnpm run db:sync
  │
  ├─ SyncCardsService.syncAll()
  │    ├─ SyncSetsService.syncAll(250)          1 request   → 176 sets
  │    ├─ ¿redis sync:cards:complete?  ── sí ──→ 1 request, skipped: true
  │    ├─ resumeFrom = redis sync:cards:lastPage ?? 0
  │    ├─ getCardsPage(1, 250)                   1 request   → total = 20670
  │    └─ for page in 2..83:
  │         wait(2100)
  │         getCardsPage(page, 250)             1 request
  │         upsertBatch(250 cartas)              local
  │         redis SET sync:cards:lastPage = N   checkpoint
  │    └─ última página OK → redis SET sync:cards:complete = <ISO>
  │
  └─ 20.670 cartas en `cards` (176 sets), cada una con su `rawJson`
```

## Ver también

- [providers.md](providers.md) — el provider que usa el sync y su `VARIANT_MAP`
- [pricing.md](pricing.md) — `SyncPricesService` en detalle
- [api.md](api.md) — los 3 endpoints de admin
- [gotchas.md](gotchas.md) — por qué el sync es reanudable y no "reintenta todo"
