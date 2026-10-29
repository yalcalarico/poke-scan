# Jobs — sincronización del catálogo y precios

## Precios: operación vigente desde 20/10/2026

La única fuente activa es TCGCSV. El 24/10 se retiraron el proveedor y mapper
TCGdex, la cola/worker por carta y su backfill/planificador. Sus datos y
migraciones se conservan como historia; no hay un circuito alternativo de
precios. El catálogo conserva su sincronización.

`tcgcsv/tcgcsv.service.ts` administra descubrimiento, cola por grupo, build y
publicación; ciclo diario 21:00 UTC, reanudación cada 15 min y consumidor serial.
Se mantienen identidad segura, reserva de 24 h por archivo y pausas del proveedor.
Desde el 21/10 el registro incorpora asociaciones validadas además de curados y
colecciones, sin reactivar bajas. Promos y grupos suplementarios requieren
identidades explícitas; Trainer Kits revisados comparten job y descarga.
`prices:coverage` muestra cobertura y tráfico; `prices:reconcile -- --apply`
concilia asociaciones almacenadas sin red. Ver la sección de cobertura en
[precios](pricing.md#cobertura-y-caché-de-productos--21102026).
`SyncPricesService` lee PostgreSQL y solicita grupos; el refresco de colección
usa selección local por ownership y variante, sin consultas externas ni N+1.
La API inicia y recupera automáticamente la tanda vencida; `prices:status -- --watch`
permite observarla. Ver [precios](pricing.md) y [providers](providers.md).

Desde el 26/10, por pedido del usuario, todos los grupos del alcance diario
entran en una tanda común a las **21:00 UTC (18:00 Argentina)**. La planificación
persiste el alcance antes de habilitar el consumo automático; las lecturas no
adelantan grupos ni cambian la prioridad diaria por una interactiva. Las señales
manuales esperan las 18 para abrir un lote nuevo. El usuario corrigió después el
cierre: **no hay corte a medianoche UTC**. `tcgcsv_daily_batches` fija alcance,
publicación y estado; `tcgcsv_batch_groups` conserva el resultado de cada grupo.
El lote abierto continúa tras medianoche/reinicio hasta resultados terminales,
sin convertir pendientes en una aparente ejecución terminada. Si faltó abrirlo,
el arranque y la reanudación recuperan la última tanda vencida de las 21 UTC:
antes de esa hora corresponde a la fecha UTC anterior. No se adelanta la tanda
del nuevo día calendario ni se reconstruyen todos los días de una suspensión.
Una tanda cerrada no se reabre; una activa conserva alcance y publicación. Fallar después de
consumir contenido conserva las 24 h y deja fallo explícito para la siguiente
tanda; antes de contenido se admiten reintentos acotados. Un cambio de feed o la
llegada de las siguientes 18 cierra lo no completado como fallo explícito.
Un lease global de consumidor conserva el recorrido serial entre procesos.
Una PC suspendida no ejecuta jobs y puede interrumpir conexiones; debe permanecer
despierta y con la tapa abierta para operar localmente. No se inventan observaciones.
`prices:diagnose` distingue la espera de una validación fallida con datos locales.
Ver [política](pricing.md#ciclo-diario-y-operación) y
[cierre y validación](../../docs/evaluations/tcgcsv-batch-completion-2026-10-26.md).


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
| `jobs-recovery.service.ts` | En el arranque, reconcilia el trabajo que quedó a medias |
| `sync-sets.service.ts` | Espeja los sets |
| `sync-cards.service.ts` | Espeja las cartas. **Reanudable** |
| `sync-state.service.ts` | El cursor del sync, en `sync_state` (Postgres) |
| `sync-prices.service.ts` | Lecturas locales y solicitudes a la cola por grupo (ver [pricing.md](pricing.md)) |
| `tcgcsv/tcgcsv.service.ts` | Planificación, leases, cola por grupo y publicación atómica |
| `tcgcsv/tcgcsv.client.ts` | Descarga serial, caché de archivos y pausas 429 |
| `card-prices-retention.service.ts` | Consolida y poda `card_prices`: cron mensual o script con dry run |
| `sync.constants.ts` | Los valores compartidos del sync |
| `retry.ts` | `withPageRetry`, el retry de paginación |

```ts
// sync.constants.ts
export const REQUEST_PAUSE_MS = 2100;   // pausa entre páginas (~28 req/min)
export const DEFAULT_PAGE_SIZE = 250;   // el máximo de pokemontcg.io
export const SYNC_LOCK_KEY = 'sync:cards:lock';
export const SYNC_LOCK_TTL_SECONDS = 1800;
```

El cursor del catálogo vive en `sync_state`. Los leases, pausas y reservas de
TCGCSV viven en PostgreSQL; ninguna lectura pública descarga archivos.

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
const state = await this.syncState.readCards();
const alreadyComplete = !options.force && state.isComplete;
if (alreadyComplete) {
  this.logger.log('Sync cards omitido: el catálogo ya está completo. Usá { force: true } para rehacerlo.');
  // 1 request barato: solo para conocer el total remoto
  const probe = await withPageRetry(..., () => this.provider.getCardsPage(1, 1));
  return { processed: 0, total: probe?.total ?? 0, skipped: true };
}
```

`isComplete` se pone **solo** si se llegó a la última página (`lastPage >=
totalPages`). Un sync interrumpido no la escribe, así que el próximo corre de
nuevo.

Con `force: true` se saltea la bandera **y** el punto de reanudación: es el
"rehacer todo desde cero".

### 2. El punto de reanudación

```ts
const resumeFrom = options.force ? 0 : state.lastPage;
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
  await this.syncState.saveCards(page, totalPages);   // ← checkpoint
}
```

**La invariante**: el cursor se escribe **después** de que la página está
commiteada en Postgres. Si el proceso muere entre medio, el cursor no avanzó y esa
página se reprocesa en el próximo intento; `upsert` hace que reprocesar sea
idempotente. Al revés —anotar el cursor antes de guardar— perdería la página en
silencio y el sync se declararía completo con un hueco en el medio.

Si una página falla después de 8 intentos, el sync se corta pero **no borra el
cursor**: la próxima corrida arranca desde ahí. Ese es todo el mecanismo de
reanudación.

### El cursor vive en Postgres, no en Redis

`SyncStateService` escribe en la tabla `sync_state`, con id `cards:<providerId>`.
Eran dos claves Redis sin TTL (`sync:cards:lastPage`, `sync:cards:complete`) y
eso tenía dos consecuencias:

1. **Un `flushall` reiniciaba el sync desde la página 1.** No desde cero en
   términos de datos —el `upsert` es idempotente— pero sí en requests: volver a
   traer las 83 páginas de un catálogo ya completo son 83 requests de una cuota
   de 1.000 por día, gastados para comprobar algo que la base ya sabía.
2. **La granularidad era global.** La clave no decía de qué job ni de qué
   provider era, así que el día que entre un segundo proveedor de catálogo ambos
   syncs comparten el mismo número de página.

Un detalle de `saveCards`: `totalPages` se escribe explícito y no se pisa con
`undefined`, porque Prisma solo manda los campos presentes. Si no, un
`saveCards(page)` dejaría el `totalPages` de una corrida con `pageSize` distinto
mezclado con el `lastPage` de esta, y el "completo" caería en la página
equivocada.

**Al deployar hay que correr `pnpm run sync-state:migrate`**, que pasa el cursor
de Redis a `sync_state`. No puede ser una migración de Prisma porque una
migración no puede leer Redis. Es idempotente: si la fila ya existe, no la toca.


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
  const [cardAliases, setAliases] = await Promise.all([
    this.prisma.cardExternalId.findMany({
      where: { provider: this.provider.id, externalId: { in: cards.map((c) => c.id) } },
      select: { externalId: true, cardId: true },
    }),
    this.prisma.cardSetExternalId.findMany({
      where: { provider: this.provider.id, externalId: { in: [...new Set(cards.map((c) => c.setId))] } },
      select: { externalId: true, setId: true },
    }),
  ]);
  const cardIdByExternalId = new Map(cardAliases.map((a) => [a.externalId, a.cardId]));
  const setIdByExternalId = new Map(setAliases.map((a) => [a.externalId, a.setId]));
  let saved = 0;
  for (const card of cards) {
    try {
      if (!card.setId) { this.logger.warn(`Carta ${card.id} (${card.name}) sin setId: se omite`); continue; }
      const cardId = cardIdByExternalId.get(card.id) ?? card.id;
      const setId = setIdByExternalId.get(card.setId);
      if (!setId) continue;
      const upsert = this.prisma.card.upsert({
        where: { id: cardId },
        create: { id: cardId, setId, ...data },
        update: { setId, ...data },
      });
      if (cardIdByExternalId.has(card.id)) await upsert;
      else {
        await this.prisma.$transaction([
          upsert,
          this.prisma.cardExternalId.create({
            data: { provider: this.provider.id, externalId: card.id, cardId },
          }),
        ]);
      }
      saved += 1;
    } catch (error) { this.logger.error(`No se pudo guardar la carta ${card.id}: ...`); }
  }
  return saved;
}
```

Cada página precarga sus aliases; los `upsert` escriben sobre la PK canónica y
los aliases nuevos se guardan junto al registro. Para IDs ya conocidos, el
`cardId` externo nunca reemplaza la PK que usan las colecciones.

Las cartas sin `setId` se omiten (puede pasar si el set no se sincronizó) y los
errores de una carta no cortan la página.

## `SyncPricesService`

`getPricesForCard` lee el último precio confirmado por carta y variante del
proveedor activo, TCGplayer y USD. Un precio cero sigue siendo conocido.
Si falta una referencia o está vencida, solicita trabajo a
`TcgcsvService.enqueueCards` sin esperar una descarga. No usa caché por carta,
no reestampa observaciones y no recurre a TCGdex ni a precios del catálogo.

`refreshMany` conserva el contrato admin: encola grupos en lote y devuelve
`{ refreshed: 0, failed: 0, queued, results: {} }`. El encolado no acredita un
precio nuevo. `enqueueRefresh` se usa al incorporar una carta a una colección.

## `JobsRecoveryService` — qué pasa con el trabajo a medias

Al arrancar marca fallidos los syncs de catálogo `running` anteriores al TTL de
su lock, sin tocar corridas recientes. La recuperación de grupos de precios
pertenece a `TcgcsvService`, que conserva sus leases, cooldown y backoff.
`price_refresh_jobs` queda como historia; ningún servicio la drena o reconcilia.

## Scheduler y ciclos automáticos

`ScheduleModule.forRoot()` activa los crons. La planificación y el consumo de
precios se limitan a TCGCSV.

| Job | Programación | Qué hace |
|---|---|---|
| `syncCatalogWeekly` | Lunes 04:07, zona del proceso | Sync mediante `CatalogSyncService`; cursor PostgreSQL y lock Redis renovable. |
| `TcgcsvService.runDaily` | 21:00 UTC | Planifica grupos de sets habilitados. |
| `TcgcsvService.resumeDaily` | Cada 15 min UTC | Reanuda objetivos y grupos pendientes sin inventar historia. |
| `TcgcsvService.discover` | Cada 10 min UTC | Descubre identidades seguras, respetando build, caché y backoff. |
| `ScheduledJobsService.pollPriceCycles` | Cada 5 s UTC | Atiende señales manuales con lease y generaciones coalescidas. |
| `TcgcsvService.poll` | Cada 5 s UTC | Consume grupos en serie. |
| `prunePricesMonthly` | Día 1, 03:23, zona del proceso | Aplica la retención de precios. |

Los crons semanales/mensuales no declaran `timeZone`: verificá la zona del
proceso. La ingesta conserva una descarga por archivo cada 24 h, pausas 429 y
publicación atómica. Los límites 30/min y 1.000/día corresponden al catálogo.

### Los kill switches

```bash
ENABLE_CATALOG_SYNC_CRON=false
ENABLE_TCGCSV_INGESTION=false
ENABLE_RETENTION_CRON=false
```

TCGCSV requiere `true` explícito. Para catálogo y retención, una variable vacía
cae al default habilitado. `PRICE_QUEUE_ENABLED` y
`ENABLE_PRICE_BACKFILL_CRON` ya no tienen consumidores.

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

`{ cardIds: string[] }`, no vacío, máx. 200. Solicita grupos locales sin
descargar desde el handler. Devuelve `{ requested, queued, refreshed: 0, failed: 0 }`.

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

## Ciclo de vida completo de una carga (cursor durable en PostgreSQL)

```
pnpm run db:sync
  │
  ├─ SyncCardsService.syncAll()
  │    ├─ SyncSetsService.syncAll(250)          1 request   → 176 sets
  │    ├─ ¿sync_state.isComplete?     ── sí ──→ 1 request, skipped: true
  │    ├─ resumeFrom = sync_state.lastPage ?? 0
  │    ├─ getCardsPage(1, 250)                   1 request   → total = 20670
  │    └─ for page in 2..83:
  │         wait(2100)
  │         getCardsPage(page, 250)             1 request
  │         upsertBatch(250 cartas)              local
  │         Postgres saveCards(N, totalPages)      checkpoint
  │    └─ última página OK → Postgres sync_state.isComplete = true
  │
  └─ 20.670 cartas en `cards` (176 sets), cada una con su `rawJson`
```

## Cronjobs diarios de precios y operación

TCGCSV planifica a las 21:00 UTC (18:00 en Argentina) y reanuda cada quince
minutos y recupera la última apertura vencida al arrancar. El backend debe estar
activo y la ingesta habilitada; las interrupciones no generan puntos históricos
ausentes. La tanda recuperada conserva su fecha, valida que su feed siga disponible
y respeta las reservas; no atribuye publicaciones nuevas a días anteriores.

TCGCSV descubre identidades cada diez minutos y planifica sólo grupos asociados
a sets habilitados. Su consumidor conserva el control de cuota y las reservas
de 24 h desde el final de una descarga. El descubrimiento cachea grupos por build.
Las descargas
respetan el presupuesto de cada archivo durante 24 h completas desde que termina
su lectura. No hay topes globales de requests o grupos; los contadores por ventana
de24h son informativos. Un build ya publicado se saltea y no duplica observaciones.
Los grupos nuevos se registran sólo por identidad segura; el reporte durable
conserva IDs de sets sin asociación y motivos, sin datos personales. Ver
[pricing.md](pricing.md) para identidad, cobertura y fechas.

Desde la raíz o desde backend, con la API activa:

```bash
pnpm run prices:status
pnpm run prices:status -- --watch --seconds=120
pnpm run prices:status -- --json
```

`prices:status -- --watch` muestra el avance cada cinco segundos por hasta diez
minutos. `--seconds=N` ajusta esa duración entre 1 y 86400 segundos. Ctrl+C cierra
la vista; la instancia activa sigue trabajando. Sin `--watch` consulta una vez.
`prices:status` sólo consulta datos locales, sin bootstrap ni requests externos.
La CLI no inicia otra API, no ejecuta proveedores y no elimina ni adelanta leases
o presupuestos de descarga.

`price_sync_controls` conserva señales coalescidas, generaciones atendidas,
leases y heartbeat del planificador. El tick de cinco segundos atiende pedidos
manuales con los mismos servicios de cron. Un pedido manual puede adelantar
la lectura del manifest TCGCSV, pero reutiliza el catálogo si el build no cambió
y conserva el backoff de errores, los leases y las 24 h del archivo de precios.
La ingesta requiere `ENABLE_TCGCSV_INGESTION=true`. Apagarla conserva el trabajo
ya pendiente y las reservas; la CLI no inicia otro consumidor. Se retiró el alias
público para pedir ciclos: la recuperación automática no lo necesita.
El modo interno `sync` de `scripts/prices-sync.mjs` y `requestCycles` se conservan
por compatibilidad con las herramientas de registro y sus pruebas; no cambian
parsing, cuotas ni leases y no se ofrecen como comando operativo.
La cola muestra `en espera` para pendientes cuya disponibilidad o última descarga
impiden ejecutarlos ahora; los fallos reales conservan su estado y backoff.
La próxima disponibilidad mostrada nunca queda en el pasado y contempla la espera
del último archivo y el descubrimiento necesario para reencolar fallos.
El estado distingue actividad reciente del cron y worker **configurado** como
habilitado/apagado; no pretende probar que el loop del worker esté drenando.

La capa de ciclos diarios agrega `20261018010000_price_sync_registry` sobre las
tablas de descubrimiento TCGCSV. Las migraciones son aditivas y no modifican
inventario, `pg_trgm` ni reservas de jobs existentes. La CLI no aplica
migraciones ni cambia flags o configuración del entorno.

## Ver también

- [providers.md](providers.md) — proveedor del catálogo e identidad de precios
- [pricing.md](pricing.md) — `SyncPricesService` en detalle
- [api.md](api.md) — los 3 endpoints de admin
- [gotchas.md](gotchas.md) — por qué el sync es reanudable y no "reintenta todo"

### Registro, estados y CLI local

El estado diario incluye cada proveedor/set de hoy, cantidad cotizada, sin
cotización, sin mapping, no asociado, pendiente, en proceso y fallido; muestra
build, espera, próximo intento y pausa `blockedUntil`. Separa jobs legacy
diferidos de solicitudes interactivas. La última actividad se calcula desde
comprobaciones o precios persistidos; un heartbeat del planificador no acredita
trabajo del proveedor. Errores se presentan con el detalle omitido para evitar
exponer datos ajenos en JSON.

Administrá el registro sin endpoints ni consumidores nuevos:

```bash
pnpm run prices:sets -- list
pnpm run prices:sets -- seed
pnpm run prices:sets -- add --set=swsh7 --priority=100
pnpm run prices:sets -- enable --set=swsh7
pnpm run prices:sets -- rank --set=swsh7 --priority=20
pnpm run prices:sets -- disable --set=swsh7
```

`seed` agrega sólo IDs curados existentes y conserva decisiones previas.
`add`/`enable` escriben una señal durable únicamente para fuentes habilitadas
por sus flags. El planificador Nest sigue siendo el único que inicia ciclos;
ningún comando consulta proveedores. `rank` cambia el orden de atención y
`disable` conserva el registro y los precios históricos.
