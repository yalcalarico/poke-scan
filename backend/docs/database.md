# Base de datos — modelo, migraciones y patrones de query

> Los modelos de Prisma, qué hace cada migración, la convención de nombres
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
| Ejemplos de tablas | `users`, `refresh_tokens`, `card_sets`, `cards`, `card_prices`, `collections`, `collection_items`, `collection_item_add_operations`, `share_links`, `scan_jobs`, `friendships` |
| Columnas | `camelCase` siempre: `userId`, `setId`, `tokenHash`, `isActive`, `fetchedAt`, `rawJson` |
| PK de catálogo | el id de pokemontcg.io en texto: `cards.id = 'base1-4'`, `card_sets.id = 'base1'` |
| PK del resto | `uuid()` |

## Modelos y tablas

Inventario contrastado con [schema.prisma](../prisma/schema.prisma) el 20/10/2026.
El schema y las migraciones son la autoridad; las secciones siguientes explican
los modelos de dominio y no sustituyen el inventario completo.

| Modelo | Tabla |
|---|---|
| `User` | `users` |
| `PasswordRecoveryToken` | `password_recovery_tokens` |
| `RecoveryRateLimitHit` | `recovery_rate_limit_hits` |
| `RefreshToken` | `refresh_tokens` |
| `CardSet` | `card_sets` |
| `Card` | `cards` |
| `CardPrice` | `card_prices` |
| `CardExternalId` | `card_external_ids` |
| `CardSetExternalId` | `card_set_external_ids` |
| `Collection` | `collections` |
| `PortfolioSnapshot` | `portfolio_snapshots` |
| `CollectionItem` | `collection_items` |
| `CollectionItemAddOperation` | `collection_item_add_operations` |
| `ShareLink` | `share_links` |
| `ScanJob` | `scan_jobs` |
| `PriceRefreshJob` | `price_refresh_jobs` |
| `ProviderRateLimit` | `provider_rate_limits` |
| `SyncState` | `sync_state` |
| `Friendship` | `friendships` |
| `TcgcsvGroupJob` | `tcgcsv_group_jobs` |
| `TcgcsvDailyBatch` | `tcgcsv_daily_batches` |
| `TcgcsvBatchGroup` | `tcgcsv_batch_groups` |
| `PriceSyncSet` | `price_sync_sets` |
| `PriceSyncSetDay` | `price_sync_set_days` |
| `PriceSyncCardDay` | `price_sync_card_days` |
| `TcgcsvDiscoveryState` | `tcgcsv_discovery_state` |
| `PriceSyncControl` | `price_sync_controls` |
| `PriceIngestionRun` | `price_ingestion_runs` |
| `CollectionComparisonSnapshot` | `collection_comparison_snapshots` |

### User (`users`)

Cuenta, sesión y preferencias.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String @id @default(uuid())` | |
| `email` | `String @unique` | se guarda normalizado a minúsculas en `register`/`login` |
| `username` | `String @unique` | `/^[a-zA-Z0-9_]{3,20}$/` |
| `passwordHash` | `String` | argon2id. **Nunca** en un `select` de salida |
| `authVersion` | `Int @default(0)` | cambia al resetear clave; los JWT deben coincidir con esta versión |
| `displayName` | `String` | |
| `avatarUrl` | `String?` | |
| `preferredCurrency` | `String? @default("USD")` | `'USD'` \| `'ARS'` |
| `preferredRateType` | `String? @default("blue")` | `'blue'` \| `'oficial'` |
| `createdAt` / `updatedAt` | `DateTime` | |

Relaciones: `refreshTokens`, `passwordRecoveryTokens`, `collections`, `shareLinks`, `scanJobs`, y las dos
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
| `issuedAuthVersion` | `Int @default(0)` | versión de usuario al emitir la sesión; refresh de una versión vieja no revoca sesiones nuevas |
| `createdAt` | `DateTime` | |

Índices: `tokenHash` (unique), `userId`, `expiresAt`. Las filas revocadas
**no se borran**: son la evidencia que permite detectar reutilización.

### PasswordRecoveryToken y RecoveryRateLimitHit

`password_recovery_tokens` persiste el SHA-256 de un token aleatorio de 32 bytes,
su vencimiento, versión de autenticación y marcas de uso/revocación. Un usuario
puede mantener hasta tres tokens activos; el cuarto pedido no expulsa ninguno.
Resetear contraseña, consumir el token, revocar otros tokens y refresh e
incrementar `authVersion` ocurre en una transacción con lock de `users`.
La fila de usuario se bloquea primero; token, versión y vencimiento se releen
con `clock_timestamp()` dentro de la transacción. Login, refresh y emisión
usan ese orden para impedir una sesión o enlace emitido desde credenciales
anteriores a un reset concurrente. Ninguna solicitud expulsa enlaces vigentes.
Las dos migraciones BE-05 son aditivas; no alteran catálogo ni índices GIN.

`recovery_rate_limit_hits` guarda ventanas compartidas en PostgreSQL. `keyHash`
es HMAC-SHA-256 de IP o identificador; no guarda emails ni IPs en claro. Los
registros se podan al cumplir una hora en cada admisión; el limitador no depende
de Redis ni de estado sólo local.
Un rechazo IP/global no agrega hits; un pedido silenciado por identificador
no extiende su ventana de 60 s. La capacidad local de 32 tickets se reserva
antes de buscar cuentas y vence a los 2 s por reloj monotónico; jobs que no
settlearon también cuentan para evitar crecimiento sin cota.

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

Relaciones: `cards Card[]`, `externalIds CardSetExternalId[]`. Índices: `name`, más el trigram
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
| `rawJson` | `Json` | **obligatorio**: preserva ataques, habilidades, legalidades y el bloque `tcgplayer.prices` (histórico, ya no es la fuente de precios: eso es TCGCSV) |
| `syncedAt` | `DateTime` | |

Relaciones: `set CardSet`, `prices CardPrice[]`, `items CollectionItem[]` y
`externalIds CardExternalId[]`.
Índices: `name`, `setId`, `number`, más el trigram `cards_name_trgm_idx`.

### IDs externos (`card_external_ids`, `card_set_external_ids`)

Las PK actuales de cartas y sets siguen siendo los IDs canónicos que usan las
colecciones y las rutas. Estas tablas asocian los IDs de cada API con esas PKs,
sin reemplazarlas durante una migración de proveedor.

| Tabla | Clave | Relación |
|---|---|---|
| `card_external_ids` | `(provider, externalId)` | `cardId` canónico |
| `card_set_external_ids` | `(provider, externalId)` | `setId` canónico |

La migración inicial registra los IDs existentes de pokemontcg.io y copia los
mappings TCGdex que ya estaban en `card_sets.tcgdexSetId`. Esa columna se conserva
como compatibilidad temporal. Los syncs resuelven las PK canónicas a través de
estos aliases; mientras no haya una importación en sombra, solo se permite
sincronizar pokemontcg.io.

### CardPrice (`card_prices`)

Histórico de precios: **una fila por variante por fecha**, nunca se actualiza.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `uuid()` | |
| `cardId` | `String` | FK a `cards`, `onDelete: Cascade` |
| `variant` | `String` | 8 valores; ver `VARIANT_MAP` en [providers.md](providers.md) |
| `low`, `mid`, `high`, `market` | `Decimal? @db.Decimal(12,2)` | |
| `provider` | `String?` | API que entregó el valor. `NULL` en las filas históricas sin procedencia verificable. |
| `source` | `String @default("tcgplayer")` | Mercado/listing, no la API que lo consultó. |
| `currency` | `String @default("USD")` | |
| `fetchedAt` | `DateTime @default(now())` | **la columna que ordena** el `DISTINCT ON` |

Índice: `@@index([cardId, variant, fetchedAt])`, exactamente el orden del
`DISTINCT ON`, para que "el precio más reciente de esta variante" sea un index
scan y no un sort de 20k filas.

No hay unique sobre `(cardId, variant)`: el histórico es el objetivo. El índice
adicional `(cardId, provider, source, variant, fetchedAt)` prepara lecturas
conscientes de la procedencia; el índice existente se mantiene para las consultas
actuales.

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
"agregar N copias más" sin duplicar filas. El alta usa
`INSERT ... ON CONFLICT DO UPDATE` para incrementar cantidades en las carreras
sin abortar la transacción. Conserva las notas de una fila ya existente y abre
`isForTrade` con un OR, sin cerrar una marca anterior.

Índices: el unique compuesto, `collectionId`, `cardId`.

### CollectionItemAddOperation (`collection_item_add_operations`)

Registro de idempotencia del `POST /collections/:id/items` cuando se envía
`Idempotency-Key`. La clave primaria `(userId, key)` serializa requests
concurrentes del mismo usuario e intento; `payloadHash` rechaza reutilizarla con
otro destino o payload. `resultItemId` permite reconstruir la respuesta sin
guardar notas ni otros campos del ítem. `expiresAt` define 30 días para repetir
la operación; al vencer, el registro queda como tombstone y responde 410 para
evitar que un replay antiguo vuelva a incrementar cantidades. La fila se borra
al eliminar la cuenta (`onDelete: Cascade`).

La escritura del registro, el incremento/creación de `collection_items` y el ID
del resultado comparten una transacción. Los requests sin clave no pasan por esta
tabla y mantienen el incremento aditivo actual.
El UUID se canonicaliza a minúsculas. Una colisión de clave se recupera fuera de
la transacción abortada y vuelve a comprobar ownership antes de leer el resultado.
No hay limpieza por edad: borrar claves vencidas permitiría que una operación
antigua vuelva a sumar. Al reintentar una clave vencida, se limpia `resultItemId`
y se conserva el tombstone; borrar el ítem o la colección tampoco borra la clave.
Solo eliminar la cuenta elimina sus registros. Los registros no contienen fotos,
notas, emails ni el payload; `payloadHash` contiene su hash SHA-256.

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
| [20260925180500_init_users_and_catalog](../prisma/migrations/20260925180500_init_users_and_catalog/migration.sql) | Esquema inicial de usuarios y catálogo. |
| [20260925180600_add_pg_trgm](../prisma/migrations/20260925180600_add_pg_trgm/migration.sql) | Extensión pg_trgm e índices GIN manuales de cartas/sets. |
| [20260926010423_add_friendships](../prisma/migrations/20260926010423_add_friendships/migration.sql) | Amistades e índices manuales de búsqueda de usuarios. |
| [20260927120000_add_tcgdex_set_id](../prisma/migrations/20260927120000_add_tcgdex_set_id/migration.sql) | Mapping de sets TCGdex. |
| [20260928160000_add_cards_artist_trgm](../prisma/migrations/20260928160000_add_cards_artist_trgm/migration.sql) | Índice GIN de artista. |
| [20260929103000_add_card_sets_ptcgo_code](../prisma/migrations/20260929103000_add_card_sets_ptcgo_code/migration.sql) | Código PTCGO del set. |
| [20260930180000_add_provider_identity_and_price_provenance](../prisma/migrations/20260930180000_add_provider_identity_and_price_provenance/migration.sql) | Identidad externa y procedencia de precios. |
| [20260930204819_persistent_job_queue](../prisma/migrations/20260930204819_persistent_job_queue/migration.sql) | Cola persistente, gate de proveedor y cursor de sync. |
| [20260930210000_job_queue_explicit_utc](../prisma/migrations/20260930210000_job_queue_explicit_utc/migration.sql) | Timestamps UTC explícitos en la cola. |
| [20261005170000_portfolio_snapshots](../prisma/migrations/20261005170000_portfolio_snapshots/migration.sql) | Snapshots de portafolio. |
| [20261007090000_collection_item_add_idempotency](../prisma/migrations/20261007090000_collection_item_add_idempotency/migration.sql) | Idempotencia de altas de ítems. |
| [20261009190000_add_password_recovery](../prisma/migrations/20261009190000_add_password_recovery/migration.sql) | Recuperación de contraseña y ventanas de tasa. |
| [20261009200500_add_refresh_auth_version](../prisma/migrations/20261009200500_add_refresh_auth_version/migration.sql) | Versión de autenticación al emitir refresh. |
| [20261013203000_tcgcsv_comparison](../prisma/migrations/20261013203000_tcgcsv_comparison/migration.sql) | Ingesta TCGCSV y snapshots de comparación. |
| [20261014010000_tcgcsv_discovery](../prisma/migrations/20261014010000_tcgcsv_discovery/migration.sql) | Descubrimiento durable de grupos. |
| [20261018010000_price_sync_registry](../prisma/migrations/20261018010000_price_sync_registry/migration.sql) | Registro de sets y controles diarios de precios. |
| [20261026010000_tcgcsv_daily_batch](../prisma/migrations/20261026010000_tcgcsv_daily_batch/migration.sql) | Alcance durable de la tanda común de las 18 ARG. |
| [20261026235959_tcgcsv_batch_backfill_guard](../prisma/migrations/20261026235959_tcgcsv_batch_backfill_guard/migration.sql) | Resguardo del backfill acreditado de la tanda del 26. |
| [20261027010000_tcgcsv_batch_outcomes](../prisma/migrations/20261027010000_tcgcsv_batch_outcomes/migration.sql) | Publicación objetivo y resultados terminales por grupo. |
| [20261027020000_tcgcsv_worker_lease](../prisma/migrations/20261027020000_tcgcsv_worker_lease/migration.sql) | Lease durable del consumidor serial entre procesos. |
| [20261027030000_tcgcsv_wall_clock_reservations](../prisma/migrations/20261027030000_tcgcsv_wall_clock_reservations/migration.sql) | Reservas conservadoras con el fin de petición de la telemetría. |

Las migraciones aplicadas son historia inmutable: no reescribir el esquema inicial
para añadir cambios. Usar migraciones aditivas y `prisma migrate deploy` con
respaldo/ensayo según el entorno. SQL manual preserva los índices que Prisma no
modela.

> **No usar `prisma migrate dev` sobre bases con estos índices manuales.** La
> detección de drift puede proponer eliminarlos. Hay cinco GIN trigram: nombre de
> carta, artista, nombre de set, username y displayName. Las definiciones están
> en las migraciones enlazadas; si falta alguno, restaurar desde su SQL original,
> sin resetear la base. Su ausencia degrada búsqueda difusa; DINOv2 visual no usa
> esos índices para reconocer.

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
- **Umbral de trigram por transacción**: `search` ejecuta
  `SELECT set_config('pg_trgm.similarity_threshold', '0.2', true)` **dentro de
  una transacción** porque el `true` lo hace local a la transacción. Si lo
  sacás de ahí, el threshold no aplica.

## Ver también

- [api.md](api.md) — los DTOs y las formas de respuesta
- [pricing.md](pricing.md) — las dos capas de caché y la regla de 24 h
- [gotchas.md](gotchas.md) — las trampas de Prisma que ya costaron tiempo

## URLs corregidas en el catálogo (3 de octubre de 2026)

Las 13 referencias alternativas de HGSS18 y McDonald’s 2014 ya están en cards.imageSmall/imageLarge. El indexador lee esas columnas sin sustituciones locales; la allowlist conserva las excepciones de URL exacta por ID. La fuente de correcciones es backend/src/catalog/card-image-overrides.json, aplicada por SyncCardsService usando el ID canónico para protegerlas en futuras sincronizaciones. rawJson sigue preservando la respuesta original del proveedor.

Para otra instalación: pnpm run db:fix-images muestra el plan; --apply actualiza ambas columnas en una transacción y guarda respaldo previo en backend/.scanner-index/db-image-urls-before-TIMESTAMP.json. No toca precios ni otras cartas. Next permite static.tcgcollector.com/content/images/** para servir esas referencias. Es necesario reiniciar Next si ya estaba corriendo con la configuración anterior. La calidad es de 320 píxeles de ancho, no alta resolución.

### McDonald’s Collection 2015

Se agregaron las 12 URLs de mcd15 (25 correcciones totales con las anteriores) desde https://www.tcgcollector.com/sets/1194/mcdonalds-collection-2015. Se comprobaron respuestas HTTP 200 y los frentes con nombres/números del set. db:fix-images --apply actualiza sólo las columnas imageSmall/imageLarge; no ejecuta indexación. El script indexador lee PostgreSQL y la allowlist acepta sólo la URL exacta asociada a cada carta corregida.

### McDonald’s Collection 2017

Se corrigieron ambas URLs de mcd17-1 a mcd17-12 desde https://www.tcgcollector.com/sets/11121/mcdonalds-collection-2017. Se verificaron respuestas HTTP 200, nombres, frentes y numeración 1/12–12/12. Hay 37 correcciones totales. Sólo se actualizan las URLs en PostgreSQL y su protección en sync; no se ejecuta indexación.
# Registro diario de precios

`price_sync_sets` es el universo pequeño habilitado para mantenimiento diario;
no reemplaza el catálogo. `price_sync_set_days` registra un ciclo por proveedor,
set y fecha UTC. `price_sync_card_days` conserva el resultado por carta y fuente,
incluidas cotización real, ausencia de precio, falta de asociación, falta de
soporte, espera, reintento y fallo. Los precios siguen almacenados como
observaciones en `card_prices`; no se impone unicidad por día porque pueden
llegar variantes múltiples.

`tcgcsv_daily_batches` fija el alcance habilitado de la tanda por fecha UTC:
`syncDate` es su clave, `openedAt` registra la apertura y `setIds` conserva la
lista original. Una señal repetida, reinicio o baja posterior no vuelve a abrir
ese alcance. Los resultados siguen por set/carta y las bajas manuales se respetan
al consumir; una demanda que llegó después se considera en la tanda siguiente.

El lote conserva `feedPublishedAt`, `status`, intentos de manifest, próxima espera
y cierre. `tcgcsv_batch_groups` usa `(syncDate, groupId)` y mantiene alcance local,
estado, intentos y motivo por grupo; la cola singleton ya no representa por sí sola
el resultado histórico. `workerLockedBy/workerLeaseUntil` en discovery coordinan
un consumidor global; los leases de grupo y reservas de archivos siguen separados.

`provider_rate_limits.blockedUntil` mantiene pausas 429 entre reinicios. Los
trabajos preexistentes se marcan como legacy para diferir los que no correspondan
al registro, sin borrar filas. Ver [jobs.md](jobs.md) para operación.
