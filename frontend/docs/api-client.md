# Cliente HTTP, tokens y sesión

`lib/api/` es la única puerta de salida hacia el backend. Ningún componente hace
`fetch` a mano salvo donde hace falta streaming/SSR sin auth
(`/buscar`, `/carta/[id]`, `/share/[slug]`).

| Archivo | Qué exporta |
|---|---|
| `api-client.ts` | `apiFetch`, `ApiError`, `getApiBaseUrl`, `buildQueryString`, `refreshSession` |
| `token-storage.ts` | `getAccessToken`, `setTokens`, `clearTokens`, `hasSession` |
| `auth.ts` | `register`, `login`, `logout`, `getMe`, `refreshSessionTokens` |
| `cards.ts` | `searchCards`, `getCard`, `getCardPrices`, `getSets`, `buildCardsSearchPath` |
| `comparison.ts` | `getCardComparison`, `getCollectionComparison` y validación estricta de DTOs |
| `collections.ts` | `listCollections`, `getCollection`, `createCollection`, `updateCollection`, `deleteCollection`, `listItems`, `addItem`, `getDuplicates`, `getStats`, `updateItem`, `deleteItem` |
| `share.ts` | `listShareLinks`, `createShareLink`, `updateShareLink`, `revokeShareLink`, `getPublicCollection` |
| `currency.ts` | `getUsdArsRate`, `updateCurrencyPreference`, `buildUsdArsPath`, `isRateType`, `RATE_TYPES`, `PREFERRED_CURRENCIES`, `DEFAULT_RATE_TYPE` |
| `visual-identify.ts` | `identifyVisual` |
| `index.ts` | Barrel: reexporta todo lo de arriba |

> Todo se importa por el barrel (`@/lib/api`) salvo `share.ts`, `currency.ts` y
> `collections.ts`, que tienen tipos propios que se importan del módulo directo.

La comparación pasa por `apiFetch` con `AbortSignal` y `cache: 'no-store'`. Solo
la ficha es pública (`skipAuth`); colección y portafolio usan la sesión activa.
Contrato y semántica visual: [`comparison.md`](comparison.md).

---

## `api-client.ts`

### La base

```ts
const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '') ?? 'http://localhost:3001/api';
```

La base pública se fija durante el build cuando Next reemplaza `NEXT_PUBLIC_*`.
`replace(/\/+$/, '')` evita una barra doble cuando la env termina en `/`.

> `NEXT_PUBLIC_*` se embebe en el bundle **en build**. Cambiarla en runtime no
> tiene efecto: hay que rebuildar. En el `Dockerfile` es un `ARG`.

`getApiBaseUrl()` elige la base según el runtime:

| Runtime | Base |
|---|---|
| Browser (todos los entornos) | `NEXT_PUBLIC_API_URL` (por ejemplo `/api`) |
| Server development | `DEV_API_PROXY_TARGET`, o el fallback público |
| Server production | `API_INTERNAL_URL`, o el fallback público si no está configurada |

`API_INTERNAL_URL` es una env privada del proceso Node. Debe contener la base
completa, incluido `/api`; por ejemplo `http://backend:3001/api`. Se consulta al
llamar `getApiBaseUrl()`, no al importar el módulo, y se normalizan sus barras
finales. El browser siempre ignora esa variable y conserva el origen público.
El resolver concatena rutas que ya parten de esa base; no agrega otro `/api`.
Ausente o vacía, la env privada conserva el fallback anterior: con una base
pública relativa `/api`, ese fallback solo no alcanza para SSR en Node. INF-02
debe configurar `API_INTERNAL_URL` al arrancar el servidor de producción.
Next documenta que las env sin prefijo `NEXT_PUBLIC_` solo están disponibles en
Node; las variables `NEXT_PUBLIC_*` se insertan en el bundle al hacer build.

El valor privado habilita que los Server Components consulten el backend por la
red interna durante production SSR. La confirmación con imagen final, fixtures
reales de `/share/<slug>` y `/carta/<id>`, y búsqueda del hostname privado en el
bundle queda a cargo del gate INF-02; los tests unitarios del cliente no prueban
esa integración.

En `pnpm run dev:lan`, el browser usa `/api` mediante un proxy HTTPS de Next.
`getApiBaseUrl()` devuelve `DEV_API_PROXY_TARGET` en el server y solo en desarrollo,
para que los Server Components sigan usando una URL absoluta. Ver
[red local](../../docs/local-network.md).

### `ApiError`

```ts
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { ... }
}
```

Todas las pantallas hacen `error instanceof ApiError ? error.message : 'fallback en
español'`. El `status` se usa para decidir el mensaje: 401/400 en login,
409 (email duplicado) en registro, 404 en `getCollection`.

### `apiFetch<T>(path, options)`

```ts
export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  isRetry?: boolean;   // uso interno: corta el loop de refresh
  skipAuth?: boolean;  // no adjunta Authorization ni dispara refresh ante un 401
}
```

Flujo:

1. `execute()` arma los headers: `Content-Type: application/json` si hay `body`,
   `Authorization: Bearer …` si hay access token **y no** `skipAuth`. Un `body` que
   ya sea string se pasa tal cual, si no se `JSON.stringify`. Todos los pedidos
   usan `credentials: include`; auth agrega `X-Session-Request: 1`.
2. Si la respuesta es `401` y no es un reintento y no es `skipAuth`:
   - si hay pista de sesión → `refreshSession()`; si volvió bien, se reintenta **una**
     vez con `isRetry: true`;
   - si el refresh falló → `clearTokens()` + `redirectToLogin()`;
   - si no había pista de sesión, tira `ApiError(401, …)` con el mensaje del backend.
3. Si no es `ok` → `ApiError(response.status, extractErrorMessage(...))`.
4. `parseBody<T>()`: `204`/`205` y cuerpo vacío devuelven `undefined`; si el JSON
   no parsea devuelve el texto crudo (así un error HTML de un proxy no se pierde
   en silencio).

`requestPasswordRecovery()` y `recoverPassword()` usan `recoveryFetch()`: un único
POST con cookie y `X-Session-Request`, sin bearer, refresh ni replay. Fijan
`redirect: 'error'` y `cache: 'no-store'`: una redirección tampoco reenvía el body.
La solicitud exige HTTP 202 y `{ message: string }`; acredita recepción, no entrega.
El cambio exige HTTP 200 y exactamente `{ success: true }`. Cualquier otro shape,
status o resultado de red deja incertidumbre sin limpiar la sesión ni repetir POST.
Los pares status/código conocidos se allowlistan, los campos usan copy local seguro
y `safeRetryAfter` sólo admite segundos enteros positivos seguros. Nunca se propaga
el mensaje arbitrario del servidor en estos errores.

Login, registro, logout, reset y refresh usan `session-mutations.ts`: cola por pestaña
y Web Lock `pcs.session-mutation` cuando está disponible. Sin Web Locks sólo hay
serialización local. No hay locks anidados ni imports circulares. El refresh relee
la generación al entrar en la cola/lock; `apiFetch` la relee después de esperarlo,
antes de reintentar o navegar. La generación es local a la pestaña.
El callback de limpieza del reset corre únicamente tras éxito confirmado, dentro
de la cola, antes de liberar al login siguiente. El provider cerca bootstrap,
refreshUser y login/register/logout tardíos; toma el inicio efectivo de la mutación
cuando entra en la cola, para permitir una sesión nueva posterior al reset.

`buildQueryString(params)` arma el query string saltando `null`, `undefined`,
strings vacíos, `NaN`/`Infinity` e incluye booleanos. Sirve para no mandar
`?q=&page=NaN`.

### El formato `message` del ValidationPipe

El backend corre un `ValidationPipe({ whitelist: true, transform: true })` global, y
Nest devuelve los errores de `class-validator` como **array de strings**:

```json
{ "statusCode": 400, "message": ["lines must contain not more than 60 elements"], "error": "Bad Request" }
```

`extractErrorMessage` lo aplana, y ese es el orden de preferencia:

```ts
const raw = body?.message;
if (Array.isArray(raw)) return raw.join(', ');              // ← caso del ValidationPipe
if (typeof raw === 'string' && raw.length > 0) return raw;
if (typeof body?.error === 'string' && body.error.length > 0) return body.error;
return `Request failed with status ${status}`;
```

### El single-flight del refresh

`refreshSession()` conserva una promesa por pestaña; otras llamadas esperan
la misma renovación de su generación. Comparte la cola y el Web Lock de
las mutaciones de sesión; una generación distinta no se une al vuelo viejo.
El backend conserva la protección contra reutilización del refresh actual.

El refresh usa `fetch` directo, `credentials: include`,
`X-Session-Request: 1` y un body vacío. El token lo envía automáticamente el
browser por cookie HttpOnly; no pasa por JavaScript. Una respuesta exitosa
contiene únicamente `accessToken` y `user`. Un rechazo borra la pista local;
un fallo de red devuelve null. El reintento de `apiFetch` sigue limitado a uno.

`redirectToLogin()` mantiene la navegación dura para vaciar el estado de React,
con un guard para no redirigir si ya estamos en `/login`.

### `skipAuth`

Tres endpoints lo usan, y por los tres motivos distintos:

| Endpoint | Por qué `skipAuth` |
|---|---|
| `POST /auth/login` | No hay token todavía; y un 401 acá significa "credenciales malas", no "sesión vencida". Sin `skipAuth`, un login fallido dispararía un refresh y redirigiría a `/login` (donde ya estás). |
| `POST /auth/register` | Igual que login. |
| `POST /auth/logout` | Puede no haber access token válido, y logout tiene que funcionar **siempre**. Además el logout manda un body vacío y el browser adjunta la cookie. |
| `GET /currency/usd-ars` | Es público; mandarle un token vencido solo genera un refresh inútil. |
| `GET /s/:slug` (`getPublicCollection`) | Ruta pública. Mandar el token de otra persona a un endpoint público no suma nada. |

---

## `token-storage.ts` — dónde vive cada token

| Dato | Dónde | Por qué |
|---|---|---|
| `accessToken` | Memoria de la pestaña | Vive poco (15 min); no se persiste en storage. |
| `refreshToken` | Cookie HttpOnly del backend | JavaScript no lo recibe ni lo lee. |
| pista de sesión | `localStorage` (`pcs.hasSession`) | Permite decidir si intentar recuperar la sesión al arrancar. |

`setTokens(access)` guarda el access token en memoria y la pista de sesión.
`hasSession()` consulta la pista o el token en memoria. Al recargar,
`getMe()` recibe 401 y renueva mediante la cookie. `clearTokens()` borra
ambos. Todas las operaciones de storage están en try/catch para modo privado.
La migración elimina `pcs.refreshToken` de localStorage y `pcs.accessToken`
de sessionStorage. Las sesiones anteriores requieren volver a iniciar sesión.

---

## `auth.ts`

`register` y `login` usan `skipAuth` y guardan únicamente
`data.accessToken`. `AuthResponseDto` tiene `accessToken` y `user`;
el servidor envía el refresh como cookie HttpOnly fuera del JSON.

`logout` siempre manda `POST /auth/logout` con body vacío y cookies, incluso
sin access token, para revocar la sesión y borrar la cookie. En finally
limpia la memoria y la pista local aunque falle la red. `getMe()` conserva
Bearer; `refreshSessionTokens()` es un alias de `refreshSession()`.

Todos los POST de auth usan `X-Session-Request: 1`, que fuerza preflight.
La API admite únicamente los orígenes propios. Frontend y API deben
compartir sitio HTTPS para la cookie SameSite=Lax. Consultá
[seguridad](../../docs/security.md) para producción y CSRF.

---

## `cards.ts`

```ts
// Los tres viven en @/types/api (contrato duplicado a mano con los DTs del
// backend) y se re-exportan acá.
export type CardSearchField = 'name' | 'number' | 'artist';
export type CardSortDirection = 'asc' | 'desc';
export interface CardSearchParams {
  q?; searchBy?: CardSearchField; setId?; rarity?; supertype?; type?;
  page?; pageSize?; sort?: CardSort; direction?: CardSortDirection;
}
export interface CardWithPricesDto { card: CardDto; prices: PriceDto[]; }
```

`searchBy` elige contra qué campo matchea `q` (default `name`): los modos
`name` y `artist` son texto con trigram, y `number` es **igualdad** (`?q=4`
devuelve las 163 cartas que se llaman 4, no el 40 ni el 104).

`direction` es el sentido del `sort` y **el backend lo ignora si viene `q`**: con
texto el orden es por score de relevancia, que no es invertible. No lo muestres
habilitado junto a un campo de búsqueda con contenido.

`buildCardsSearchPath` está exportada aparte porque `card-search.tsx` la necesita
para armar la URL de un `fetch` crudo (no usa `apiFetch`: la búsqueda es pública y
no quiere refresh). `getCard` y `getSets` también son públicas en la práctica, pero
van por `apiFetch` igual: el `Authorization` extra no molesta y el manejo de
errores es el mismo.

---

## `collections.ts`

Nueve funciones, todas sobre `apiFetch`. Los payloads:

```ts
export interface CollectionStatsResponse extends CollectionStatsDto {
  cardsMissingPrice?: number;   // solo lo agrega el frontend
}
export interface AddItemPayload {
  cardId: string; variant?: CardVariant; condition?: CardCondition;
  quantity?: number; notes?: string;
}
export interface UpdateItemPayload {
  quantity?; isForTrade?; notes?: string | null; variant?; condition?;
}
```

Todos los `:id` van con `encodeURIComponent`. `notes: null` en el update es
distinto de omitirlo: es lo que permite **borrar** las notas.

`getDuplicates()` existe en el cliente pero **no se usa en ninguna pantalla**: el
filtro de duplicadas de `/colecciones/[id]` va por `listItems({ duplicatesOnly:
true })`, que además pagina. El filtro "para intercambiar" va por
`listItems({ forTradeOnly: true })` y compone con `duplicatesOnly`; no lo
resuelvas filtrando la página en el cliente, porque el `total` y la página
quedan desincronizados.

### Metadata de valuación (BE-04 / FE-03)

Los parsers de colección, portafolio, ficha, historia e items admiten los campos de valuación aditivos. `valuation.amount` es el monto canónico de agregados; `coverage` cuenta copias y `recency` es la evaluación del servidor. Los snapshots históricos llevan `evaluatedAt: null` y `recency: null`, aunque su cobertura corresponda exactamente a ese día. Un bloque nuevo presente se valida completo; si el bloque legacy está ausente, la UI presenta valuación/cobertura/antigüedad como desconocidas y no deriva esos datos de `totalValueUsd`, `valueUsd` o `isStale`.

Cada precio individual conserva `market`, `provider`, `source`, `currency`, `fetchedAt` y metadata temporal opcional. `fetchedAt` registra la consulta, `evaluatedAt` cuándo se clasificó el dato y `upstreamUpdatedAt` la fecha verificable de la fuente. Un cache hit conserva esas fechas. No se llama a la API de precios desde la UI para agregar metadata; la lectura sigue por los métodos existentes de este cliente.

---

## `share.ts`

```ts
export interface ShareLink extends ShareLinkDto {
  collectionName: string | null;
  viewCount: number;
  expiresAt: string | null;
}
export interface PublicSharedCollection extends SharedCollectionDto {
  truncated: boolean;
  sharedAt: string;
}
```

Los tipos base viven en `types/api.ts`; estos dos los extienden **solo para el
cliente**, con un comentario que lo aclara. El backend devuelve más campos de los
que el DTO compartido declara, y la alternativa habría sido ensuciar el contrato
compartido con datos que solo le importan a la vista de perfil.

`getPublicCollection` es la única con `skipAuth` de este módulo.

---

## `currency.ts`

```ts
export type RateType = 'blue' | 'oficial';
export const RATE_TYPES: readonly RateType[] = ['blue', 'oficial'];
export const DEFAULT_RATE_TYPE: RateType = 'blue';
```

`getUsdArsRate()` **nunca tira**:

```ts
try {
  const data = await apiFetch<UsdArsRate>(buildUsdArsPath(type), { skipAuth: true });
  if (!data || typeof data.rate !== 'number' || !Number.isFinite(data.rate)) return null;
  return data;
} catch { return null; }
```

Un 404 significa que el feature flag `CURRENCY_ARS_ENABLED` del backend está
apagado, y cualquier otro error (DolarApi caído, API abajo) tiene que dejar la app
funcionando en USD. `null` significa "no hay conversión disponible"; con eso
`useCurrency` fuerza `effectiveCurrency = 'USD'` aunque la preferencia guardada diga
ARS.

`updateCurrencyPreference` sí tira: es un `PATCH` autenticado, y si falla el
`useCurrency` lo traga y deja la preferencia solo en memoria.

`isRateType(value): value is RateType` es el type guard que evita castear a mano
`user.preferredRateType`, que en el `UserDto` es opcional y `| null`.

---

## `visual-identify.ts`

`identifyVisual({ image }, signal)` hace `POST /cards/identify-visual` con sesión autenticada. Envía el recorte JPEG/PNG/WebP a la API y recibe candidatos, similitudes, verificación geométrica y tiempos. El contrato está en `types/api.ts` y el DTO duplicado del backend. No guarda la foto.

`lib/scanner/camera-visual.ts` selecciona el primer candidato y pide sus precios con `getCardPrices(id, signal)`. La falta de precio no invalida la identidad. Ver [scanner.md](scanner.md).

## Errores: el patrón en cada pantalla

Todas las pantallas client siguen el mismo esqueleto, y el `reloadToken` es el
truco que hace funcionar "Reintentar" sin un estado de reintentos:

```ts
const [status, setStatus] = useState<Status>('loading');
const [errorMessage, setErrorMessage] = useState<string | null>(null);
const [reloadToken, setReloadToken] = useState(0);

useEffect(() => {
  // ... deps: [..., reloadToken]
  setStatus('error');
  setErrorMessage(error instanceof ApiError ? error.message : 'No pudimos cargar X.');
}, [/* ... */, reloadToken]);

// botón
onClick={() => setReloadToken((token) => token + 1)}
```

Aparece en `/colecciones`, `/colecciones/[id]`, `ShareLinksSection`,
`AddToCollectionModal` y `ShareLinkCreator`.

**Nota (deuda menor).** `lib/api/index.ts` reexporta el barrel pero deja afuera
`collections.ts` y `share.ts`: `colecciones/page.tsx` importa
`createCollection, listCollections` de `@/lib/api/collections` y `ShareLinksSection`
importa de `@/lib/api/share`. No es un bug, pero la inconsistencia obliga a
recordar de dónde sale cada cosa.
