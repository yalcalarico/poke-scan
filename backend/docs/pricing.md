# Precios — el sistema completo

> De dónde salen los precios hoy (tcgdex, TCGPlayer con refresco horario), por
> qué el catálogo sigue espejándose desde pokemontcg.io aunque sus precios
> quedaron congelados, cómo funcionan las 2 capas de caché (Redis 1 h +
> Postgres 24 h) más la caché negativa de 6 h, qué es la cola en background de
> ~26 req/min, y por qué el total de una colección puede legítimamente mostrar
> `$0`.

## La fuente: por qué los precios NO salen de pokemontcg.io

El catálogo completo (20.670 cartas) se sigue espejando desde
`api.pokemontcg.io` v2 sin API key, y ese sync tiene los límites de siempre:

| Límite | Valor |
|---|---|
| Requests por día | **1.000** |
| Requests por minuto | **30** |

Pero el **feed de precios de pokemontcg.io está congelado**: su `rawJson`
trae `tcgplayer.updatedAt: "2023/03/27"` y muchos sets no traen siquiera el
objeto `prices`. Medido sobre el catálogo:

| Cartas | Total |
|---|---|
| Con precios en el `rawJson` (congelados) | 19.545 |
| Con `tcgplayer` pero sin `prices` | 848 |
| Con `tcgplayer: null` | 277 |

Los sets salidos después de 2023 —incluida toda la era **Mega Evolution**,
como `me55` "30th Celebration"— **nunca** van a tener precio de esa fuente.
Además su API se deprecó (el equipo migró a Scrydex y ya no se dan keys).

Por eso los **precios se piden a [tcgdex.dev](https://tcgdex.dev)**: free, sin
API key, sin límite publicado, TCGPlayer actualizado ~cada 1 h y Cardmarket
diario, embebido en la respuesta de cada carta. El catálogo sigue viniendo de
pokemontcg.io (sus datos de cartas están vivos y son la base de la búsqueda y
del escáner), pero los precios son de tcgdex.

### Las dos fuentes y el mapeo de IDs

Cada API numera los sets con su propio esquema, así que para pedir un precio
por (set, número) hay que traducir:

| Nuestro (pokemontcg.io) | tcgdex | Carta |
|---|---|---|
| `me55` | `30th` | `me55-18` → `30th/18` |
| `base1` | `base1` | `base1-4` → `base1/4` |
| `zsv10pt5` | `sv10.5b` | — |

`TcgdexSetMappingService` resuelve y **persiste** esa traducción en
`card_sets.tcgdexSetId` (ver [jobs.md](jobs.md)). El precio se pide con:

```
GET https://api.tcgdex.net/v2/en/sets/{tcgdexSetId}/{númeroDeCarta}
```

El número va **sin padding**: tcgdex acepta `"18"` para los sets que internamente
usan `"018"` (verificado con `me55/18` y `miscp/1`). El provider igual tiene un
fallback: si da 404 y el número es numérico, reintenta con `padStart(3, '0')`.

### Variantes: el `VARIANT_MAP` de tcgdex

| tcgdex (`pricing.tcgplayer`) | Nuestro enum | Precio usado |
|---|---|---|
| `lowPrice` / `midPrice` / `highPrice` / `marketPrice` | `low` / `mid` / `high` / `market` | — |
| `normal` | `normal` | — |
| `holofoil` | `holofoil` | — |
| `reverse-holofoil` | `reverseHolofoil` | — |
| `1st-edition` | `firstEdition` | — |
| `1st-edition-holofoil` | `firstEditionHolofoil` | — |
| `unlimited` | `unlimited` | — |
| `unlimited-holofoil` | `unlimitedHolofoil` | — |

El total siempre se calcula sobre **`market`**, no sobre `mid`.

## Las 2 capas (+ la negativa)

```
LLAMADA
  │
  ▼
┌─ Capa 1: Redis ───────────────────────────────────────┐
│  clave  prices:<cardId>                              │
│  valor  CardPriceView[]  (JSON)                       │
│  TTL    3600 s (CACHE_TTL_SECONDS)                    │
│         21600 s si el último refresh vino vacío       │
│  hit → se rehidrata (fetchedAt vuelve a Date) y listo  │
└──────────────┬────────────────────────────────────────┘
               │ miss
               ▼
┌─ Capa 2: Postgres ────────────────────────────────────┐
│  card_prices, ordenadas por fetchedAt DESC, take 20   │
│  fresco  = Date.now() - fetchedAt < 24 h              │
│  hit fresco → se cachea en Redis y se devuelve         │
│  viejo o vacío → refresco (ver abajo)                  │
└──────────────┬────────────────────────────────────────┘
               │ viejo o vacío
               ▼
        SyncPricesService.refresh(cardId)
        resuelve el set contra tcgdex (lazy, una vez)
        GET /sets/{set}/{localId}   ← request real
        INSERTa filas nuevas + escribe Redis
```

### Capa 1 — Redis, 1 hora (o 6 h si no hay precio)

```ts
// src/jobs/sync-prices.service.ts
const CACHE_TTL_SECONDS = 60 * 60;
const NEGATIVE_CACHE_TTL_SECONDS = 6 * 60 * 60;

private async cache(
  cardId: string,
  prices: CardPriceView[],
  ttlSeconds: number = CACHE_TTL_SECONDS,
): Promise<void> {
  await this.redis.setJson(this.cacheKey(cardId), prices, ttlSeconds);
}
```

La **caché negativa** existe porque con tcgdex hay una categoría nueva de cartas
sin precio: los lanzamientos recientes todavía no tienen listados en TCGPlayer.
Sin ella, cada visita a la página de una carta de `me55` sería un request a
tcgdex. Con ella se reintenta cada 6 h y, cuando el set aparece en el feed, el
precio se muestra solo.

Al leer de Redis hay que **rehidratar la fecha**, porque JSON no tiene `Date`:

```ts
if (cached) return cached.map((p) => ({ ...p, fetchedAt: new Date(p.fetchedAt) }));
```

### Capa 2 — Postgres, 24 horas

```ts
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const latest = await this.latestPrices(cardId);   // ORDER BY fetchedAt DESC, take 20
if (latest.length > 0 && Date.now() - latest[0]!.fetchedAt.getTime() < MAX_AGE_MS) {
  await this.cache(cardId, latest);
  return latest;
}
return this.refresh(cardId);
```

**Por qué 24 h en Postgres y 1 h en Redis**: la fila en Postgres es la
**verdad histórica**; sirve para mostrar un precio viejo sin pagar un request, y
para las agregaciones (`totalValueUsd`, stats) que **siempre** leen de Postgres y
nunca tocan Redis. Redis es solo un acelerador de la vista de detalle. Si Redis
está caído, la app sigue funcionando con precios de hasta 24 h de antigüedad.

**Por qué el refresco sí hace HTTP** (antes no hacía): el diseño anterior
parseaba el `rawJson` congelado de pokemontcg.io, o sea que "refrescar" no
refrescaba nada. Hoy:

```ts
async refresh(cardId: string): Promise<CardPriceView[]> {
  const card = await this.prisma.card.findUnique({
    where: { id: cardId },
    select: {
      id: true,
      number: true,
      set: { select: { id: true, name: true, tcgdexSetId: true } },
    },
  });
  // ...

  let tcgdexSetId = card.set.tcgdexSetId;
  if (tcgdexSetId === null) {
    tcgdexSetId = (await this.mapping.resolve(card.set.id))?.tcgdexSetId ?? null;
  }
  if (tcgdexSetId === null) return this.latestPrices(cardId);   // set sin equivalente

  let remote: RemoteCardPrice[];
  try {
    remote = await this.priceProvider.getCardPrices(card.id, tcgdexSetId, card.number);
  } catch (error) {
    return this.latestPrices(cardId);   // tcgdex caído: no perdemos lo último
  }

  if (remote.length === 0) {
    // Set recién lanzado: caché negativa y se reintenta en 6 h.
    const previous = await this.latestPrices(cardId);
    await this.cache(cardId, previous, NEGATIVE_CACHE_TTL_SECONDS);
    return previous;
  }
  // ... createMany + cache
}
```

Las tres degradaciones devuelven **lo último conocido** en vez de borrar nada:
set sin mapeo, error de red, y todavía sin cotización. Una caída de tcgdex no
deja la colección en `$0`.

### El `DISTINCT ON` que elige el precio más reciente

`card_prices` es append-only: varias filas por `(cardId, variant)`, una por
fecha. Para exponer "el precio actual" siempre se usa el mismo SQL (ver
[database.md](database.md)):

```sql
SELECT DISTINCT ON (p."cardId", p.variant)
  p."cardId", p.variant, p.low, p.mid, p.high, p.market,
  p.currency, p.source, p."fetchedAt"
FROM card_prices p
WHERE p."cardId" = ANY(${uniqueCardIds}::text[])
ORDER BY p."cardId", p.variant, p."fetchedAt" DESC
```

Aparece en cuatro lugares, con el mismo `ORDER BY`: `CollectionsService.fetchLatestPrices`,
`ShareService.fetchLatestPrices`, `FriendsService.fetchLatestPrices` e
`IdentifyService.pricesFor`.

En las agregaciones **no** se usa el `DISTINCT ON`: se usa el `LATERAL` de
`common/sql/latest-price.ts` (`latestMarketPriceJoin`), que es el mismo
resultado anclado en la fila del item:

```sql
LEFT JOIN LATERAL (
  SELECT p.market AS "market"
  FROM card_prices p
  WHERE p."cardId" = i."cardId" AND p.variant = i.variant
  ORDER BY p."fetchedAt" DESC
  LIMIT 1
) lp ON true
```

El `DISTINCT ON` global da el mismo número, pero su subconsulta no sabe qué
cartas se van a usar y termina leyendo **toda** `card_prices`. Como la tabla es
append-only y no tiene poda, eso hace que el costo de `/collections`, `/stats` y
`/set-progress` crezca con la historia global de precios en vez de con los items
del usuario: medido, 9.755 buffers contra 774 con 142.379 filas. Ver
[gotchas.md](gotchas.md) §26.

Y el valor total se calcula siempre sobre **`market`**, no sobre `mid`:

```sql
COALESCE(SUM(i.quantity * lp.market), 0)::float8 AS "totalValueUsd"
```

## La cola en background

`enqueueRefresh` existe por un problema concreto: **el precio se pide bajo
demanda, así que una carta recién agregada a una colección no lo tenía**. El
total de esa colección valía `$0` hasta que el usuario abría el detalle de cada
carta una por una. Encolar al agregar resuelve el `$0` de una, sin bloquear la
respuesta.

```ts
/**
 * Disciplina de la cola: tcgdex no publica límite (pide "consideración"), pero
 * es infra comunitaria compartida y el catálogo también usa pokemontcg.io
 * (~26 req/min entre ambos, debajo de los 30/min de esa API).
 */
const MIN_GAP_MS = 2300;

enqueueRefresh(cardId: string): void {
  if (!cardId || this.pending.has(cardId)) return;   // dedupe
  this.pending.add(cardId);
  this.queue.push(cardId);
  if (!this.draining) void this.drain();
}

private async drain(): Promise<void> {
  this.draining = true;
  try {
    while (this.queue.length > 0) {
      const cardId = this.queue.shift()!;
      try { await this.refresh(cardId); }
      catch (error) { /* log warn, la cola sigue */ }
      finally { this.pending.delete(cardId); }
      if (this.queue.length > 0) await this.sleep(MIN_GAP_MS);
    }
  } finally { this.draining = false; }
}
```

Cuatro cosas a respetar si la tocás:

1. **`MIN_GAP_MS = 2300`** ⇒ 60/2.3 ≈ **26 requests/minuto**. No es un límite de
   tcgdex (no publica ninguno) sino cortesía con una infra comunitaria que el
   proyecto no mantiene, y para no comerse el presupuesto de pokemontcg.io
   mientras siga usando esa API para el catálogo.
2. **`pending`** es el dedupe: la misma carta no se encola dos veces mientras
   espera. `queueSize` expone el tamaño para diagnóstico y tests.
3. **`draining` es el lock**: si la cola se drena sola, un `enqueueRefresh` que
   llega durante el drain **no** arranca un segundo loop. Sin ese flag se
   correrían dos loops en paralelo y el ritmo se rompería.
4. **Un fallo no frena la cola**: el `catch` loguea y sigue con la siguiente.
   Un error de una carta no puede bloquear las otras 200.

**Dónde se encola**:

| Lugar | Qué encola |
|---|---|
| `CollectionsService.addItem` | La carta recién agregada, siempre |
| `CollectionsService.enqueueMissingPrices` | Todas las de la colección que **no tienen** ninguna fila en `card_prices` (endpoint `refresh-prices`) |

```ts
// collections.service.ts, al final de addItem (fuera de la transacción)
this.syncPrices?.enqueueRefresh(item.cardId);
```

El `?.` es por el `@Optional()` de la inyección: en los tests unitarios el
service se construye sin el job de precios.

**No hay cola persistente**: es un array en memoria del proceso. Si el backend
se reinicia con la cola llena, esas cartas quedan sin precio hasta que alguien
las mire. Es aceptable justamente por el diseño bajo demanda.

## El histórico de precios: dos endpoints, una sola tabla

`card_prices` es append-only, así que **el histórico ya está guardado**: una fila
por variante por fecha, con `@@index([cardId, variant, fetchedAt])`. No hay tabla
de snapshots diarios, y no se va a agregar: backfillear lo que ya existe,
escribir un snapshot en cada refresco y conservarlo para siempre es el mismo dato
con un día de atraso y un job más. La serie se arma **en el momento**, con un
`DISTINCT ON` sobre el día.

| Endpoint | Qué contesta | Costo |
|---|---|---|
| `GET /cards/:id/prices` | "el precio de hoy contra la fila de hace 30 días" (el `change` de cada variante) | 1 query extra por carta, solo este endpoint |
| `GET /cards/:id/prices/history` | la serie diaria de la ventana y el delta agregado | 1 query, **sin** proveedor externo |

### El delta de la ficha: `change`

El de `GET /cards/:id/prices` mide **el precio de hoy contra la última fila
anterior a la ventana**, que sale de un `DISTINCT ON (variant) ... WHERE
"fetchedAt" < now() - 30 días`. El detalle completo de cuándo es `null` está en
[api.md](api.md); la regla que importa acá es que **la fila de referencia tiene
que ser otra fila**: si la carta solo tiene precios de esta semana, no hay
referencia y el delta es `null` en vez de un `0 %` que nadie sabe explicar.

### La serie: `GET /cards/:id/prices/history`

Un punto por día, con la última cotización de ese día. El `DISTINCT ON (day)`
colapsa las N filas del día a una y el `ORDER BY` de afuera lo da vuelta para que
la serie sea cronológica:

```sql
SELECT DISTINCT ON (day) day, s.market, s.low, s.mid, s.high, s."fetchedAt"
FROM (
  SELECT (p."fetchedAt" AT TIME ZONE 'UTC')::date AS day, p.market, …, p."fetchedAt"
  FROM card_prices p
  WHERE p."cardId" = $1 AND p."fetchedAt" >= $2
) s
ORDER BY day, s."fetchedAt" DESC
```

Cuatro cosas que no son negociables:

1. **El `ORDER BY` interno empieza por `day`.** Si no, Postgres agrupa por otra
   cosa y devuelve una serie silenciosamente distinta (gotcha 16).
2. **El `AND "fetchedAt" >= $2` es lo que acota la respuesta** a `windowDays`
   filas (una por día) y lo que deja al índice recortar la ventana en vez de
   recorrer el histórico entero de la carta. No es una optimización: sin él, el
   costo de este endpoint crece con la historia global de la carta.
3. **Sin `variant`, el punto del día es el de mayor `market`.** Es el mismo
   criterio "mejor precio disponible" que usa `sort=price` del catálogo, y es lo
   que evita que una carta que solo tiene `reverseHolofoil` devuelva una serie
   vacía.
4. **No llama a nadie externo.** Es la única ruta de precios que no toca tcgdex ni
   pokemontcg.io: lee Postgres y nada más, así que puede ser pública y estar en el
   camino caliente de la ficha (`AGENTS.md` §3.1).

### El agregado de la ventana

`change` del endpoint del histórico (`{ changeUsd, changePercent }`) compara **el
primer punto con `market` contra el último**. Es `null` — no `0` — cuando la serie
está vacía, cuando hay un solo punto con precio, o cuando el primero es `0`
(división por cero). Con la historia de `card_prices` de hoy (unos días) `null` es
el caso más común, y hay que dibujarlo como "no hay histórico suficiente": un
`0 %` afirma que el precio no se movió, que es un dato, y no lo es.

## El endpoint de refresco

`POST /api/collections/:id/refresh-prices` → `CollectionsService.enqueueMissingPrices`:

```ts
const items = await this.prisma.collectionItem.findMany({
  where: { collection: { id: collectionId, userId } },
  select: { cardId: true, card: { select: { prices: { select: { id: true }, take: 1 } } } },
  distinct: ['cardId'],
});

let queued = 0;
for (const item of items) {
  if (item.card.prices.length === 0) {   // ← sin N+1: el `take: 1` anidado
    this.syncPrices?.enqueueRefresh(item.cardId);
    queued += 1;
  }
}
return queued;
```

Devuelve `{ queued: n }`. Solo encola las cartas que **nunca tuvo precio: si
la carta tiene un precio viejo (>24 h) queda para el camino bajo demanda.

El otro refresco es de admin: `POST /api/jobs/refresh-prices` con
`{ cardIds: [...] }` (máx. 200) llama a `refreshMany`, que **sí** es bloqueante y
en serie.

## Precios en ARS

La moneda no la calcula el backend para los listados, la calcula el cliente.

| Pieza | Dónde | Comportamiento |
|---|---|---|
| `GET /currency/usd-ars` | público | Devuelve blue **y** oficial, cacheado 1 h en `currency:usd:both` |
| `GET /cards/:id/prices?currency=ARS` | público | Agrega `priceArs` usando **solo** el rate ya cacheado (`getCachedRate`, nunca llama a DolarApi) |
| Todo lo demás | — | **Nunca** convierte. El cliente multiplica por el rate que ya tiene |

La regla de por qué está escrita en el `cards.controller.ts` y en el
`currency.controller.ts`: si un listado paginado de 50 cartas llamara a DolarApi
por request, la latencia y el riesgo de la API externa entran en cada scroll.

`stale: true` marca que el rate tiene más de 48 h (`STALE_AFTER_MS`), para que
el cliente muestre un `≈` en vez de un número con precisión falsa.

`totalValueArs` y el `priceArs` de los DTOs de colección son **`null` siempre**:
esos endpoints ni siquiera leen el rate. `totalValueArs: null` es deliberado para que la
conversión sea un problema del cliente.

## Por qué el total de una colección puede mostrar `$0`

Es **esperado** y hay cuatro causas distintas. Ninguna es un bug del cálculo; el
cálculo es `SUM(quantity * último market)`.

### Causa 1 — la carta nunca tuvo precio (la común)

Una carta recién agregada no tiene fila en `card_prices`. El `LEFT JOIN` no
trae nada, `lp.market` es `NULL`, y `SUM` **ignora los NULL** en vez de fallar:
esa carta simplemente no suma. Si la colección tiene 3 cartas y solo 2 tienen
precio, el total es el de 2 y **parece** que la tercera vale $0.

Cómo se diagnostica: `GET /api/collections/:id/stats` devuelve
`cardsMissingPrice`, que cuenta exactamente las cartas distintas sin fila de
precio. Si es > 0, ese es el número de cartas que están fuera del total.

Cómo se resuelve:

1. `POST /api/collections/:id/refresh-prices` → encola solo las que faltan.
2. O `GET /api/cards/:id` / `GET /cards/:id/prices` de esa carta: el camino bajo
   demanda la refresca en el momento.
3. Y en ambos casos la cola tarda ~2.3 s **por carta**: con 40 cartas sin
   precio, el total recién está completo un par de minutos después.

### Causa 1b — el lanzamiento es demasiado nuevo (esto pasa con tcgdex)

Con tcgdex hay una categoría que pokemontcg.io no tenía: los sets salidos hace
días todavía **no tienen listados en TCGPlayer**, así que tcgdex devuelve
`pricing: null` para todo el set (por ejemplo `me55` "30th Celebration", que se
lanzó el 2026/09/16). El `refresh` no inserta nada y cachea el vacío por 6 h
(`NEGATIVE_CACHE_TTL_SECONDS`).

No es un bug ni se arregla forzando: el precio aparece solo cuando el feed
ingiere el set, y en ese momento la próxima lectura lo trae. El frontend lo
distingue con "Esta carta todavía no tiene precio de mercado…".

### Causa 1c — el set no tiene equivalente en tcgdex

Dos sets quedan sin `tcgdexSetId` a propósito: `cel25c` y `me55c` (las "Classic
Collection") usan la numeración original de cada carta clásica ("15", "107")
contra los "CC001".."CC025" de tcgdex, y hasta repiten números entre cartas
distintas. La validación del mapper las descarta. Sus cartas caen en la causa 1
con lo último que haya en `card_prices`.

### Causa 2 — la variante no coincide

El `LEFT JOIN` incluye `AND lp.variant = i.variant`. Un item guardado como
`variant: "holofoil"` **no** suma el precio que existe para `normal` de la misma
carta. Es correcto (el holo vale más que el normal) pero se ve como "no tengo
precio" si el usuario cambió la variante a mano y no volvió a pedir el precio.

Cómo se diagnostica: `GET /api/cards/:id/prices` y comparar el `variant` de cada
fila con el del item.

### Causa 3 — la fila existe pero `market` es `null`

> **Nota (bug menor)**: en este caso `totalValueUsd` **sí** queda corto, pero
> `cardsMissingPrice` **no** lo cuenta. El `NOT EXISTS` de la stats query
> (`collections.service.ts:566`) solo mira si hay fila, no si `market` es null.
> O sea: una carta con la fila `holofoil` completa pero `market: null` aporta $0
> y no aparece en `cardsMissingPrice`. Si vas a arreglar algo acá, empezá por
> cambiar ese `NOT EXISTS` por `NOT EXISTS (... AND cp.market IS NOT NULL)`.

### Cómo se evita en el cliente

- Mostrar `cardsMissingPrice` junto al total ("valor de 2 de 3 cartas").
- Después de `refresh-prices`, invalidar la vista y volver a pedir `stats`: la
  cola escribe en Postgres pero la vista cacheada en el cliente no se entera.
- No asumir que `totalValueUsd === 0` significa colección vacía: usá
  `uniqueCards` / `totalCards` para distinguir.

## Detalle fino: el refresco escribe filas nuevas, no actualiza

`refresh()` hace `createMany` con un `fetchedAt` nuevo. Por eso el
`card_prices` crece y por eso el `DISTINCT ON` es indispensable. No hay
limpieza: **el histórico de precios es el feature**, y ahora eso es literal — es lo
que alimenta `GET /cards/:id/prices/history` (la serie diaria) y el `change` de
`GET /cards/:id/prices`. Antes de que existieran esas dos rutas, "el histórico es
el feature" era una intención; ahora es la razón por la que las dos consultas
leen la tabla en vez de agregar una.

Para hacer space, un `DELETE FROM card_prices WHERE "fetchedAt" < now() - interval '90 days'`
es seguro **mientras no estés mostrando la serie**: el endpoint del histórico
devuelve una ventana de hasta 365 días, así que podar a 90 días no rompe nada (la
serie empieza a tener huecos y el `change` de la ficha pierde su fila de
referencia), pero borra historia que un gráfico de evolución necesitaría.

El `totalValueUsd` **no** depende de la poda: usa el `LATERAL ... LIMIT 1`, que
corta en la primera fila del índice y nunca recorre el histórico.

## Ver también

- [providers.md](providers.md) — el `VARIANT_MAP` de tcgdex y la traducción de IDs de set
- [database.md](database.md) — el patrón `DISTINCT ON`
- [jobs.md](jobs.md) — el mapeo de sets y la carga del catálogo
- [api.md](api.md) — los endpoints que devuelven precios
