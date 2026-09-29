# Base de datos — modelo, migraciones y patrones de query

> Los 10 modelos de Prisma, qué hace cada migración, la convención de nombres
> (tablas snake_case, columnas camelCase), los índices que **no** están en el
> schema y los patrones de query que se repiten en todo el código.
> Requisito previo: [`../../AGENTS.md`](../../AGENTS.md) §3.2 y §3.5.

## La convención que rompe todo

Cada modelo tiene `@@map("nombre_snake_case")`. **`@@map` renombra la tabla, no
las columnas.** Las columnas siguen el nombre del campo del schema, o sea
**camelCase**, y en SQL hay que entrecomillarlas.

```sql
-- ✅ correcto
SELECT "cardId", "fetchedAt", "isActive" FROM card_prices;
SELECT "setId" FROM cards WHERE "setId" = 'base1';

-- ❌ no existe: Prisma no renombró las columnas
SELECT cardid, fetchedat FROM card_prices;
SELECT set_id FROM cards;

-- ❌ las tablas SÍ son snake_case
SELECT * FROM CardPrices;      -- relation inexistente
```

Y en Prisma no hay que poner comillas: `where: { cardId }` funciona porque el
cliente las escapa solo. El problema aparece únicamente cuando se escribe SQL
crudo con `$queryRaw`, `$executeRaw` o en `psql`.

| | |
|---|---|
| Tablas | `users`, `refresh_tokens`, `card_sets`, `cards`, `card_prices`, `collections`, `collection_items`, `share_links`, `scan_jobs`, `friendships` |
| Columnas | `camelCase` siempre: `userId`, `setId`, `tokenHash`, `isActive`, `fetchedAt`, `rawJson` |
| PK de catálogo | el id de pokemontcg.io en texto: `cards.id = 'base1-4'`, `card_sets.id = 'base1'` |
| PK del resto | `uuid()` |

## Los 10 modelos

### User (`users`)

Cuenta, sesión y preferencias.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String @id @default(uuid())` | |
| `email` | `String @unique` | se guarda normalizado a minúsculas en `register`/`login` |
| `username` | `String @unique` | `/^[a-zA-Z0-9_]{3,20}$/` |
| `passwordHash` | `String` | argon2id. **Nunca** en un `select` de salida |
| `displayName` | `String` | |
| `avatarUrl` | `String?` | |
| `preferredCurrency` | `String? @default("USD")` | `'USD'` \| `'ARS'` |
| `preferredRateType` | `String? @default("blue")` | `'blue'` \| `'oficial'` |
| `createdAt` / `updatedAt` | `DateTime` | |

Relaciones: `refreshTokens`, `collections`, `shareLinks`, `scanJobs`, y las dos
líneas de amistad `friendshipRequests` / `friendshipReceives` (que son la misma
tabla `friendships` vista desde los dos lados).

Índices: `users_email_key`, `users_username_key` (ambos unique).

### RefreshToken (`refresh_tokens`)

Una fila por sesión emitida.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `uuid()` | |
| `userId` | `String` | FK a `users`, `onDelete: Cascade` |
| `tokenHash` | `String @unique` | **SHA-256 del token**, nunca el token en claro |
| `deviceInfo` | `String?` | el cliente lo manda en refresh/register |
| `expiresAt` | `DateTime` | `JWT_REFRESH_TTL_DAYS` (30) días |
| `revokedAt` | `DateTime?` | `null` = vigente. Base de la rotación y del detection de reuso |
| `createdAt` | `DateTime` | |

Índices: `tokenHash` (unique), `userId`, `expiresAt`. Las filas revocadas
**no se borran**: son la evidencia que permite detectar reutilización.

### CardSet (`card_sets`)

Espejo de los sets de pokemontcg.io. 176 filas hoy.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String @id` | `"swsh4"`, `"base1"` |
| `name`, `series` | `String` / `String?` | |
| `printedTotal`, `total` | `Int?` | |
| `releaseDate` | `DateTime?` | pokemontcg.io lo manda como `"1999/01/01"`, se parsea en `parseReleaseDate` |
| `logoUrl`, `symbolUrl` | `String?` | vienen de `raw.images.{logo,symbol}` |
| `rawJson` | `Json?` | el objeto original |
| `syncedAt` | `DateTime` | |

Relación: `cards Card[]`. Índices: `name`, más el trigram
`card_sets_name_trgm_idx` (fuera del schema).

### Card (`cards`)

El catálogo. **20.670 filas** hoy.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String @id` | `"base1-4"` |
| `name` | `String` | es el campo que se busca; el que más importa para los índices |
| `supertype` | `String` | `Pokémon` \| `Trainer` \| `Energy` |
| `subtypes`, `types` | `String[]` | arrays nativos de Postgres, no JSON |
| `hp` | `String?` | **texto**, `"120"` o `"120+"` |
| `number` | `String` | `"25"`, `"4TG"`. Se castea a numérico en SQL para ordenar |
| `rarity`, `artist`, `regulationMark` | `String?` | |
| `setId` | `String` | FK a `card_sets`, `onDelete: Cascade` |
| `imageSmall`, `imageLarge` | `String` | |
| `language` | `String? @default("en")` | |
| `rawJson` | `Json` | **obligatorio**: preserva ataques, habilidades, legalidades y el bloque `tcgplayer.prices` (histórico, ya no es la fuente de precios: eso es tcgdex) |
| `syncedAt` | `DateTime` | |

Relaciones: `set CardSet`, `prices CardPrice[]`, `items CollectionItem[]`.
Índices: `name`, `setId`, `number`, más el trigram `cards_name_trgm_idx`.

### CardPrice (`card_prices`)

Histórico de precios: **una fila por variante por fecha**, nunca se actualiza.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `uuid()` | |
| `cardId` | `String` | FK a `cards`, `onDelete: Cascade` |
| `variant` | `String` | 8 valores; ver `VARIANT_MAP` en [providers.md](providers.md) |
| `low`, `mid`, `high`, `market` | `Decimal? @db.Decimal(12,2)` | |
| `source` | `String @default("tcgplayer")` | |
| `currency` | `String @default("USD")` | |
| `fetchedAt` | `DateTime @default(now())` | **la columna que ordena** el `DISTINCT ON` |

Índice: `@@index([cardId, variant, fetchedAt])`, exactamente el orden del
`DISTINCT ON`, para que "el precio más reciente de esta variante" sea un index
scan y no un sort de 20k filas.

No hay unique sobre `(cardId, variant)`: el histórico es el objetivo.

**El histórico no necesita tabla propia.** `GET /cards/:id/prices/history` arma la
serie con un `DISTINCT ON` sobre el día (ver [patrón 1b](#patrón-1b--un-punto-por-día-del-histórico)),
así que no hay migración, ni snapshot diario, ni backfill: lo que hay es la
misma tabla de siempre leída con otro `DISTINCT ON`.

### Collection (`collections`)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `uuid()` | |
| `userId` | `String` | FK a `users`, `onDelete: Cascade` |
| `name` | `String` | |
| `isDefault` | `Boolean @default(false)` | a lo sumo una `true` por usuario, garantizado en el service dentro de una transacción |
| `createdAt` / `updatedAt` | `DateTime` | |

Relaciones: `items CollectionItem[]`, `shareLinks ShareLink[]`. Índice: `userId`.

### CollectionItem (`collection_items`)

Una fila por combinación `(carta, variante, condición)`; la cantidad vive acá.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `uuid()` | |
| `collectionId` | `String` | FK, `onDelete: Cascade` |
| `cardId` | `String` | FK, `onDelete: Cascade` |
| `variant` | `String @default("normal")` | 8 valores |
| `condition` | `String @default("NM")` | `NM` \| `LP` \| `MP` \| `HP` \| `DM` |
| `quantity` | `Int @default(1)` | `> 1` = duplicada |
| `isForTrade` | `Boolean @default(false)` | |
| `notes` | `String?` | |
| `addedAt` / `updatedAt` | `DateTime` | |

**`@@unique([collectionId, cardId, variant, condition])`**: es lo que permite
"agregar N copias más" con un `quantity: { increment: n }` en vez de duplicar
filas, y obliga a manejar el `P2002` en las carreras.

Índices: el unique compuesto, `collectionId`, `cardId`.

### ShareLink (`share_links`)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `uuid()` | |
| `userId` | `String` | FK, `onDelete: Cascade` |
| `collectionId` | `String?` | **`null` = todas las colecciones del usuario** |
| `slug` | `String @unique` | 10 chars de `a-z0-9`, es lo que va en `/s/:slug` |
| `isActive` | `Boolean @default(true)` | revocar = `false`, no borrar |
| `viewCount` | `Int @default(0)` | se incrementa con `updateMany` sin await |
| `createdAt` | `DateTime` | |
| `expiresAt` | `DateTime?` | `null` = no expira |

Índices: `slug` (unique), `userId`.

### ScanJob (`scan_jobs`)

Tracking de los syncs. No hay cola: es una fila de estado que se consulta por
`GET /api/jobs/:id`.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `uuid()` | |
| `userId` | `String` | FK; el job cuelga del primer usuario o del `system` |
| `status` | `String @default("pending")` | `pending` \| `running` \| `completed` \| `failed` \| `skipped` |
| `jobType` | `String @default("sync-catalog")` | `sync-catalog` \| `refresh-prices` |
| `processed`, `total` | `Int` / `Int?` | progreso |
| `lastError` | `String?` | truncado a 2000 chars en `runSync` |
| `startedAt`, `completedAt`, `createdAt` | `DateTime` | |

Índice: `status`.

### Friendship (`friendships`)

**Una fila por par `(requesterId, addresseeId)`, en un solo sentido**, con un
estado. Como el service busca siempre en ambos sentidos, el par tiene un único
estado vigente.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `uuid()` | |
| `requesterId`, `addresseeId` | `String` | FKs a `users`, `onDelete: Cascade` |
| `status` | `String @default("pending")` | `pending` \| `accepted` \| `rejected` \| `blocked` |
| `respondedAt` | `DateTime?` | cuándo se aceptó/rechazó; es el `friendsSince` del listado |
| `createdAt` / `updatedAt` | `DateTime` | |

`@@unique([requesterId, addresseeId])` + `@@index([addresseeId, status])` +
`@@index([requesterId, status])`.

> `blocked` **no** es una tabla aparte: es el estado de la fila del par. El
> bloqueador se guarda como `requesterId` justamente para no violar el unique
> creando el par invertido.

## Migraciones

| Migración | Qué hace |
|---|---|
| `20260925180500_init_users_and_catalog` | Las 9 tablas de la primera fase, sus índices y FKs. Es la que genera Prisma: si corrés `migrate dev` y agregás algo, esta se reescribe |
| `20260925180600_add_pg_trgm` | **A mano.** `CREATE EXTENSION pg_trgm` + 2 índices GIN trigram sobre `cards.name` y `card_sets.name` |
| `20260926010423_add_friendships` | `friendships` + 3 índices + 2 FKs, y **a mano** los 2 índices trigram de `users.username` y `users.displayName` |

Las dos últimas mezclan SQL generado con SQL escrito a mano en el mismo archivo,
justo para que los índices viajen con la migración.

> ⚠️ **`prisma migrate dev` dropea los 4 índices trigram.** Prisma no modela
> `gin_trgm_ops`, así que ve los `CREATE INDEX ... USING GIN (name gin_trgm_ops)`
> como objetos desconocidos y los borra. Sin ellos, la búsqueda de cartas y de
> usuarios cae a un **seq scan sobre 20.670 filas** y `identify` pasa de ~70 ms
> a ~1 s. Si pasa, restaurá a mano:
>
> ```sql
> CREATE INDEX IF NOT EXISTS cards_name_trgm_idx ON cards USING GIN (name gin_trgm_ops);
> CREATE INDEX IF NOT EXISTS card_sets_name_trgm_idx ON card_sets USING GIN (name gin_trgm_ops);
> CREATE INDEX IF NOT EXISTS users_username_trgm_idx ON users USING GIN (username gin_trgm_ops);
> CREATE INDEX IF NOT EXISTS users_display_name_trgm_idx ON users USING GIN ("displayName" gin_trgm_ops);
> ```
>
> Detalle en [gotchas.md](gotchas.md#2-prisma-migrate-dev-dropea-los-índices-trigram).

## Índices y por qué existen

| Índice | Definido en | Para qué |
|---|---|---|
| `cards_name_trgm_idx` | migración a mano | GIN + `gin_trgm_ops`: acelera `ILIKE '%q%'` y `similarity()`. **Crítico**: sin esto la búsqueda es un seq scan |
| `card_sets_name_trgm_idx` | migración a mano | autocomplete/búsqueda de sets por nombre |
| `users_username_trgm_idx` | migración a mano | `GET /users/search` sobre `username contains` |
| `users_display_name_trgm_idx` | migración a mano | ídem sobre `displayName` |
| `card_prices_cardId_variant_fetchedAt_idx` | schema | el "último precio por variante" (con `DISTINCT ON` o con el `LATERAL` de los agregados) y el "un precio por día" del histórico |
| `collection_items_collectionId_cardId_variant_condition_key` | schema (unique) | evita filas duplicadas; habilita el `findUnique` por la clave compuesta |
| `share_links_slug_key` | schema (unique) | el `GET /s/:slug` es un index lookup directo |
| `users_email_key`, `users_username_key`, `refresh_tokens_tokenHash_key` | schema (unique) | lookups de login, refresh y solicitudes de amistad |
| `friendships_requesterId_addresseeId_key` | schema (unique) | un estado por par |
| `cards_setId_idx`, `cards_name_idx`, `cards_number_idx` | schema | filtros de `search` |
| `collections_userId_idx`, `share_links_userId_idx`, `refresh_tokens_userId_idx` | schema | toda query de un usuario es por su id |
| `friendships_addresseeId_status_idx`, `friendships_requesterId_status_idx` | schema | listing de amigos y de pendientes |
| `scan_jobs_status_idx` | schema | (hoy nadie lo consulta: el tracking es por `id`) |

## Patrón 1 — el último precio por variante (`DISTINCT ON`)

`card_prices` es append-only. Para un item hace falta **una** fila: la más
reciente de `(cardId, variant)`. Se resuelve siempre con el mismo SQL, repetido
en `collections`, `share` y `cards/identify`:

```sql
SELECT DISTINCT ON (p."cardId", p.variant)
  p."cardId", p.variant, p.low, p.mid, p.high, p.market,
  p.currency, p.source, p."fetchedAt"
FROM card_prices p
WHERE p."cardId" = ANY(${uniqueCardIds}::text[])
ORDER BY p."cardId", p.variant, p."fetchedAt" DESC
```

Las tres partes son obligatorias:

1. `DISTINCT ON (cardId, variant)` — una fila por grupo.
2. El `ORDER BY` tiene que **empezar** por las columnas del `DISTINCT ON`, y
   recién después el criterio de desempate (`fetchedAt DESC`).
3. Los identificadores van entrecomillados: son camelCase.

Como subconsulta en las agregaciones **no** se usa: se usa el `LATERAL` de
`common/sql/latest-price.ts`, que da el mismo número pero anclado en la fila del
item, así que la subconsulta no puede leer cartas que no se van a usar:

```sql
LEFT JOIN LATERAL (
  SELECT p.market AS "market"
  FROM card_prices p
  WHERE p."cardId" = i."cardId" AND p.variant = i.variant
  ORDER BY p."fetchedAt" DESC
  LIMIT 1
) lp ON true
```

Es `latestMarketPriceJoin()`, compartido por `CollectionsService` (las tres
agregaciones) y `FriendsService.summariesFor`. El motivo por el que el
`DISTINCT ON` no sirve acá es que **no lleva `WHERE`**: materializa una fila por
(carta, variante) de toda la tabla y la une después con los items, así que el
costo escala con la historia global de precios. Ver
[gotchas.md](gotchas.md) §26.

> `DISTINCT ON` **no** acepta `WHERE`, por eso cuando hay que filtrar por
> `cardId IN (...)` se hace sobre la consulta completa y el `ANY(...)` va en el
> `WHERE` del subselect, no adentro del `DISTINCT ON`.

El service mapea el resultado a un `Map` con clave `` `${cardId}::${variant}` ``
(`priceKey` en `collections.service.ts:161`) para pegarle el precio al item
correcto. Las tres copias de `fetchLatestPrices` son idénticas a propósito: se
movieron de módulo sin unificar.

## Patrón 1b — un punto por día del histórico

El mismo `append-only` con el `DISTINCT ON`, pero agrupando por **día** en vez de
por variante (`GET /cards/:id/prices/history`):

```sql
SELECT DISTINCT ON (day)
  day, s.market, s.low, s.mid, s.high, s."fetchedAt"
FROM (
  SELECT (p."fetchedAt" AT TIME ZONE 'UTC')::date AS day,
         p.market, p.low, p.mid, p.high, p."fetchedAt"
  FROM card_prices p
  WHERE p."cardId" = $1 AND p."fetchedAt" >= $2
) s
ORDER BY day, s."fetchedAt" DESC
```

- El día se calcula **en UTC** (`AT TIME ZONE 'UTC'`) y no con `date(p."fetchedAt")`:
  el segundo usa la zona del servidor, así que el mismo día puede partirse en dos
  según dónde corra la API.
- El `WHERE` va en el subselect interno porque el `DISTINCT ON` necesita el
  `ORDER BY` empezando por `day` (gotcha 16).
- El `AND "fetchedAt" >= $2` es lo que acota la respuesta a `windowDays` filas y
  lo que deja al índice `card_prices_cardId_variant_fetchedAt_idx` recortar la
  ventana: sin él, el costo crece con el histórico entero de la carta.
- **No hace falta una tabla de snapshots diarios ni un índice nuevo**: la tabla ya
  guarda la historia y ya está indexada como para esto.

## Patrón 1c — ordenar items por precio o por número

`GET /collections/:id/items?sort=price|number` no lo resuelve el `orderBy` de
Prisma: `number` necesita un `CAST` que el ORM no arma, y `price` vive en
`card_prices`, a la que el `orderBy` no llega. La forma es **una query de ids ya
ordenados** y después un `findMany` por esos ids:

```sql
-- sort=price
SELECT i.id
FROM collection_items i
JOIN cards c ON c.id = i."cardId"
LEFT JOIN LATERAL (                       -- el mismo latestMarketPriceJoin
  SELECT p.market AS "market"
  FROM card_prices p
  WHERE p."cardId" = i."cardId" AND p.variant = i.variant
  ORDER BY p."fetchedAt" DESC
  LIMIT 1
) lp ON true
WHERE i."collectionId" = $1
ORDER BY (i.quantity * lp.market) DESC NULLS LAST, c.name ASC, i.id ASC
LIMIT $2 OFFSET $3
```

Tres cosas que hacen que no sea un N+1 ni una segunda fuente de verdad:

1. **El precio sale del mismo `latestMarketPriceJoin`** que usa el
   `totalValueUsd` de `/stats`, con la misma expresión `i.quantity * lp.market`:
   la lista ordenada y el total mostrado no pueden discrepar.
2. **El `LATERAL` va anclado en el item**, no con un `DISTINCT ON` global: son N
   lookups que cortan en la primera fila del índice, atados a la cantidad de items
   y no a la historia global de precios (gotcha 26).
3. **El filtro de esta query es el espejo de `itemWhere`**. Si aparece un filtro
   nuevo en `ListItemsDto`, tiene que estar en los dos, o la página y el `total`
   dejan de ser el mismo conjunto.

`sort=number` usa el literal compartido `common/sql/numeric-number.ts`
(`NUMERIC_CARD_NUMBER`), que es el mismo `CAST(NULLIF(regexp_replace(...)))` que
ordena el catálogo: `"10"` antes que `"4"` como texto sería al revés de como está
impresa la carta. Espera que `cards` esté aliaseada `c`.

## Patrón 1d — en qué colección del usuario está una carta

`GET /cards/:id/location`: **una** fila con el `userId` en el `WHERE`, no un check
aparte:

```sql
SELECT col.id, col.name, i.id, i.quantity, i.variant, i.condition
FROM collection_items i
JOIN collections col ON col.id = i."collectionId"
WHERE i."cardId" = $1 AND col."userId" = $2
ORDER BY col."isDefault" DESC, i.quantity DESC, i."addedAt" ASC, i.id ASC
LIMIT 1
```

El ownership en el `WHERE` es lo que hace que una colección ajena devuelva la
misma respuesta que "no la tenés" (`null`) y no un 403 que confirmaría que el id
existe. El `ORDER BY` ordena por un campo de la relación (`collections.isDefault`),
que el `orderBy` de Prisma no puede expresar, y el `id` del final lo vuelve un
orden total.

## Patrón 2 — ownership en el `where`

Ninguna query de recurso ajeno se resuelve con un check aparte. El `userId` va
dentro del `where` y el resultado es 404:

```ts
// CollectionsService
await this.prisma.collection.findFirst({
  where: { id: collectionId, userId },
  select: { id: true },
});
// si no está → NotFoundException(`Colección no encontrada: ${collectionId}`)

// para items, el ownership se alcanza a través de la relación
await this.prisma.collectionItem.findFirst({
  where: { id: itemId, collection: { userId } },
  select: { id: true, collectionId: true, cardId: true, variant: true, condition: true },
});
```

Un 403 confirmaría que el recurso existe. Con el 404 no se puede enumerar IDs.

En `friends` hay una excepción deliberada: la relación **sí** se distingue
porque el cliente necesita diferenciar "esperando respuesta" (403) de "no existe
nada" (404) — y aun así, un bloqueo se reporta como 404 para que el bloqueado no
pueda confirmar que el otro usuario existe.

## Otros detalles del schema que conviene saber

- **`Decimal(12,2)`** para los precios. `$queryRaw` los devuelve como
  `Prisma.Decimal`, no como `number`: por eso todos los services tienen un
  helper `toNumber(value: unknown)` que castea y valida con `Number.isFinite`.
  Las sumas SQL sí salen como `::float8` (`SUM(i.quantity * lp.market)`).
- **`Json` y no `JsonB`**: en `schema.prisma` el tipo correcto es `Json`.
  `JsonB` no es un tipo válido y el schema no valida. En el SQL de la migración
  sí aparece `JSONB`, que es el tipo de Postgres.
- **`String[]`** (`subtypes`, `types`) se filtra con el operador de contención:
  `c.types @> ARRAY[$1]::text[]`.
- **Filtros sobre arrays y texto** para `rarity` y `supertype`: son
  igualdad case-insensitive, no substring. `?rarity=Rare` matchea `Rare` pero
  no `Rare Holo`.
- **Trigram y `\p{L}`**: `pg_trgm` no entiende clases Unicode de regex salvo con
  flag `u`. Por eso `identify.service.ts` usa las clases POSIX
  `[[:alpha:]]` / `[[:alnum:]'-]` en vez de `\p{L}` (ver
  [gotchas.md](gotchas.md#14-pg_trgm-no-soporta-pl-en-regex)).
- **Umbral de trigram por transacción**: `search` e `identify` corren
  `SELECT set_config('pg_trgm.similarity_threshold', '0.2', true)` **dentro de
  una transacción** porque el `true` lo hace local a la transacción. Si lo
  sacás de ahí, el threshold no aplica.

## Ver también

- [api.md](api.md) — los DTOs y las formas de respuesta
- [pricing.md](pricing.md) — las dos capas de caché y la regla de 24 h
- [gotchas.md](gotchas.md) — las trampas de Prisma que ya costaron tiempo
