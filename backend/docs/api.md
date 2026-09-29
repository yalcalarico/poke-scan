# API — referencia de endpoints

> Los 40 endpoints del backend y cómo llamarlos: método, ruta, auth, query
> params con su validación, body (el DTO real), respuesta (la forma real),
> errores posibles y un ejemplo. Si vas a tocar un controller, este es el doc.

- **Prefijo global**: `/api` (`app.setGlobalPrefix('api')` en `src/main.ts:22`)
- **Base local**: `http://localhost:3001`
- **Linter de contrato**: los tipos están duplicados en `frontend/types/api.ts`.
  Si tocás un DTO, actualizá los dos lados en el mismo commit.

## Índice

| Grupo | Endpoints |
|---|---|
| [Salud](#salud) | 1 |
| [Auth](#auth) | 4 |
| [Usuarios](#usuarios) | 1 |
| [Cartas y sets](#cartas-y-sets) | 6 |
| [Colecciones](#colecciones) | 13 |
| [Compartir](#compartir) | 6 |
| [Moneda](#moneda) | 2 |
| [Amigos](#amigos) | 7 |
| [Jobs (admin)](#jobs-admin) | 3 |

---

## Convenciones globales

### Autenticación

- **Access token**: JWT firmado con `JWT_SECRET`, payload `{ sub, email }`,
 Expira a los 15 min (`JWT_ACCESS_TTL`).
- **Refresh token**: **no es un JWT**. Es `randomBytes(48).toString('base64url')`
  que se guarda hasheado con SHA-256 en `refresh_tokens.tokenHash`
  (`auth.service.ts:173`, `:194`). Vive `JWT_REFRESH_TTL_DAYS` (30) días.
- Se manda como `Authorization: Bearer <accessToken>`.
- Las respuestas de `register`, `login` y `refresh` tienen esta forma
  (`common/types/auth-user.ts`):

```ts
interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

type PublicUser = {
  id: string; email: string; username: string; displayName: string;
  avatarUrl: string | null;
  preferredCurrency: string | null;   // 'USD' | 'ARS' | null
  preferredRateType: string | null;   // 'blue' | 'oficial' | null
  createdAt: string; updatedAt: string;
};
```

`passwordHash` **nunca** sale: todos los selects usan `publicUserSelect`
(`users/users.service.ts:14`).

### Refresh con rotación y detección de reuso

Cada `POST /auth/refresh` **revoca** el token usado y emite uno nuevo:

1. Se busca por `sha256(refreshToken)`.
2. Si no existe → `401 Refresh token inválido`.
3. Si ya estaba revocado → se revocan **todas** las sesiones del usuario y
   `401 Refresh token reutilizado: se revocaron todas las sesiones`. Esto es
   detección de robo: un atacante que reutiliza un token viejo invalida la
   sesión legítima.
4. Si `expiresAt` ya pasó → `401 Refresh token expirado`.
5. Se marca `revokedAt` y se emite un par nuevo.

`POST /auth/logout` es **idempotente**: revoca el token si estaba vivo y siempre
devuelve `{ success: true }`, incluso con un token inexistente.

### Cómo se aplica el guard

`JwtAuthGuard` **no** es un `APP_GUARD`: se aplica con `@UseGuards(JwtAuthGuard)`
explícito. Los controllers protegidos son `UsersController`, `CollectionsController`
(clase completa, `@Controller()` sin prefijo), `ShareController` y
`FriendsController`, más el método `PATCH /currency/preference`.

> **Nota**: el decorador `@Public()` no lo lee ningún guard global. Los
> controllers "públicos" (`CardsController`, `SetsController`,
> `PublicShareController`, `CurrencyController`) son públicos simplemente porque
> **no** tienen `@UseGuards`. Si se aplica `@UseGuards(JwtAuthGuard)` a nivel de
> clase ahí, el `@Public()` no lo va a revertir. Ver
> [gotchas.md](gotchas.md#9-el-decorador-public-no-lo-lee-ningún-guard).

### Rate limiting

`@nestjs/throttler` 6.7.1, configurado en `app.module.ts:20` y `:33`:

| Alcance | Configuración |
|---|---|
| Global (todas las rutas) | `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])` + `ThrottlerGuard` como `APP_GUARD` |
| `POST /auth/register` | `@Throttle({ default: { limit: 5, ttl: 60_000 } })` |
| `POST /auth/login` | `@Throttle({ default: { limit: 5, ttl: 60_000 } })` |

Tracker por IP. Al exceder: `429 Too Many Requests`.
Detalle en [pricing.md](pricing.md) y [gotchas.md](gotchas.md).

### Endpoints de admin

Los 3 endpoints de `/jobs` **no** requieren JWT: se autentican con el header
`x-admin-key`, que se compara contra `ADMIN_KEY`
(`jobs/jobs.controller.ts:100`):

- `ADMIN_KEY` no definido → `403 ADMIN_KEY no está configurado: endpoint deshabilitado`
- header ausente o distinto → `403 x-admin-key inválido`

### Validación

`ValidationPipe({ whitelist: true, transform: true })` global. Campos desconocidos
en el body se **descartan silenciosamente** (no hay `forbidNonWhitelisted`).
Un fallo de validación devuelve `400` con la forma estándar de Nest.

Los query params numéricos usan `@Type(() => Number)`, así que llegan ya
convertidos. Los booleanos de query (`duplicatesOnly`, `isDefault`, `isForTrade`,
`accept`) pasan por un `@Transform(toBoolean)` que acepta `'true'`/`'false'`.

### Ejemplos base

```bash
# Ejemplo con curl (si tu curl de macOS funciona)
curl -s http://localhost:3001/api/cards/search?q=pikachu | head -c 400

# Alternativa sin curl: Node 22 ya trae fetch
node -e "fetch('http://localhost:3001/api/cards/search?q=pikachu&pageSize=2').then(r=>r.json()).then(console.log)"
```

---

## Salud

### `GET /api/health`

Público, sin body. Lo único que no requiere ni auth ni infra: devuelve literal.

**200**

```json
{ "status": "ok" }
```

```bash
curl -s http://localhost:3001/api/health
```

---

## Auth

Controller: `src/modules/auth/auth.controller.ts`. Prefijo `/auth`.

### `POST /api/auth/register`

Público. **201 Created**. Límite: 5/min.

Body `RegisterDto` (`auth/dto/register.dto.ts`):

| Campo | Reglas | Default |
|---|---|---|
| `email` | `@IsEmail()`, `@MaxLength(254)`. Se normaliza a minúsculas con `.trim()` | — |
| `password` | `@IsString()`, `@MinLength(8)`, `@MaxLength(72)` | — |
| `username` | `@Matches(/^[a-zA-Z0-9_]{3,20}$/)` | — |
| `displayName` | `@MinLength(2)`, `@MaxLength(50)` | — |

**200/201** → `AuthTokens`.

| Error | Cuándo |
|---|---|
| `400` | Fallo de validación del DTO |
| `409 El email ya está registrado` | Ya existe ese email |
| `409 El username ya está en uso` | Ya existe ese username |
| `429` | Más de 5 por minuto |

```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"ada@example.com","password":"secret123","username":"ada","displayName":"Ada"}'
```

```json
{
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "kQ3v...-base64url",
  "user": {
    "id": "b1c2...",
    "email": "ada@example.com",
    "username": "ada",
    "displayName": "Ada",
    "avatarUrl": null,
    "preferredCurrency": "USD",
    "preferredRateType": "blue",
    "createdAt": "2026-09-25T14:00:00.000Z",
    "updatedAt": "2026-09-25T14:00:00.000Z"
  }
}
```

### `POST /api/auth/login`

Público. **200 OK** (`@HttpCode(200)`). Límite: 5/min.

Body `LoginDto`: `email` (`@IsEmail()`), `password` (`@IsString()`,
`@MinLength(1)`). El email se normaliza igual que en register.

| Error | Cuándo |
|---|---|
| `400` | Body inválido |
| `401 Credenciales inválidas` | Email inexistente **o** password incorrecto (mismo mensaje para los dos casos, no revela qué falla) |
| `429` | Más de 5 por minuto |

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"ada@example.com","password":"secret123"}'
```

### `POST /api/auth/refresh`

Público. **200 OK**. Body `RefreshSessionDto`:

| Campo | Reglas |
|---|---|
| `refreshToken` | `@IsString()`, `@IsNotEmpty()` |
| `deviceInfo` | Opcional, `@MaxLength(255)` |

**200** → `AuthTokens` (token nuevo; el anterior queda revocado).

| Error | Cuándo |
|---|---|
| `401 Refresh token inválido` | No hay fila con ese hash |
| `401 Refresh token reutilizado: se revocaron todas las sesiones` | El token ya estaba revocado → se mata toda la familia |
| `401 Refresh token expirado` | Pasaron los 30 días |

```bash
curl -X POST http://localhost:3001/api/auth/refresh \
  -H 'content-type: application/json' \
  -d '{"refreshToken":"kQ3v...","deviceInfo":"iPhone 15"}'
```

### `POST /api/auth/logout`

Público. **200 OK**. Mismo body que `refresh`. Siempre responde
`{ "success": true }`.

```bash
curl -X POST http://localhost:3001/api/auth/logout \
  -H 'content-type: application/json' \
  -d '{"refreshToken":"kQ3v..."}'
```

---

## Usuarios

### `GET /api/users/me`

**Requiere Bearer.** Devuelve el `PublicUser` del token (re-consulta la DB, no
confía en el claim `email`).

| Error | Cuándo |
|---|---|
| `401 Token de acceso requerido` | Sin header `Authorization` |
| `401 Token de acceso inválido o expirado` | Firma/exp inválidos |
| `404 Usuario no encontrado` | El `sub` del token no existe más |

```bash
curl http://localhost:3001/api/users/me -H "Authorization: Bearer $TOKEN"
```

---

## Cartas y sets

Controller: `src/modules/cards/cards.controller.ts` + `sets.controller.ts`.
**Todos públicos.** No incluyen precios en ARS: el cliente pide el rate una vez
a `/currency/usd-ars` y convierte localmente.

Shape de `CardDto` (se repite en `collections`, `share` y `friends`, duplicado a
mano en cada service):

```ts
interface CardDto {
  id: string;            // "base1-4"
  name: string;          // "Charizard"
  supertype: string;     // "Pokémon" | "Trainer" | "Energy"
  subtypes: string[];
  hp: string | null;
  types: string[];
  number: string;        // "4"
  rarity: string | null;
  artist: string | null;
  setId: string;
  set?: SetDto;          // presente salvo en items anidados
  imageSmall: string;
  imageLarge: string;
}

interface SetDto {
  id: string; name: string; series: string | null;
  printedTotal: number | null; total: number | null;
  releaseDate: string | null; logoUrl: string | null; symbolUrl: string | null;
}
```

### `GET /api/cards/search`

Público. Query `SearchCardsDto` (`cards/dto/search-cards.dto.ts`):

| Param | Reglas | Default | Efecto |
|---|---|---|---|
| `q` | `@MaxLength(80)` | — | Texto libre. Con ≥3 chars (y `searchBy` textual) agrega trigram + score |
| `searchBy` | `@In(['name','number','artist'])` | `name` | Campo contra el que matchea `q` |
| `setId` | `@IsString()` | — | `c."setId" = $1` (exacto) |
| `rarity` | `@IsString()` | — | `c.rarity ILIKE $1` — **igualdad case-insensitive, no substring** |
| `supertype` | `@IsString()` | — | `c.supertype ILIKE $1` (mismo criterio) |
| `type` | `@IsString()` | — | `c.types @> ARRAY[$1]::text[]` |
| `page` | `@IsInt()`, `@Min(1)` | `1` | |
| `pageSize` | `@IsInt()`, 1..100 | `20` | |
| `sort` | `@In(['name','rarity','number','price'])` | `name` | Solo se usa si **no** hay `q` |
| `direction` | `@In(['asc','desc'])` | `asc` | Sentido del `sort`. **Se ignora si hay `q`** |

#### `searchBy`: qué matchea cada modo

| `searchBy` | Matching | Trigram | Score |
|---|---|---|---|
| `name` | `name ILIKE '%q%'` | sí, con ≥3 chars | prefijo 1.0 · substring 0.8 · similitud |
| `artist` | `artist ILIKE '%q%'` | sí, con ≥3 chars | ídem |
| `number` | `number ILIKE 'q'` (**igualdad**) | no | todos empatan (1.0) |

`number` es **igualdad, no substring**, a propósito: `number` es un token corto
y repetido (`"4"` aparece en 163 sets), no un texto. Un `ILIKE '%4%'` devolvería
el 4, el 40, el 104 y el 4a, que es lo que el usuario **no** pidió. Además el
input se normaliza (trim y `#` inicial) y el `ILIKE` sin comodines es igualdad
case-insensitive: `"tg02"` encuentra `"TG02"`, `"#4"` encuentra `"4"`. Resuelto
por el `@@index([number])` del schema (~2 ms), sin índice trigram.

El modo `artist` usa el GIN trigram `cards_artist_trgm_idx`, que vive en una
**migración a mano** (`20260928160000_add_cards_artist_trgm`) y **no** en el
schema de Prisma — ver [gotchas.md](gotchas.md) §2. Sin él, la búsqueda por
artista es un seq scan sobre 20.670 cartas (72 ms medidos; 12 ms con índice).

#### Orden

- **Con `q`**: por score descendente y después `name`, `id`. `direction` **se
  ignora**: el score de relevancia no es invertible, darle la vuelta pone lo
  menos parecido primero, que no es lo mismo que "últimos". `searchBy=number` es
  el único caso donde el score no se usa: ordena por `set.name`, número e `id`,
  para que "4" muestre Base 4, Jungle 4, Fossil 4…
- **Sin `q`**: según `sort` y `direction`. El desempate (`name`, `id`) queda
  **siempre ascendente** en las dos direcciones: es solo para que la paginación
  sea estable.

| `sort` | Orden |
|---|---|
| `name` | `name {dir}, id ASC` |
| `rarity` | `rarity {dir} NULLS LAST, name ASC` |
| `number` | parte numérica de `number` {dir} `NULLS LAST`, `name ASC` |
| `price` | precio de mercado {dir} `NULLS LAST`, `name ASC`, `id ASC` |

`sort=price` ordena por el **mejor precio de mercado disponible** de la carta
(`MAX(market)` sobre el último precio de cada variante, resuelto con
`DISTINCT ON ("cardId", variant)`). No se elige una variante fija (holofoil u
otra) a propósito: hay cartas que solo tienen `reverseHolofoil` o
`firstEdition`, y con una preferencia fija quedarían sin precio, que es justo lo
que el orden tiene que evitar.

Este `DISTINCT ON` **sí** es global a propósito —no tiene forma de anclarse a
una carta porque el filtro de precio es justamente el que todavía no está
decidido— y por eso es la forma más cara del archivo. Solo se paga cuando el
cliente pidió `sort=price`; el resto de las búsquedas no lo incluyen. Ver
[gotchas.md](gotchas.md) §22.

**Las cartas sin precio van siempre al final**, en las dos direcciones: son
~20.600 de 20.670 y en `desc` el default de Postgres (`NULLS FIRST`) las
pondría arriba, que es lo opuesto de "más caras primero".

Respuesta `Paginated<CardDto>`:

```ts
{ data: CardDto[]; page: number; pageSize: number; total: number; totalPages: number }
```

| Error | Cuándo |
|---|---|
| `400` | `pageSize` fuera de 1..100, o `sort`/`direction`/`searchBy` inválidos |

```bash
curl 'http://localhost:3001/api/cards/search?q=charizard&pageSize=2'
```

```json
{
  "data": [
    {
      "id": "base1-4", "name": "Charizard", "supertype": "Pokémon",
      "subtypes": ["Stage 2"], "hp": "120", "types": ["Fire"], "number": "4",
      "rarity": "Rare", "artist": "Ken Sugimori", "setId": "base1",
      "imageSmall": "https://images.pokemontcg.io/.../base1-4.png",
      "imageLarge": "https://images.pokemontcg.io/.../base1-4_hires.png",
      "set": { "id": "base1", "name": "Base", "series": "Base",
               "printedTotal": 102, "total": 102,
               "releaseDate": "1999-01-01T00:00:00.000Z",
               "logoUrl": null, "symbolUrl": null }
    }
  ],
  "page": 1, "pageSize": 2, "total": 137, "totalPages": 69
}
```

```bash
# por artista, tolerante a typos
curl 'http://localhost:3001/api/cards/search?q=sugimr&searchBy=artist&pageSize=2'
# el número 4 exacto, no el 40 ni el 104
curl 'http://localhost:3001/api/cards/search?q=4&searchBy=number&pageSize=2'
# las más caras primero
curl 'http://localhost:3001/api/cards/search?sort=price&direction=desc&pageSize=2'
```

### `GET /api/cards/:id`

Público. `id` es el id de pokemontcg.io (`base1-4`), URL-encoded.
Devuelve `CardDto` **con** `set` incluido siempre (404 si no hay set, lo cual no
pasa con el catálogo espejado).

| Error | Cuándo |
|---|---|
| `404 Carta no encontrada: <id>` | No está en el catálogo local |

```bash
curl http://localhost:3001/api/cards/base1-4
```

### `GET /api/cards/:id/prices`

Público. Query `CardPricesQueryDto` (`cards/dto/card-prices-query.dto.ts`):

| Param | Reglas | Default |
|---|---|---|
| `currency` | `@IsIn(['USD','ARS'])` | `'USD'` |
| `rateType` | `@IsIn(['blue','oficial'])` | `'blue'` |

**200** → `CardWithPricesDto`:

```ts
interface CardWithPricesDto {
  card: CardDto;
  prices: CardPriceDto[];
  conversion?: ConversionMeta | null;   // solo si currency=ARS Y hay rate cacheado
}

interface CardPriceDto {
  cardId: string; variant: string;
  low: number | null; mid: number | null; high: number | null; market: number | null;
  currency: string; source: string; fetchedAt: string;
  priceArs?: { low: number|null; mid: number|null; high: number|null; market: number|null } | null;
  change?: PriceChangeDto | null;   // ver "Variación de 30 días" abajo
}

interface PriceChangeDto {
  usd: number;        // con signo: -2839.31 es una caída. Siempre USD
  percent: number;    // cero decimales, redondeo simétrico
  windowDays: number; // 30
  from: string;       // ISO del fetchedAt REAL de la fila de referencia
}

interface ConversionMeta {
  rate: number; rateType: 'blue'|'oficial'; fetchedAt: string; stale: boolean;
}
```

#### Variación de 30 días (`change`)

`change` mide el precio de referencia contra la ventana de 30 días. No hay tabla
nueva: `card_prices` es append-only, así que el valor viejo sale de un
`DISTINCT ON (variant) ... WHERE "fetchedAt" < now() - 30 días`, y solo lo
calcula este endpoint (los precios de items de colección y del link público no lo
traen, así que ahí el campo viene ausente).

**Qué precio se compara:** `market` y, si es `null`, `mid` — la misma precedencia
que usa el cliente para elegir la cifra del hero (`heroPriceUsd` en
`components/prices/card-price-section.tsx`). **La misma columna en los dos
extremos**: si hoy hay `market` y la fila vieja no, `change` es `null`. Comparar
el `market` de hoy contra el `mid` de hace 30 días mide un cambio de valuación,
no de precio.

**`change` es `null`** (no `0`, no `undefined`) cuando:

| Motivo | Por qué |
|---|---|
| No hay ninguna fila **anterior** a la ventana | Devolver el precio actual como si fuera el de hace 30 días convierte "cayó 73 %" en "cayó 0 %" sin explicación. `card_prices` hoy tiene unos días de historia, así que es el caso más común. |
| La referencia tiene más de 90 días | El diseño rotula la píldora con la ventana; un delta de medio año rotulado "30 días" es falso. |
| El precio actual tiene más de 24 h | El cliente ya lo marca viejo con un `Alert` (`PRICE_MAX_AGE_MS`). Un delta preciso al lado de ese aviso dice dos cosas distintas sobre el mismo número. |
| El precio de referencia es `0` o `null` | Dividir por cero. Un `0 %` afirma que el precio no se movió, que es un dato. |

`from` viaja siempre que hay `change`: es la fecha real de la fila usada, que
puede ser más vieja que la ventana. El cliente puede mostrarla en vez de la
ventana cuando quiera no mentir.

**Costo:** una query extra por carta, en paralelo con `getPricesForCard`, sobre
`card_prices(cardId, variant, fetchedAt)` — el índice que ya existía. Medido con
`EXPLAIN ANALYZE` sobre 142.379 filas: **120 buffers y 3,4 ms** en el peor caso
(8 variantes × 365 días = 2.920 filas de una carta, 2.696 anteriores a
la ventana), y el planner usa el `AND "fetchedAt" < cutoff` como **index
condition**, así que la ventana recorta dentro del índice en vez de después.

```
Unique  (actual time=3.742..3.972 rows=8 loops=1)
  ->  Sort  (actual time=3.741..3.831 rows=2696 loops=1)
        ->  Bitmap Heap Scan on card_prices p  (actual time=0.842..1.722 rows=2696 loops=1)
              ->  Bitmap Index Scan on "card_prices_cardId_variant_fetchedAt_idx"
                    Index Cond: (("cardId" = 'base1-1') AND ("fetchedAt" < now() - '30 days'))
Buffers: shared hit=96
Execution Time: 4.153 ms
```

**No hace falta un índice nuevo**, y el `Sort` de 2.696 filas en
memoria no lo justifica: `market` y `mid` no están en el índice, así que el
acceso al heap es necesario de todos modos y un index-only scan no cambiaría
nada.

El `WHERE` por fecha además es **obligatorio** y no una optimización: sin él
la query lee el histórico entero de la carta (113 buffers / 3,9 ms contra
120 / 3,4 ms, que con una sola carta es poca diferencia porque el índice ya
acota por `cardId`, pero es el mismo `DISTINCT ON` sin scope del
[gotcha 26](gotchas.md)).

**Por qué esto no se extiende a los endpoints que devuelven muchas cartas.**
`change` solo lo calcula `GET /cards/:id/prices`, que es de a una carta. Meterlo
en el listado de items o en el link público multiplicaría el costo por la
cantidad de cartas de la respuesta (una `DISTINCT ON` por carta, N cartas), y
esos endpoints hoy no paginan. Si alguna vez hace falta, el precio de
referencia de muchas cartas se resuelve en **una** query con
`DISTINCT ON ("cardId", variant) ... WHERE "cardId" = ANY($1) AND "fetchedAt" < $2`,
no con N lookups.

Lo que sí hay que mirar es el volumen de `card_prices`: es append-only y no
tiene job de poda (ver [gotchas.md](gotchas.md)), así que el día que una carta
tenga años de histórico esta query lee proporcionalmente más filas. El
`LIMIT 1` de la última cotización, que sí usa `latestMarketPriceJoin`, no lo
padece: el índice corta en la primera fila.

Con `?currency=ARS` el backend usa **solo** el rate ya cacheado en Redis
(`getCachedRate`, que nunca llama a DolarApi). Si no hay nada cacheado, los
precios vienen sin `priceArs` y sin `conversion` — **no falla**. Si el rate
tiene más de 48 h, `conversion.stale` viene `true` para que el cliente muestre
un `≈`.

Esta ruta es la única que puede pedirle precios al proveedor externo (tcgdex):
si el precio tiene más de 24 h (`MAX_AGE_MS`), `getPricesForCard` refresca
contra tcgdex. Si la fuente todavía no cotiza la carta, devuelve el último
precio conocido con la lista `prices` vacía, sin error. Ver
[pricing.md](pricing.md).

| Error | Cuándo |
|---|---|
| `404` | La carta no existe |
| `400` | `currency` o `rateType` fuera del enum |

```bash
curl 'http://localhost:3001/api/cards/base1-4/prices?currency=ARS&rateType=blue'
```

### `POST /api/cards/identify`

Público. **200 OK** (`@HttpCode(200)`). Recibe las líneas **crudas** que devolvió
el OCR del cliente y las fuzzy-matchea contra las 20.670 cartas locales. Es
`POST` justamente para no colisionar con `GET /cards/:id`.

Body `IdentifyDto` (`cards/dto/identify.dto.ts`):

| Campo | Reglas | Default |
|---|---|---|
| `lines` | Opcional, `@IsArray()`, `@ArrayMaxSize(60)`, strings | `[]` |
| `name` | Opcional, `@MaxLength(80)` — mejor guess del cliente, máxima prioridad | — |
| `number` | Opcional, `@MaxLength(20)` — número impreso; **bonus chico** (0.06) | — |
| `setHint` | Opcional, `@MaxLength(80)` — ej `"Base"`; bonus 0.2 | — |
| `limit` | Opcional, `@IsInt()`, 1..20 | `8` (`DEFAULT_IDENTIFY_LIMIT`) |

**200** → `IdentifyResultDto`:

```ts
interface IdentifyResultDto {
  candidates: IdentifiedCandidateDto[];  // ya ordenadas por score
  extracted: { name: string | null; number: string | null; setHint: string | null };
  totalCandidates: number;               // los que pasaron MIN_SCORE (0.25)
}

interface IdentifiedCandidateDto {
  card: CardDto;
  score: number;         // 0..1, redondeado a 2 decimales
  matchedText: string;   // la línea/ventana del OCR que matched
  prices: CardPriceDto[];// siempre en USD, sin priceArs
  price: CardPriceDto | null;  // la variante de mayor market
}
```

Reglas de ranking (todo en `identify.service.ts`): máximo 3 cartas por nombre,
`MIN_SCORE = 0.25`, penaliza boilerplate (`STOPWORDS`), penaliza nombres de
pre-evolución leídos de "Evolves from X", y hunde por 0.2 los nombres de menos
de 3 caracteres (energías "N", "F", "W" matcheaban perfecto con cualquier ruido).

| Error | Cuándo |
|---|---|
| `400` | `lines` con más de 60 elementos, `limit` fuera de 1..20, etc. |

```bash
curl -X POST http://localhost:3001/api/cards/identify \
  -H 'content-type: application/json' \
  -d '{"lines":["115% 4 Charizard &","STAGE 2 Evolves from Charmeleon"],"limit":3}'
```

```json
{
  "candidates": [
    { "card": { "id": "base1-4", "name": "Charizard", "...": "..." },
      "score": 0.95, "matchedText": "4 Charizard",
      "prices": [ { "cardId": "base1-4", "variant": "holofoil", "low": 1200,
                    "mid": 1500, "high": 4000, "market": 1800,
                    "currency": "USD", "source": "tcgplayer",
                    "fetchedAt": "2026-09-25T12:00:00.000Z" } ],
      "price": { "variant": "holofoil", "market": 1800, "...": "..." } }
  ],
  "extracted": { "name": "Charizard", "number": null, "setHint": "Base" },
  "totalCandidates": 12
}
```

### `GET /api/sets`

Público. Sin query params. Lista **todos** los sets (176) ordenados por
`releaseDate DESC, name ASC`. Devuelve `SetDto[]` pelado.

```bash
curl 'http://localhost:3001/api/sets' | head -c 200
```

### `GET /api/sets/:id/cards`

Público, como su hermano `GET /sets`: el catálogo ya está expuesto por
`/cards/search?setId=`, así que no agrega superficie pública nueva. Lo que
agrega es **no obligar al binder a paginar**: el set más grande del catálogo
(`swshp`, 304 cartas) serían 3 requests encadenados de a 100 contra
`/cards/search?setId=`.

**200** → `SetCardsResponseDto`, **sin paginación**:

```ts
interface SetCardsResponseDto {
  set: SetDto;
  cards: CardDto[];   // todas las del set, con su `set` embebido
  total: number;      // COUNT real de filas en `cards` para ese set
}
```

- Orden: `NUMERIC_NUMBER ASC NULLS LAST, c.name ASC` — el mismo
  `NUMERIC_NUMBER` que usa `sort: 'number'` en `/cards/search`
  (`cards.service.ts:21`), para que los slots del binder salgan en el orden
  impreso y no alfabético: `4` antes que `10` antes que `4a`. Los que empatan
  numéricamente (`19` y `19a`) desempatan por nombre.
- `total` es el **conteo real de la tabla `cards`**, que puede diferir de
  `SetDto.total` (el que declara la fuente). El binder cuenta slots con este
  número, no con el de la fuente.
- Peso: 55 kB para `base1` (102 cartas), 181 kB para `swshp` (304). De esos
  181 kB, 79 kB son el mismo `SetDto` repetido en cada carta, porque `toCardDto`
  las embebe igual que en `/cards/search`.
- El `set` y las cartas se resuelven en paralelo: el set es una lectura por PK
  y las cartas usan `cards_setId_idx`. `COUNT(*) OVER ()` evita una segunda
  query de conteo.

| Error | Cuándo |
|---|---|
| `404 Set no encontrado: <id>` | El `setId` no está en el catálogo espejado |

```bash
curl 'http://localhost:3001/api/sets/base1/cards' | head -c 300
```

---

## Colecciones

Controller: `src/modules/collections/collections.controller.ts`. `@Controller()`
sin prefijo, `@UseGuards(JwtAuthGuard)` a nivel de clase → **todo lo de esta
sección requiere Bearer**.

> **Ownership**: una colección ajeno da **404**, no 403, porque el `userId` va
> en el `where` del `findFirst` (`collections.service.ts:182`). Un 403 confirmaría
> que el recurso existe.

```ts
interface CollectionDto {
  id: string; userId: string; name: string; isDefault: boolean;
  itemCount: number;      // SUM(quantity) — cartas totales
  uniqueCount: number;    // COUNT(*) de items
  duplicateCount: number; // items con quantity > 1
  totalValueUsd: number;  // SUM(quantity * último market)
  totalValueArs: number | null;  // SIEMPRE null (ver pricing.md)
  cover: CollectionCoverItem[];  // hasta 4 miniaturas de portada; [] si no hay items
  createdAt: string;
}

/** Una miniatura del collage de portada. */
interface CollectionCoverItem {
  cardId: string;
  imageSmall: string;   // URL, no binario: ~79 bytes de JSON por item
}

interface CollectionItemDto {
  id: string; collectionId: string;
  card: CardDto;
  variant: string; condition: string; quantity: number;
  isForTrade: boolean; notes: string | null; addedAt: string;
  price: PriceDto | null;  // el más reciente de esa variante
}

interface PriceDto {
  cardId: string; variant: string;
  low: number|null; mid: number|null; high: number|null; market: number|null;
  currency: string; source: string; fetchedAt: string;
}

interface CollectionStatsDto {
  totalCards: number; uniqueCards: number; duplicateCards: number;
  setsCount: number; totalValueUsd: number; totalValueArs: number | null;
  cardsMissingPrice: number;
}
```

### `GET /api/collections/:id/set-progress`

**200** → `SetProgressDto[]`, un `$queryRaw` con el mismo join de precio que
`/stats` (`latestMarketPriceJoin`). Es el agregado por set que necesita la
pantalla de progreso y el binder.

```ts
interface SetProgressDto {
  setId: string;
  owned: number;        // COUNT(DISTINCT cardId) — cartas ÚNICAS
  total: number;        // card_sets.total ?? card_sets.printedTotal ?? 0
  valueUsd: number;     // SUM(quantity × market), 2 decimales, COALESCE 0
  valueArs: number|null;// SIEMPRE null (ver pricing.md)
  missingCount: number; // GREATEST(total - owned, 0), en SQL
}
```

**No viene `SetDto`**: el nombre, el `symbolUrl` y el `logoUrl` los junta el
cliente con el `GET /sets` que ya existe (176 sets, una request). Así esto es
un `$queryRaw` de números y el metadata de un set no vive en un cuarto lugar.

- **Array pelado, sin `Paginated`.** Son, a lo sumo, los sets en los que la
  colección tiene alguna carta. `[]` si la colección está vacía, **nunca 404**.
- `owned` cuenta cartas **únicas**: la misma carta con dos items (variante
  `normal` + `holofoil`) es **una** carta con dos copias, no dos. Es la misma
  regla que usa el agregado del cliente. Ojo con `/stats`: su `uniqueCards` es
  `COUNT(i.id)`, o sea **items**, no cartas distintas, así que con duplicados
  los dos números difieren (`owned` 7 vs `uniqueCards` 8 con un item doble).
- `total` sale de la **fuente** (`card_sets.total`, y `printedTotal` si el
  primero es `NULL`), nunca de un `COUNT(cards)`: un set incompleto en la base
  daría un porcentaje mentiroso. Si la fuente no declara ninguno va `0` y el
  cliente lo muestra como desconocido. En los 176 sets espejados hoy ninguno
  cae en ese caso.
- `valueUsd` sale del **mismo** join de precio que usa `/stats`
  (`latestMarketPriceJoin`: la última fila de `card_prices` de la variante del
  item), así que la suma de las filas es exactamente
  `CollectionStatsDto.totalValueUsd` (verificado contra la base real). El
  precio es el de la **variante del item**.
- Orden: `valueUsd DESC, porcentaje DESC (NULLS LAST), missingCount ASC,
  setId ASC`. El `setId` del final es lo que hace la lista determinista: sin él
  dos filas empatadas saltarían de posición entre renders. Los sets sin
  denominador no se pueden ordenar por porcentaje, y por eso van al final.

| Error | Cuándo |
|---|---|
| `404 Colección no encontrada: <id>` | No es del usuario (id ajeno **no** da 403) |
| `401` | Sin token |

```bash
curl "http://localhost:3001/api/collections/$ID/set-progress" \
  -H "Authorization: Bearer $TOKEN"
```

```json
[
  { "setId": "base1", "owned": 5, "total": 102, "valueUsd": 2585.63,
    "valueArs": null, "missingCount": 97 },
  { "setId": "base2", "owned": 2, "total": 64, "valueUsd": 382.06,
    "valueArs": null, "missingCount": 62 }
]
```

### `POST /api/collections`

**201 Created.** Body `CreateCollectionDto`: `name` (`@MinLength(1)`,
`@MaxLength(50)`, con trim) e `isDefault?` (`@IsBoolean()`, default `false`).

La **primera** colección del usuario siempre se crea con `isDefault: true`; si
pedís `isDefault: true`, las anteriores se desmarcan en la misma transacción.
Existe a lo sumo una default por usuario.

| Error | Cuándo |
|---|---|
| `400` | `name` vacío o muy largo |
| `401` | Sin token |

```bash
curl -X POST http://localhost:3001/api/collections \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"name":"Mi binder"}'
```

### `GET /api/collections`

**200.** `CollectionDto[]` con las agregaciones ya resueltas en SQL (sin N+1).
Orden: `isDefault DESC, createdAt ASC, id ASC`.

Efecto colateral: si el usuario no tiene ninguna colección, **crea** una
llamada `"Mi colección"` con `isDefault: true` (`ensureDefaultCollection`).

**Son 2 queries fijas, no 2 por colección**: una de agregados (`aggregateQuery`) y
una de portadas (`loadCovers`). Van en `Promise.all`, así que ni el tiempo ni el
número de round-trips crece con cuántas colecciones tenga el usuario.

#### `cover`: el collage de portada

Hasta 4 cartas para el mosaic de `/colecciones`. Reglas:

| Regla | Por qué |
|---|---|
| `ORDER BY quantity DESC, addedAt ASC, id ASC` | Las copias repetidas son las que el usuario reconoce, y el desempate con `id` hace el orden **determinista** entre requests. |
| Sin repetir carta (`DISTINCT ON (cardId)` adentro) | La misma carta puede estar con dos variantes o dos condiciones; sin esto la grilla 2×2 muestra la misma imagen dos veces. |
| Sin repetir `item` en la misma colección | El `@@unique` es `(collectionId, cardId, variant, condition)`, así que dos filas de la misma carta son una entrada y media en el collage. |
| `[]` en `create` | La colección está vacía: no se enciende una query para devolver un array vacío. |

Sale de un **único** `$queryRaw` con `CROSS JOIN LATERAL` por colección
(`LIMIT 4`), no de `row_number()`: el lateral se detiene en 4 filas por colección
y usa el índice `collection_items(collectionId)`, mientras que la ventana tiene
que ordenar **todos** los items del usuario para descartar casi todos. Medido
con `EXPLAIN ANALYZE` sobre un usuario de 5 colecciones y 200 items: **310
buffers y 1,0 ms** contra **604 buffers y 4,6 ms** de la variante con
`row_number()`. La diferencia es de asintótica, no de constante: con 2.000 items
el lateral queda igual (117 buffers) y la ventana se va a 6.033 buffers y 15,9
ms.

El criterio del `ORDER BY` sale del lateral y se repite textual en el `ORDER BY`
de afuera, que termina en `id` (la PK): es un **orden total**, así que dos
requests seguidos devuelven el mismo mosaico y la UI no parpadea. Adentro del
lateral **no** hay `row_number()`: el `LIMIT` ya elige las 4 filas y la ventana
se pagaba sobre todos los items de la colección para tirar casi todos.

El `JOIN cards` va **por fuera** del lateral a propósito: la tupla de `cards`
arrastra el `rawJson` (decenas de KB), y proyectar `imageSmall` recién después
del `LIMIT` hace 20 accesos al heap de `cards` en vez de 200 (627 → 84 buffers).
Del `rawJson` no se lee ni una columna: la proyección del mosaico es
`cardId` + `imageSmall`.

**Costo del payload:** `imageSmall` es una **URL**, no un binario, así que es lo
más barato que puede ser una miniatura. Medido con los `imageSmall` reales del
catálogo (41 caracteres de promedio):

| | Bytes |
|---|---|
| Un item de `cover` (`{"cardId":"base1-1","imageSmall":"…"}`) | **79** |
| El `cover` de una colección con 4 items | 319 |
| El `cover` de 5 colecciones con 4 items cada una | 1.595 |

Son ~1,2 kB sobre una respuesta que, sin el `cover`, anda en los 5 kB con las
agregaciones de las 5 colecciones. El `cover` es la parte barata del payload, y
si alguna vez molestara el arreglo no es achicar el campo sino pedir 3 en vez de
4.

`PATCH` y `GET /:id` devuelven el mismo `cover` que el listado: los tres caminos
usan el mismo helper, y `create` el único que devuelve `[]`.

```bash
curl http://localhost:3001/api/collections -H "Authorization: Bearer $TOKEN"
```

### `GET /api/collections/:id`

**200** → `CollectionDto`. `404` si no es del usuario.

### `PATCH /api/collections/:id`

**200** → `CollectionDto` (re-leído con las agregaciones). Body
`UpdateCollectionDto`, todo opcional: `name?` (1..50), `isDefault?` (boolean).
Si `isDefault: true`, desmarca las otras.

| Error | Cuándo |
|---|---|
| `400` / `404` / `401` | validación / no es suya / sin token |

```bash
curl -X PATCH http://localhost:3001/api/collections/$ID \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"name":"Binder 2026","isDefault":true}'
```

### `DELETE /api/collections/:id`

**204 No Content.** Borra en cascada items y share links. `404` si no es suya.

```bash
curl -X DELETE http://localhost:3001/api/collections/$ID -H "Authorization: Bearer $TOKEN"
```

### `GET /api/collections/:id/items`

Query `ListItemsDto`:

| Param | Reglas | Default |
|---|---|---|
| `page` | `@IsInt()`, `@Min(1)` | `1` |
| `pageSize` | `@IsInt()`, 1..200 | `50` |
| `duplicatesOnly` | `@IsBoolean()` | `false` → filtra `quantity > 1` |
| `forTradeOnly` | `@IsBoolean()` | `false` → filtra `isForTrade = true` |
| `setId` | `@MaxLength(64)` | filtra por `card.setId` exacto |
| `search` | `@MaxLength(80)` | `card.name contains` case-insensitive |

**200** → `Paginated<CollectionItemDto>`. Orden `addedAt DESC, id ASC`.

`duplicatesOnly` y `forTradeOnly` **se componen** (los dos a la vez devuelven los
items repetidos que además están marcados para intercambiar) y el `count` usa
el mismo `where` que los datos, así que `total` y `totalPages` siempre
corresponden a los items de la página. `forTradeOnly` existe porque filtrar
"para intercambiar" del lado del cliente daba "0 resultados" en la página 3 de
una colección con 200 items marcados.

```bash
curl 'http://localhost:3001/api/collections/$ID/items?duplicatesOnly=true&pageSize=100' \
  -H "Authorization: Bearer $TOKEN"
```

### `POST /api/collections/:id/items`

**201 Created.** Body `AddItemDto`:

| Campo | Reglas | Default |
|---|---|---|
| `cardId` | `@MaxLength(64)`, trim | — |
| `variant?` | `@IsIn(CARD_VARIANTS)` (8 valores) | `'normal'` |
| `condition?` | `@IsIn(['NM','LP','MP','HP','DM'])` | `'NM'` |
| `quantity?` | `@IsInt()`, 1..999 | `1` |
| `notes?` | `@MaxLength(500)` | — |

`CARD_VARIANTS` (`collections/dto/card-variant.ts`) tiene **8** entradas:
`normal`, `holofoil`, `reverseHolofoil`, `firstEditionNormal`,
`firstEditionHolofoil`, `firstEdition`, `unlimited`, `unlimitedHolofoil`.

**Semántica de `quantity`**: "agregar N copias **más**". Si ya existe un item
con el mismo `(collectionId, cardId, variant, condition)` — hay un
`@@unique` compuesto — se le **incrementa** `quantity` en vez de crear otra fila. Hay
handling de la carrera por el `P2002` (dos requests idénticos simultáneos).

Además, encola un refresco de precio en background (`enqueueRefresh`), por eso
el `price` de la respuesta puede venir `null` aunque la carta tenga precio.

| Error | Cuándo |
|---|---|
| `400` | `variant`/`condition` inválidos |
| `404 Colección no encontrada: <id>` | No es del usuario |
| `404 Carta no encontrada: <cardId>` | El cardId no está en el catálogo |

```bash
curl -X POST http://localhost:3001/api/collections/$ID/items \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"cardId":"base1-4","variant":"holofoil","condition":"NM","quantity":2}'
```

### `GET /api/collections/:id/duplicates`

**200** → `CollectionItemDto[]` (sin paginar) con `quantity > 1`, ordenadas por
`quantity DESC` y después `price.market DESC`.

### `GET /api/collections/:id/stats`

**200** → `CollectionStatsDto`, todo en **una** query con
`latestMarketPriceJoin`. `cardsMissingPrice` cuenta las cartas
**distintas** que no tienen ninguna fila en `card_prices` (no las que tienen la
fila con `market` en null). `totalValueArs` siempre `null`.

| Error | Cuándo |
|---|---|
| `404` | No es suya |

```json
{ "totalCards": 4, "uniqueCards": 3, "duplicateCards": 1, "setsCount": 1,
  "totalValueUsd": 253, "totalValueArs": null, "cardsMissingPrice": 1 }
```

### El join de precio de los agregados (`latestMarketPriceJoin`)

Los tres agregados que necesitan un precio por item —`/stats`, `/set-progress` y
el listado de colecciones— usan el **mismo** fragmento SQL, en
`src/common/sql/latest-price.ts`:

```sql
LEFT JOIN LATERAL (
  SELECT p.market AS "market"
  FROM card_prices p
  WHERE p."cardId" = i."cardId" AND p.variant = i.variant
  ORDER BY p."fetchedAt" DESC
  LIMIT 1
) lp ON true
```

Que sea un literal compartido no es cosmético: `totalValueUsd`, `valueUsd` y
el total del listado tienen que ser el mismo número con la misma regla, y con
`card_prices` append-only dos copias de la regla divergen apenas una consulta
empieza a filtrar y la otra no.

**Por qué `LATERAL` y no `DISTINCT ON (cardId, variant)` global:** el
`DISTINCT ON` sin `WHERE` no sabe qué cartas se van a usar, así que materializa
una fila por (carta, variante) de **toda** la tabla y después une eso con los
items. `card_prices` es append-only y no tiene job de poda, así que el costo
crece con la historia global de precios. Medido con 142.379 filas y 5
colecciones / 200 items, `GET /api/collections`:

| Forma | Buffers | Execution |
|---|---|---|
| `DISTINCT ON` global (antes) | 9.755 | 14 ms |
| **`LATERAL` por item (ahora)** | **774** | **1,9 ms** |
| `DISTINCT ON` + `EXISTS` de scope | 30.278 | 24 ms |

La tercera es la peor: para que el `DISTINCT ON` pueda filtrar por las cartas de
cada colección hay que referenciar `col.id` desde adentro, Postgres lo exige
como `LATERAL`, y entonces la tabla derivada **se reejecuta una vez por
colección** recorriendo el índice entero de `card_prices` cada vez. El scope
correcto es el anclaje por fila, no un `WHERE` adentro. Detalle completo en
[gotchas.md](gotchas.md) §26.

Con el `LATERAL` cada lookup es un `Index Cond` sobre
`card_prices(cardId, variant, fetchedAt)` que corta en la primera fila, así que
**el costo de estos tres endpoints queda atado a la cantidad de items y no al
tamaño del histórico.** No hace falta ningún índice nuevo.

`share.service.ts` y el listado de items usan otra forma equivalente —
`WHERE p."cardId" = ANY($1)` sobre un `DISTINCT ON`— que ya estaba acotada
porque trae las cartas de un `findMany` previo, así que nunca tuvieron el
problema.

### `POST /api/collections/:id/refresh-prices`

**201 Created** (no lleva `@HttpCode`, así que es el 201 default de Nest).
Sin body. Encola el refresco de precio de todas las cartas de la colección que
**aún no tienen** ninguna fila en `card_prices`.

**201** → `{ "queued": number }`

```bash
curl -X POST http://localhost:3001/api/collections/$ID/refresh-prices \
  -H "Authorization: Bearer $TOKEN"
```

### `PATCH /api/items/:itemId`

**200** → `CollectionItemDto`. Body `UpdateItemDto`, todo opcional:
`quantity?` (1..999), `isForTrade?`, `notes?` (`@MaxLength(500)`),
`variant?`, `condition?`.

El item se busca por `{ id: itemId, collection: { userId } }`, así que el
`collectionId` sale de la fila existente.

| Error | Cuándo |
|---|---|
| `400` | Valores fuera de rango / enum |
| `404 Item no encontrado: <id>` | No existe o es de otro usuario |
| `409 Ya existe un item con esa misma variante y condición en la colección` | Choca con el `@@unique`; se chequea antes y también se captura el `P2002` |

```bash
curl -X PATCH http://localhost:3001/api/items/$ITEM_ID \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"quantity":7,"isForTrade":true,"notes":"para trade el sábado"}'
```

### `DELETE /api/items/:itemId`

**204 No Content.** `404` si no es del usuario.

---

## Compartir

Controller privado: `src/modules/share/share.controller.ts` (`@Controller('share')`
+ guard de clase). Controller público: `public-share.controller.ts`
(`@Controller('s')`, sin guard).

```ts
interface ShareLinkDto {
  id: string; slug: string; url: string;
  collectionId: string | null;
  collectionName: string | null;   // null = comparte todas
  isActive: boolean; viewCount: number;
  createdAt: string; expiresAt: string | null;
}

interface SharedCollectionDto {   // GET /s/:slug
  ownerDisplayName: string;
  collectionName: string;         // "Todas las colecciones" si no es una sola
  items: CollectionItemDto[];     // máx. 500
  stats: CollectionStatsDto;
  truncated: boolean;             // había más de 500
  sharedAt: string;
}
```

### `POST /api/share`

**201 Created.** Body `CreateShareDto`: `collectionId?` (`@MaxLength(64)`; vacío
o ausente = **todas** las colecciones del usuario), `expiresInDays?` (int, 1..365).

Genera un slug aleatorio de 10 caracteres del alfabeto `a-z0-9`, con hasta 5
intentos ante colisión (el `@@unique` de BD sigue siendo la garantía real).

| Error | Cuándo |
|---|---|
| `400` | `expiresInDays` fuera de 1..365 |
| `404 Colección no encontrada: <id>` | El `collectionId` no es del usuario |

```bash
curl -X POST http://localhost:3001/api/share \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"collectionId":"'$ID'","expiresInDays":30}'
```

### `GET /api/share`

**200** → `ShareLinkDto[]` del usuario, `createdAt DESC, id ASC`.

### `GET /api/share/stats`

**200** → `ShareViewStatsDto[]`: mismo shape que `ShareLinkDto` pero ordenado por
`viewCount DESC, createdAt DESC, id ASC`. Sirve para la pantalla de métricas.

> Ojo con el orden de las rutas: `GET /share/stats` se declara **después** de
> `GET /share` pero ambos son exactos, así que no hay colisión.

### `PATCH /api/share/:id`

**200** → `ShareLinkDto`. Body `UpdateShareDto`: `isActive?` (boolean),
`expiresInDays?` (1..365, se recalcula **desde ahora**). Invalida la caché del
slug público.

| Error | Cuándo |
|---|---|
| `404 Enlace no encontrado: <id>` | No es suyo |
| `400` | `expiresInDays` fuera de rango |

### `DELETE /api/share/:id`

**204 No Content.** **No borra la fila**: setea `isActive: false` (revocar es
idempotente) e invalida la caché. `404` si no es suyo.

### `GET /api/s/:slug`

**Público, sin Bearer.** Devuelve `SharedCollectionDto`. El payload completo se
cachea en Redis bajo `share:<slug>` por 5 minutos.

Cada hit incrementa `viewCount` con un `updateMany` atómico sin await (fire and
forget): **la respuesta devuelve el valor de `viewCount` desactualizado** (de
hecho ni lo devuelve: el DTO público no incluye el contador).

| Error | Cuándo |
|---|---|
| `404 Este enlace no está disponible` | No existe, `isActive: false` o `expiresAt` vencido |

```bash
curl http://localhost:3001/api/s/a1b2c3d4e5
```

---

## Moneda

Controller: `src/modules/currency/currency.controller.ts`.

### `GET /api/currency/usd-ars`

**Público.** Query `QuoteQueryDto`: `type?` `@IsIn(['blue','oficial'])`,
default `'blue'`.

**200** → `BothRatesView`: los dos tipos para que el cliente ofrezca el selector,
más los campos de primer nivel reflejando el tipo pedido.

```ts
interface RateView { rate: number; rateType: 'blue'|'oficial'; fetchedAt: string; stale: boolean }

interface BothRatesView extends RateView {
  blue: RateView | null;
  oficial: RateView | null;
}
```

Un tipo puede faltar (`null`) sin tumbar al otro. Si caen los dos →
`503`. La cotización se cachea 1 h en `currency:usd:both`; hay además una clave
`currency:usd:<type>:last` **sin TTL** que se sirve con `stale: true` cuando
DolarApi no responde.

| Error | Cuándo |
|---|---|
| `400` | `type` inválido |
| `404 Precios en ARS deshabilitados` | `CURRENCY_ARS_ENABLED=false` |
| `503` | DolarApi caído y sin valor cacheado |

```bash
curl 'http://localhost:3001/api/currency/usd-ars?type=blue'
```

```json
{ "rate": 1560, "rateType": "blue", "stale": false,
  "fetchedAt": "2026-09-25T20:58:00.000Z",
  "blue":    { "rate": 1560, "rateType": "blue",    "fetchedAt": "...", "stale": false },
  "oficial": { "rate": 1545, "rateType": "oficial", "fetchedAt": "...", "stale": false } }
```

### `PATCH /api/currency/preference`

**Requiere Bearer** (`@UseGuards(JwtAuthGuard)` a nivel de método).
Body `UpdatePreferenceDto`: `preferredCurrency` `@IsIn(['USD','ARS'])` (obligatorio),
`preferredRateType?` `@IsIn(['blue','oficial'])`.

**200** → `PublicUser` completo (mismo shape que `/users/me`, reusa
`publicUserSelect`). Si no mandás `preferredRateType`, se conserva el que ya
tenía.

```bash
curl -X PATCH http://localhost:3001/api/currency/preference \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"preferredCurrency":"ARS","preferredRateType":"blue"}'
```

---

## Amigos

Controller: `src/modules/friends/friends.controller.ts`. `@Controller()` sin
prefijo + guard de clase. **Requiere Bearer en todo.**

Estados de la relación tal como los ve quien busca (`relationship`):
`none` | `pending_sent` | `pending_received` | `friends` | `blocked`.
`rejected` se colapsa en `none` (el par puede volver a solicitarse).

```ts
interface FriendIdentityDto { id: string; username: string; displayName: string; avatarUrl: string | null }

interface FriendRequestResultDto {
  id: string;
  requester: FriendIdentityDto;
  addressee: FriendIdentityDto;
  status: string;          // pending | accepted | rejected | blocked
  createdAt: string;
  respondedAt: string | null;
}
```

> La proyección de usuario ajeno (`FRIEND_PUBLIC_SELECT`) es **más chica** que
> `publicUserSelect`: solo `id`, `username`, `displayName`, `avatarUrl`. El
> `email` de un usuario **nunca** sale por estas rutas.

### `GET /api/users/search`

Query `SearchUsersDto`:

| Param | Reglas | Default |
|---|---|---|
| `q` | Opcional en el DTO, `@MinLength(2)`, `@MaxLength(40)` | — |
| `page` | `@IsInt()`, `@Min(1)` | `1` |
| `pageSize` | `@IsInt()`, 1..50 (`USER_SEARCH_MAX_PAGE_SIZE`) | `20` |

**200** → `Paginated<UserSearchResultDto>` con
`{ id, username, displayName, avatarUrl, relationship }`. Se busca parcial
case-insensitive sobre `username` **o** `displayName` (índices trigram
`users_username_trgm_idx` / `users_display_name_trgm_idx`) y **excluye al propio
usuario**.

| Error | Cuándo |
|---|---|
| `400 El término de búsqueda debe tener al menos 2 caracteres` | Sin `q` o con 1 carácter (piso en el service, no en el DTO) |

```bash
curl 'http://localhost:3001/api/users/search?q=ada&pageSize=10' -H "Authorization: Bearer $TOKEN"
```

### `POST /api/friends/request`

**201 Created.** Body `FriendRequestDto`: `username` (`@MinLength(3)`,
`@MaxLength(20)`, trim) — el destinatario se busca por **username exacto**.

| Error | Cuándo |
|---|---|
| `400 No podés enviarte una solicitud a vos mismo` | `username` es el tuyo |
| `404 Usuario no encontrado: <username>` | No existe, **o el par está bloqueado** (no se revela la existencia) |
| `409 Ya existe una relación con ese usuario` | Ya hay `pending`/`rejected` en cualquier sentido |

Si ya son `accepted` devuelve la relación tal cual (idempotente), no 409.

```bash
curl -X POST http://localhost:3001/api/friends/request \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"username":"ada"}'
```

### `GET /api/friends`

**200** → `FriendsListDto`:

```ts
interface FriendsListDto {
  friends: FriendListItemDto[];        // accepted, cualquiera de los dos sentidos
  requestsReceived: FriendIdentityDto[];// pending dirigidos a mí
}

interface FriendListItemDto extends FriendIdentityDto {
  friendsSince: string;                          // = Friendship.respondedAt
  collectionSummary: { totalCards: number; uniqueCards: number;
                       duplicateCards: number; totalValueUsd: number };
}
```

El resumen de cada amigo sale de **una** agregación SQL agrupada por `userId`,
cacheada 5 min bajo `friends:summary:<id>`. `friends` viene ordenado por
`respondedAt DESC`.

El `totalValueUsd` del resumen usa el **mismo** `latestMarketPriceJoin` que
`/collections/:id/stats` (ver la nota de "El join de precio de los agregados"),
así que el número que ve un amigo mirando la colección de otro es el mismo que
el del dueño, con la misma regla. Es un **cambio compartido**: si mañana el
join se toca, se mueve el `/stats`, el `/set-progress`, el listado de
colecciones y el resumen de amigos juntos.

### `POST /api/friends/:requesterId/respond`

**201 Created.** Solo el **addressee** puede responder. Body
`FriendRespondDto`: `accept` (boolean, default `false`; acepta el string
`'true'`/`'false'`).

Aceptar pone `accepted` + `respondedAt` e invalida las cachés de la amistad.

| Error | Cuándo |
|---|---|
| `400 No podés responder tu propia solicitud` | `requesterId === userId` |
| `404 No hay ninguna solicitud pendiente para responder` | No hay `pending` con vos como addressee (también si ya respondiste) |

```bash
curl -X POST http://localhost:3001/api/friends/$REQUESTER/respond \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"accept":true}'
```

### `GET /api/friends/:friendId/collection`

Query `FriendCollectionQueryDto`: `collectionId?` (`@MaxLength(64)`), `page?`
(`@Min(1)`, default 1), `pageSize?` (1..200, default 50).

Sin `collectionId` resuelve la **default** del amigo, o la primera por
`isDefault DESC, createdAt ASC, id ASC`. El DTO declara `page`/`pageSize` pero
**el service los ignora**: carga hasta 500 items.

**200** → `FriendCollectionDto`, con el **mismo shape** que `GET /s/:slug` para
que el frontend reutilice el componente, más `friend` y `collectionId`:

```ts
interface FriendCollectionDto {
  friend: FriendIdentityDto;
  ownerDisplayName: string;
  collectionId: string | null;
  collectionName: string;     // "Todas las colecciones" si no se resolvió una concreta
  items: CollectionItemDto[]; // máx. 500, truncated marca el corte
  stats: CollectionStatsDto;
  truncated: boolean;
  sharedAt: string;           // = now(), no es la fecha de creación
}
```

Cacheado 5 min bajo `friends:collection:<viewerId>:<friendId>:<collectionId|all>`.
**La autorización se revalida ANTES de leer la caché**, así que una amistad
baja no puede seguir sirviendo datos por TTL.

| Error | Cuándo |
|---|---|
| `400 No podés ver tu propia colección por esta ruta` | `friendId === userId` |
| `404 No sos amigo de ese usuario` | No hay relación, o el par está `blocked` |
| `403 Necesitás ser amigo de ese usuario para ver su colección` | Hay relación pero no está `accepted` (pending/rejected) |
| `404 Colección no encontrada` | El `collectionId` no es del amigo |

```bash
curl 'http://localhost:3001/api/friends/$FRIEND_ID/collection' -H "Authorization: Bearer $TOKEN"
```

### `DELETE /api/friends/:friendId`

**204 No Content.** Idempotente: si no hay relación no falla; si era `pending`
la pasa a `rejected` (deja estado terminal auditable) en vez de borrarla; si era
`accepted` borra la fila. Invalida las cachés de los dos lados.

### `DELETE /api/friends/:friendId/block`

**204 No Content.** `blocked` vive en la fila del par (el bloqueador se guarda
como `requesterId` para no violar el `@@unique` con el par invertido). Si ya
son amigos, bloquear termina la amistad y la colección deja de ser visible.

| Error | Cuándo |
|---|---|
| `400 No podés bloquearte a vos mismo` | `friendId === userId` |

---

## Jobs (admin)

Controller: `src/jobs/jobs.controller.ts`. **No pide JWT**: se autentica con el
header `x-admin-key` contra `ADMIN_KEY`. Sin `ADMIN_KEY` configurado, los tres
responden `403`.

```ts
class SyncCatalogDto { force?: boolean }               // @Type(() => Boolean)
class RefreshPricesDto { cardIds: string[] }           // @ArrayNotEmpty(), @ArrayMaxSize(200)
```

### `POST /api/jobs/sync-catalog`

**202 Accepted** (`@HttpCode(202)`). Body `SyncCatalogDto`: `force?` (boolean).
Si `force` no viene y existe la clave Redis `sync:cards:complete`, el job
termina `skipped` sin gastar requests.

Crea un `ScanJob` y **devuelve de inmediato** (`void this.runSync(...)`): el
sync corre en background. Poll con `GET /jobs/:id`.

**202** → `{ "started": true, "jobId": "<uuid>" }`

```bash
curl -X POST http://localhost:3001/api/jobs/sync-catalog \
  -H "x-admin-key: $ADMIN_KEY" -H 'content-type: application/json' \
  -d '{"force":true}'
```

### `POST /api/jobs/refresh-prices`

**200 OK**. Body `RefreshPricesDto`: `cardIds`, array de strings no vacío, máx.
200. **Refresca en serie y bloqueante** (llama a `refresh()` por cada id), así
que puede tardar minutos con 200 cartas.

**200** →

```json
{ "requested": 3, "refreshed": 3, "failed": 0 }
```

| Error | Cuándo |
|---|---|
| `400` | `cardIds` vacío, con algo que no sea string, o >200 |
| `403` | `x-admin-key` inválido / `ADMIN_KEY` no configurado |

```bash
curl -X POST http://localhost:3001/api/jobs/refresh-prices \
  -H "x-admin-key: $ADMIN_KEY" -H 'content-type: application/json' \
  -d '{"cardIds":["base1-4","base1-5"]}'
```

### `POST /api/jobs/scan-capture` — **solo desarrollo**

Guarda un PNG del escáner en disco para poder mirar los recortes intermedios.
Es el endpoint que usa `NEXT_PUBLIC_SCAN_CAPTURE=1` del frontend.

**Sin `x-admin-key` a propósito**: lo llama el navegador, que no lo tiene. A
cambio **en producción devuelve 404** (`NODE_ENV=production`), solo acepta PNGs
y escribe con nombres sanitizados (`^[a-zA-Z0-9_.-]+$`) en
`SCAN_CAPTURE_DIR`, que por defecto es `/tmp/pokemon-scanner-captures`.

**201 Created** →

```json
{ "path": "/tmp/pokemon-scanner-captures/run-3/04-banda-1-grayscale.png" }
```

| Error | Cuándo |
|---|---|
| `404` | en producción, o el `png` no es un data URL de PNG |
| `413` | el PNG pesa más de 8 MB (por eso el frontend lo achica a 1000px) |

```bash
curl -X POST http://localhost:3001/api/jobs/scan-capture \
  -H 'content-type: application/json' \
  -d "{\"run\":\"prueba\",\"step\":\"01-foto\",\"png\":\"data:image/png;base64,$(base64 -i foto.png | tr -d '\n')\"}"
```

### `GET /api/jobs/:id`
**200** → la fila `ScanJob` cruda, o `null` si no existe. Permite ver el
progreso de un sync en vivo.

```ts
{
  id, userId, status,     // pending | running | completed | failed | skipped
  jobType,                // sync-catalog | refresh-prices
  processed, total, lastError, startedAt, completedAt, createdAt
}
```

```bash
curl http://localhost:3001/api/jobs/$JOB_ID -H "x-admin-key: $ADMIN_KEY"
```

---

## Ver también

- [database.md](database.md) — modelo de datos detrás de cada shape
- [pricing.md](pricing.md) — por qué los precios son bajo demanda y qué pasa con `$0`
- [jobs.md](jobs.md) — cómo se llena el catálogo
- [gotchas.md](gotchas.md) — las trampas del proyecto

---

## Endpoints que se decidió **no** agregar

Un apartado de lo que falta a propósito, para que la próxima persona no lo agregue
por entusiasmo.

### `GET /api/cards/:id/price-history?window=30d`

Devolvería la serie de precios de una carta para un sparkline. **No existe, y
no hace falta todavía**: ningún componente de la v2 lo consume, así que sería un
endpoint público más que mantener sin un cliente que lo use.

Cuando haga falta, el cálculo ya está hecho: es un
`SELECT "fetchedAt", market FROM card_prices WHERE "cardId" = $1 AND "fetchedAt" >= $2 ORDER BY "fetchedAt"` sobre el índice que ya existe. Lo que hay que decidir el día que se pida, no antes:

- **Cuántos puntos.** `card_prices` es append-only y no tiene poda: una carta
  consultada a diario durante un año son 365 filas. Un sparkline no necesita 365
  puntos, y `bucket = width / n` en SQL (`date_trunc` o un `width_bucket`) evita
  mandar de más.
- **Qué pasa sin histórico.** Hoy casi ninguna carta tiene más de unos días de
  historial, así que el caso dominante sería "una línea y un mensaje", que es
  exactamente el estado que `change: null` ya expresa.
- **Qué variante.** Un `price-history` por carta tiene que resolver `market ??
  mid` con la misma precedencia de `change`, o el sparkline y la píldora van a
  contar historias distintas sobre el mismo número.
