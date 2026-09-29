# Cliente HTTP, tokens y sesión

`lib/api/` es la única puerta de salida hacia el backend. Ningún componente hace
`fetch` a mano salvo donde hace falta streaming/SSR sin auth
(`/buscar`, `/carta/[id]`, `/share/[slug]`).

| Archivo | Qué exporta |
|---|---|
| `api-client.ts` | `apiFetch`, `ApiError`, `getApiBaseUrl`, `buildQueryString`, `refreshSession` |
| `token-storage.ts` | `getAccessToken`, `getRefreshToken`, `setTokens`, `clearTokens`, `hasSession` |
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
   ya sea string se pasa tal cual, si no se `JSON.stringify`.
2. Si la respuesta es `401` y no es un reintento y no es `skipAuth`:
   - si hay refresh token → `refreshSession()`; si volvió bien, se reintenta **una**
     vez con `isRetry: true`;
   - si el refresh falló → `clearTokens()` + `redirectToLogin()`;
   - si no había refresh token, tira `ApiError(401, …)` con el mensaje del backend.
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

**Es la parte más crítica del cliente.** El backend detecta el reuso de un refresh
token y **revoca todas las sesiones del usuario**. Dos refresh simultáneos =
sesión perdida.

```ts
let refreshInFlight: Promise<AuthResponseDto | null> | null = null;

export function refreshSession(): Promise<AuthResponseDto | null> {
  if (refreshInFlight) return refreshInFlight;     // ← misma promesa, no otro fetch

  const run = async (): Promise<AuthResponseDto | null> => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return null;
    try {
      const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) { clearTokens(); return null; }
      const data = await parseBody<AuthResponseDto>(response);
      if (!data?.accessToken || !data?.refreshToken) { clearTokens(); return null; }
      setTokens(data.accessToken, data.refreshToken);
      return data;
    } catch {
      return null;
    }
  };

  refreshInFlight = run().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}
```

Cómo funciona:

1. La variable es **a nivel de módulo**, o sea compartida por toda la pestaña.
2. La primera llamada guarda la promesa en `refreshInFlight`. Todas las demás
   reciben **esa misma promesa** y esperan, sin disparar un segundo `POST
   /auth/refresh`.
3. `.finally()` limpia el slot, así el siguiente refresh puede arrancar normal.
4. El `refresh` usa `fetch` crudo, no `apiFetch`: si usara `apiFetch` y el backend
   devolviera 401, se entraría en un loop infinito de refresh.
5. Cualquier fallo (network, 401, respuesta sin tokens) termina en `clearTokens()` y
   `null`, que dispara el `redirectToLogin()` de `apiFetch`.

`redirectToLogin()` usa `window.location.assign('/login')` (no el router) a
propósito: es una navegación **dura**, que además vacía el estado de React. Y
 primero chequea `if (window.location.pathname === '/login') return;` para no
entrar en loop si ya estás ahí.

### `skipAuth`

Tres endpoints lo usan, y por los tres motivos distintos:

| Endpoint | Por qué `skipAuth` |
|---|---|
| `POST /auth/login` | No hay token todavía; y un 401 acá significa "credenciales malas", no "sesión vencida". Sin `skipAuth`, un login fallido dispararía un refresh y redirigiría a `/login` (donde ya estás). |
| `POST /auth/register` | Igual que login. |
| `POST /auth/logout` | Puede no haber access token válido, y logout tiene que funcionar **siempre**. Además el logout manda el `refreshToken` en el body, no en el header. |
| `GET /currency/usd-ars` | Es público; mandarle un token vencido solo genera un refresh inútil. |
| `GET /s/:slug` (`getPublicCollection`) | Ruta pública. Mandar el token de otra persona a un endpoint público no suma nada. |

---

## `token-storage.ts` — dónde vive cada token

| Token | Dónde | Por qué |
|---|---|---|
| `accessToken` | **memoria** (variable de módulo) + `sessionStorage` (`pcs.accessToken`) | Vive poco (15 min). Memoria primero para no tocar el disco en cada request; `sessionStorage` para sobrevivir a un refresh de la página. |
| `refreshToken` | `localStorage` (`pcs.refreshToken`) | Es el de larga duración. Si fuera a `sessionStorage`, cerrar la pestaña cierra la sesión. |
| flag de sesión | `localStorage` (`pcs.hasSession`) | Permite decidir "hay sesión" sin parsear un JWT ni bloquear por un refresh. |

```ts
let accessToken: string | null = null;
let hydrated = false;

function hydrateAccessToken(): void {
  if (hydrated || !isBrowser()) return;
  hydrated = true;
  try { accessToken = window.sessionStorage.getItem(ACCESS_TOKEN_KEY); }
  catch { accessToken = null; }
}
```

Todas las operaciones de storage están envueltas en `try/catch`: en modo privado
Safari el `localStorage.setItem` tira, y el token **igual sigue usable en memoria**
durante la sesión. Un `getRefreshToken()` que devuelva `null` cuando el storage
está bloqueado es el comportamiento esperado, no un bug.

`hasSession()` es un atajo barato:

```ts
export function hasSession(): boolean {
  if (readLocalStorage(HAS_SESSION_KEY) === 'true') return true;
  return getRefreshToken() !== null;
}
```

`AuthProvider` lo usa para decidir si vale la pena pegarle un `GET /users/me` al
arrancar, o si ya sabe que no hay sesión y puede apagar el loading de una.

---

## `auth.ts`

```ts
export interface RegisterPayload {
  email: string; password: string; username: string; displayName: string;
}
```

`register` y `login` hacen el `apiFetch` con `skipAuth: true` y después llaman
`setTokens(data.accessToken, data.refreshToken)` ellas mismas. El guardado de
tokens vive acá y **no** en `apiFetch`, para que un endpoint futuro que devuelva
tokens por otra razón no los pise por accidente.

`logout` manda `POST /auth/logout` con el refresh token en el body y, en un
`finally`, `clearTokens()`: aunque el backend esté caído, los tokens locales se van.

`getMe()` es el único que **sí** usa el token: es lo que define
`isAuthenticated`. `refreshSessionTokens()` es un alias de `refreshSession()` para
no importar `api-client` desde un hook.

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
