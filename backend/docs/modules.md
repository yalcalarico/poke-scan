# Módulos — mapa y dependencias

> Qué responsabilidad tiene cada uno de los 8 módulos de `src/modules`, qué
> services expone y de qué depende. Leelo antes de agregar un módulo nuevo o de
> tocar un import entre módulos.

## Diagrama de dependencias

Las flechas van de "módulo que importa" a "módulo del que depende".

```
                          ┌──────────────┐
                          │    AppModule │  ConfigModule · Throttler · APP_GUARD
                          └──────┬───────┘
        ┌────────────┬──────────┼───────────┬────────────┬────────────┐
        ▼            ▼          ▼           ▼            ▼            ▼
   ┌─────────┐  ┌──────────┐ ┌────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐
   │  Auth   │  │  Users   │ │ Cards  │ │Collection│ │  Share   │ │Friends  │
   └────┬────┘  └────┬─────┘ └───┬────┘ └────┬─────┘ └────┬─────┘ └────┬────┘
        │            │           │           │            │            │
        └────────────┴───────────┼───────────┴────────────┘            │
                                 │                                        │
        ┌────────────────────────┼─────────────────────┐                  │
        ▼                        ▼                     ▼                  │
   ┌─────────┐            ┌─────────────┐       ┌────────────┐           │
   │ Currency│◄───────────│    Jobs     │       │  Prisma    │  @Global  │
   │         │            │ (SyncSets/  │       │  (módulo)  │           │
   │         │  usa       │  SyncCards/ │       └────────────┘           │
   └────┬────┘  Redis     │  SyncPrices)│                                 │
        │           ◄─────┴──────┬──────┘                                 │
        │  usa                  │  CARD_DATA_PROVIDER                     │
   ┌────┴────┐                 ▼            ┌───────────┐   ┌─────────┐  │
   │  Redis  │◄────┐   ┌──────────────────┐│ Providers │   │  Redis  │◄─┘
   │ (@Global)│     └───│ cards · jobs     ││ @Global   │   │ @Global │
   └─────────┘         │ collections      │└───────────┘   └─────────┘
                       └──────────────────┘
```

Leyenda: `Prisma`, `Redis` y `Providers` están marcados `@Global()`, así que
**cualquier** service puede inyectarlos sin importar nada. `Jobs` **no** es
global: hay que importarlo explícitamente para usar sus services.

## Los 8 módulos

### auth

**Responsabilidad**: registro, login, refresh con rotación, logout, emisión de
los access tokens y definición del guard.

| | |
|---|---|
| Controllers | `AuthController` (`/auth`) |
| Services | `AuthService` |
| Exports | `AuthService`, `JwtAuthGuard` |
| Depende de | `PrismaService`, `JwtModule` (global, registrado acá con `registerAsync`), `ConfigService`, `RefreshJwtModule` |
| Lo consume | `UsersModule` (necesita el `JwtAuthGuard`), y cualquier controller que aplique `@UseGuards(JwtAuthGuard)` |

`JwtModule.registerAsync` va **dentro** de `AuthModule` y es `global: true`, así
que el `JwtService` queda disponible en toda la app desde un solo lugar. Ver
[gotchas.md](gotchas.md#8-jwtmoduleregister-con-processenv-se-evalúa-al-importar)
por qué el secret tiene que ir en un `useFactory`.

`RefreshJwtModule` (`refresh-jwt.module.ts`) es un módulo aparte, mínimo, que
registra un segundo `JwtModule` con `JWT_REFRESH_SECRET` y lo expone con el
token `REFRESH_JWT`. **Hoy no lo inyecta nadie**: los refresh tokens son
opacos (`randomBytes(48)`), no JWT. Ver la nota de deuda técnica en
[gotchas.md](gotchas.md#12-el-refresh-token-no-es-un-jwt-deuda-técnica).

### users

**Responsabilidad**: leer y actualizar el perfil del usuario autenticado.
Es el módulo que define **qué es un usuario "público"**: el `select`
`publicUserSelect` (`users.service.ts:14`) es la única fuente de la forma
`PublicUser` y nunca incluye `passwordHash`.

| | |
|---|---|
| Controllers | `UsersController` (`/users`) |
| Services | `UsersService` |
| Exports | `UsersService` |
| Depende de | `AuthModule` (por el guard), `PrismaService` |
| Lo consume | `CurrencyModule` (para `PATCH /currency/preference`) |

`UsersService` expone `findById` y `updatePreferences`. No tiene DTOs propios: el
de preferencia vive en `currency/dto/preference.dto.ts` y se reusa, porque la
forma de entrada es la misma.

### cards

**Responsabilidad**: el catálogo. Búsqueda de cartas, detalle, sets, precios de
una carta e identificación por OCR.

| | |
|---|---|
| Controllers | `CardsController` (`/cards`), `SetsController` (`/sets`) |
| Services | `CardsService`, `IdentifyService` |
| Exports | (nada) |
| Depende de | `PrismaService`, `SyncPricesService` (de `JobsModule`), `CurrencyService` (de `CurrencyModule`) |

`CardsService` y `IdentifyService` **no** importan nada de la API externa: todo
sale de Postgres. `CardsService` es el único que llama a
`SyncPricesService.getPricesForCard()`, que es quien decide si hay que pegarle
al proveedor. `IdentifyService` solo lee `card_prices` con un `DISTINCT ON`.

#### `IdentifyService`: por qué el nombre solo no alcanza

El cliente manda hasta 60 líneas crudas del OCR y el backend.matchea contra las
20.670 cartas con trigram + ILIKE. El **nombre no desempata**: "Charizard" está en
~40 sets y todas las impresiones se llaman igual. Por eso el ranking suma señales
de **lo que la carta tiene impreso**, que el OCR lee bastante bien (la última
línea de una carta real trae `Mitsuhiro Arita © 1995… © 1999 4/102`):

| Señal | Cómo se saca | Bonus |
|---|---|---|
| Número impreso `N/M` | regex `/(\d{1,3})\s*\/\s*(\d{2,3})/` con denominador plausible (30-400) | 0.25 |
| HP | regex `/(\d{2,4})\s*HP\b/` acotado a 10-400 para no confundirlo con daño o con la Pokédex | 0.12 |
| Artista | `position(lower(c.artist) in <texto del OCR>)` | 0.12 |
| Rareza | `position(lower(c.rarity) in <texto del OCR>)`, exige ≥4 caracteres | 0.08 |

El número impreso es la más fuerte porque el denominador **es** el `printedTotal`
del set: el par identifica set y carta de una.

Dos decisiones de diseño que importan:

- **Ninguna señal resta.** Si el OCR no leyó el HP, no hay nada que comparar y el
  bonus es 0: una señal ausente no penaliza. Y una mal leída tampoco, porque el
  bonus solo se da en el match exacto.
- **No hay vocabulario hardcodeado.** Para rareza y artista se busca *el valor que
  ya tiene la carta* dentro del texto del OCR, así que funciona con cualquier
  rareza o firmante que la fuente tenga.

El spec usa "Absol" a propósito: tiene 20 impresiones con distinto HP, artista,
rareza y numeración, así que cada señal es comprobable de forma unívoca. La
debilidad conocida es que el match de rareza es un `substring`: si el OCR leyó
"Rare Secret", la carta cuya rareza es "Rare" también matchea y empata.

**El tope del piso exacto para nombres de 3 letras** (`SHORT_NAME_FLOOR`) viene de
una foto real: el OCR leyó "mes" donde la carta dice "Mew", y como "mes" es
exactamente el nombre "Mew" en minúsculas, el piso de match exacto de 1.0 le
ganaba al nombre real de la carta ("Chandelure", leído una sola vez y por eso con
el 0.97 de `SINGLE_OCCURRENCE_FACTOR`). Con un nombre tan corto, "igual" y "casi
igual" son indistinguibles, así que el piso se topa en 0.8: hunde la carta sin
sacarla de los candidatos (`MIN_SCORE` es 0.25, y un "Mew" legítimo sigue siendo
top-1 cuando no hay nada mejor).

Los DTOs de shapes de respuesta (`CardDto`, `SetDto`, `CardPriceDto`,
`Paginated<T>`) están **duplicados a mano** en `cards.service.ts`,
`collections.service.ts` y los reexportan por `import type` desde
`collections`. No hay un `types/` compartido.

### collections

**Responsabilidad**: CRUD de colecciones y de items, duplicados, estadísticas y
encolado de refresco de precios.

| | |
|---|---|
| Controllers | `CollectionsController` (`@Controller()` sin prefijo → `/collections/*` y `/items/*`) |
| Services | `CollectionsService` |
| Exports | (nada) |
| Depende de | `PrismaService`, `SyncPricesService` (`@Optional()`) |

`SyncPricesService` es **`@Optional()`** a propósito: los tests unitarios
construyen el service sin el job de precios (`collections.service.ts:177`), así
`enqueueRefresh` se vuelve un no-op con `?.`.

Es el módulo que más SQL crudo tiene: `aggregateQuery`, `getStats`,
`fetchLatestPrices` y `latestPriceJoin`. También es el módulo del que **copian**
los shapes `CardDto` / `PriceDto` / `CollectionItemDto` / `CollectionStatsDto`
`share` y `friends`.

### share

**Responsabilidad**: links públicos de colección y sus métricas de visitas.

| | |
|---|---|
| Controllers | `ShareController` (`/share`, con guard de clase), `PublicShareController` (`/s`, **sin** guard) |
| Services | `ShareService` |
| Depende de | `PrismaService`, `RedisService` |

Dos controllers y no uno, para que la ruta pública no quede detrás del
`@UseGuards(JwtAuthGuard)` de clase del privado.

`ShareService` es el único que genera slugs y cachea el payload público completo
5 min bajo `share:<slug>`. Copia los DTOs de collections y su propio
`fetchLatestPrices`. No depende de `CollectionsService` (reimplementa el
`toItemDto`).

### currency

**Responsabilidad**: cotización USD→ARS (blue / oficial) desde DolarApi, con
caché y degradación elegante, y la preferencia de moneda del usuario.

| | |
|---|---|
| Controllers | `CurrencyController` (`/currency`) |
| Services | `CurrencyService` |
| Exports | `CurrencyService` |
| Depende de | `RedisService`, `UsersModule` |

Es el módulo con la lógica externa más defensiva: timeout de 5 s, validación del
`content-type`, rango sano del valor (`1` .. `1.000.000`), fallback a un valor
"último conocido" sin TTL, y `null` en vez de excepción en `convert()`.

No depende de `UsersService` **directamente**: el controller lo inyecta para que
`PATCH /currency/preference` reutilice `updatePreferences` y devuelva el mismo
shape que `GET /users/me`.

Constantes compartidas (`currency.constants.ts`) las importan `cards/dto`
(`PREFERRED_CURRENCIES`, `RATE_TYPES`) y `users/users.service.ts`.

### friends

**Responsabilidad**: búsqueda de usuarios, solicitudes, aceptación/rechazo,
amistad aceptada, colección de un amigo, baja y bloqueo.

| | |
|---|---|
| Controllers | `FriendsController` (`@Controller()` sin prefijo → `/users/search` y `/friends/*`) |
| Services | `FriendsService` |
| Exports | (nada) |
| Depende de | `PrismaService`, `RedisService`, y **los types** de `CollectionsService` (solo `import type`) |

Comparte la URL `/users` con `UsersModule`: los dos decorators usan rutas
exactas (`/users/me` y `/users/search`) así que no colisionan, pero el prefijo
está partido entre dos módulos. Es una deuda menor de cohesión.

`FriendsService` también usa `CollectionsService` en los **tests** para armar las
colecciones de los amigos; en producción solo usa sus tipos.

`FRIEND_PUBLIC_SELECT` es una proyección **más chica** que `publicUserSelect`: sin
`email`, sin preferencias. Es intencional: un email no debe salir por una búsqueda
de usuarios.

### providers

**Responsabilidad**: abstraer la fuente de datos externa detrás de un token de
inyección, para poder cambiarla sin tocar los jobs.

| | |
|---|---|
| Controllers | ninguno |
| Providers | `PokemonTcgIoProvider` (bound a `CARD_DATA_PROVIDER`), `OcrLocalProvider` (bound a `CARD_IDENTIFICATION_PROVIDER`) |
| Exports | `CARD_DATA_PROVIDER`, `CARD_IDENTIFICATION_PROVIDER` |
| Depende de | nada (solo `fetch` nativo) |
| `@Global` | sí |

Es el único módulo `@Global` además de `Prisma`, `Redis`: los jobs y cualquier
otro service pueden inyectar `CARD_DATA_PROVIDER` sin importar `ProvidersModule`
(aunque `JobsModule` lo importe igual explícitamente).

Detalle completo de la interfaz, el `VARIANT_MAP` y cómo migrar a Scrydex en
[providers.md](providers.md).

## `jobs` — no es un módulo de `src/modules`, pero es parte del mapa

`src/jobs/` está **fuera** de `src/modules/` a propósito: son servicios de
infraestructura, no de dominio.

| | |
|---|---|
| Controller | `JobsController` (`/jobs`, auth por `x-admin-key`, no JWT) |
| Services | `SyncSetsService`, `SyncCardsService`, `SyncPricesService` |
| Exports | los tres services (por eso `CardsModule` y `CollectionsModule` los pueden importar) |
| Depende de | `ProvidersModule`, `RedisModule`, `ConfigModule` |

`JobsModule` se importa en `AppModule` para que el controller de admin exista.
`CardsModule` y `CollectionsModule` lo importan para inyectar
`SyncPricesService`. Detalle en [jobs.md](jobs.md).

## Reglas para agregar un módulo nuevo

1. Carpeta en `src/modules/<nombre>/` con `*.module.ts`, `*.controller.ts`,
   `*.service.ts` y `dto/`.
2. **Todos los imports relativos con extensión `.js`**, sin excepción (ESM).
3. Controller: `@Controller('x')` + `@UseGuards(JwtAuthGuard)` si necesita auth.
   Si tiene rutas públicas y privadas, **dos controllers** (ver `share`).
4. DTOs con `class-validator`; nada llega al service sin pasar por el DTO.
5. Ownership siempre en el `where` del `findFirst`, nunca un check aparte.
6. Agregá el módulo a `imports` de `AppModule`.
7. Si exponés un service para otros módulos, ponelo en `exports`.
8. Si el service copia un DTO de otro módulo, **no lo centralices de paso**:
   duplicar es el patrón actual y cambiarlo es un refactor aparte.

## Ver también

- [api.md](api.md) — qué expone cada controller
- [database.md](database.md) — los modelos que tocan los services
- [gotchas.md](gotchas.md) — antes de agregar un `@Module` con `process.env` adentro
