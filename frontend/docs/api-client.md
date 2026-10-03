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
| `collections.ts` | `listCollections`, `getCollection`, `createCollection`, `updateCollection`, `deleteCollection`, `listItems`, `addItem`, `getDuplicates`, `getStats`, `updateItem`, `deleteItem` |
| `share.ts` | `listShareLinks`, `createShareLink`, `updateShareLink`, `revokeShareLink`, `getPublicCollection` |
| `currency.ts` | `getUsdArsRate`, `updateCurrencyPreference`, `buildUsdArsPath`, `isRateType`, `RATE_TYPES`, `PREFERRED_CURRENCIES`, `DEFAULT_RATE_TYPE` |
| `identify.ts` | `identifyCard`, `IDENTIFY_PATH`, `IDENTIFY_LIMIT` |
| `index.ts` | Barrel: reexporta todo lo de arriba |

> Todo se importa por el barrel (`@/lib/api`) salvo `share.ts`, `currency.ts` y
> `collections.ts`, que tienen tipos propios que se importan del módulo directo.

---

## `api-client.ts`

### La base

```ts
const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '') ?? 'http://localhost:3001/api';
```

Se evalúa **una vez al cargar el módulo** y el `??` es el fallback de desarrollo.
`replace(/\/+$/, '')` evita el `//api` cuando alguien pone la env con barra final.

> `NEXT_PUBLIC_*` se embebe en el bundle **en build**. Cambiarla en runtime no
> tiene efecto: hay que rebuildar. En el `Dockerfile` es un `ARG`.

`getApiBaseUrl()` la expone para los tres casos de server component / fetch crudo.

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
la misma renovación. Cuando el browser soporta Web Locks también serializa
renovaciones entre pestañas con `pcs.session-refresh`. El backend detecta
reuso y revoca las sesiones, así que esto evita carreras legítimas.

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

## `identify.ts`

```ts
export const IDENTIFY_PATH = '/cards/identify';
export const IDENTIFY_LIMIT = 8;

export async function identifyCard(
  payload: IdentifyRequestDto,
  signal?: AbortSignal,
): Promise<IdentifyResponseDto> {
  return apiFetch<IdentifyResponseDto>(IDENTIFY_PATH, { method: 'POST', body: payload, signal });
}
```

Ver [`scanner.md`](scanner.md#6-post-apicardsidentify--el-backend-matchea) para qué
el `signal` es opcional y por qué `/escanear` no lo usa (usa `withTimeout`).

---

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
