# Rutas y pantallas

Las 13 rutas del frontend: quién las puede ver, si son Server o Client Component,
de dónde sacan los datos y por qué están donde están. El detalle de los
componentes está en [`components.md`](components.md); las reglas de estilo, en
[`design-system.md`](design-system.md); el modo de trabajo, en
[`build-guide.md`](build-guide.md).

**No hay prefijo ni versión.** `/buscar` es `/buscar`: no hay `/v2/buscar`, y no
queda ningún alias. Cuando la app se renombró, la URL pública **no** se movió, así
que no hay dos direcciones para el mismo contenido y ningún `robots: noindex`
haciendo de parche.

> **Disclaimer sobre números de línea**: las referencias apuntan a **archivo +
> símbolo + fragmento de código**, que es lo que no se mueve. Cuando el archivo y el
> símbolo están citados, la afirmación es verificable con un grep.

---

## Índice

| URL | Carpeta | Tipo | Sesión | Raíz (server) | Cuerpo (client) |
|---|---|---|---|---|---|
| `/` | `app/(marketing)/` | Server | no | `page.tsx` | `LandingPage` |
| `/faq` | `app/(marketing)/faq/` | Server | no | `page.tsx` | `FaqSection` |
| `/inicio` | `app/(app)/inicio/` | Server | no | `page.tsx` | `HomeCta`, `ScanSessionResume` |
| `/buscar` | `app/(app)/buscar/` | Server | no | `page.tsx` | `CatalogSearch` |
| `/carta/[id]` | `app/(app)/carta/[id]/` | Server async | no | `page.tsx` | `CardActions`, `CardPriceSection` |
| `/escanear` | `app/(app)/escanear/` | **Client** | no | — (la página es client) | la página entera |
| `/colecciones` | `app/(app)/colecciones/` | Server (finito) | degrada | `page.tsx` | `CollectionsScreen` |
| `/colecciones/[id]` | `app/(app)/colecciones/[id]/` | Server (finito) | **sí**, a mano | `page.tsx` | `CollectionDetailScreen` |
| `/colecciones/[id]/sets` | `app/(app)/colecciones/[id]/sets/` | Server (envoltura) | **sí**, implícito | `page.tsx` | `SetProgressScreen` |
| `/ajustes` | `app/(app)/ajustes/` | Server | **sí** | `page.tsx` | `RequireAuth` + 5 secciones |
| `/login` | `app/(auth)/login/` | Server | no | `page.tsx` | `LoginForm` |
| `/registro` | `app/(auth)/registro/` | Server | no | `page.tsx` | `RegisterForm` |
| `/share/[slug]` | `app/share/[slug]/` | Server async | no | `page.tsx` | ninguno (todo server) |

Además hay rutas que no son pantallas:

| Ruta | Qué es |
|---|---|
| `/perfil` | `app/(app)/perfil/route.ts`, un **308** a `/ajustes`. Ver §7. |
| `/escanear` (metadata) | `app/(app)/escanear/layout.tsx` existe **solo** por el `metadata`. Ver §4. |
| `/robots.txt` · `/sitemap.xml` | Metadata routes para el rastreo SEO; el sitemap lista landing, catálogo y FAQ. |

Los archivos de chrome del árbol, que no son rutas pero se heredan:

| Archivo | Cubre |
|---|---|
| `app/layout.tsx` | **todo**: `<html>`, fuentes, metadata global, el script anti-flash, el skip link y `<Providers>`. |
| `app/providers.tsx` | los cuatro providers de la app entera. |
| `app/(marketing)/layout.tsx` | `/` y `/faq`: `MarketingShell`, sin navegación de la app. |
| `app/(app)/layout.tsx` | las pantallas de la app PWA: `<AppShell>`, con `BottomNav`. |
| `app/(auth)/layout.tsx` | `/login` y `/registro`: `<PlainShell>`, sin nav. |
| `app/share/layout.tsx` | `/share/[slug]`: `<PlainShell>`, sin nav. |
| `app/pwa-sw-register.tsx` | el service worker, solo en producción. |

Y las fronteras: `app/(app)/error.tsx`, `app/(auth)/error.tsx`,
`app/not-found.tsx` y `app/share/[slug]/not-found.tsx`; más los ocho
`loading.tsx` de §6.

---

## 1. Por qué no hay un prefijo de versión

Antes de que existiera este árbol, la app nueva convivía con la anterior bajo
`/v2/*`, porque **Next no permite que dos route groups resuelvan el mismo path**:
`app/(app)/buscar/page.tsx` ya servía `/buscar`, y poner la pantalla nueva en el
mismo lugar es un conflicto de build, no un override. Lo único que se podía hacer
es cambiar la URL de una de las dos, y cambiar la de la que estaba en producción
significaba romper los links de `manifest.json`, del service worker y de todos los
que se habían compartido.

Hoy **no hay dos versiones que colisionen**, así que el prefijo no tiene razón de
ser: `/buscar` es la pantalla nueva y nada más. `components/nav.ts` no tiene
constante de base — los `href` de `NAV_ITEMS` son absolutos — así que agregar una
pantalla es agregar un `page.tsx`, no editar una lista de prefijos.

El corollary que queda: **una URL no se renombra sin motivo.** `/perfil` →
`/ajustes` es el único rename, y lleva un 308 (§7).

---

## 2. Las cuatro ramas, y por qué son carpetas y no route groups

Esta es la parte del árbol que más fácil se equivoca, así que va con el
razonamiento completo.

```
app/
  layout.tsx              ← raíz: providers, skip link, metadata, script anti-flash
  providers.tsx           ← ThemeProvider · AuthProvider · CurrencyProvider · ToastProvider
  not-found.tsx
  (marketing)/            ← RAMA 1: landing pública, sin BottomNav
    layout.tsx            ← <MarketingShell>
    page.tsx               ← /
    faq/page.tsx           ← /faq
  (app)/                  ← RAMA 2: app con BottomNav
    layout.tsx            ← <AppShell>
    inicio/page.tsx       ← /inicio, start_url de la PWA
    buscar/  carta/  escanear/  colecciones/  ajustes/
  (auth)/                 ← RAMA 3: sin BottomNav
    layout.tsx            ← <PlainShell>
    error.tsx
    login/  registro/
  share/                  ← RAMA 4: sin BottomNav
    layout.tsx            ← <PlainShell>
    [slug]/
```

| Rama | Carpeta | ¿Lleva `BottomNav`? | Shell |
|---|---|---|---|
| 1 | `app/(marketing)/` | no | `MarketingShell` |
| 2 | `app/(app)/` | **sí** | `AppShell` |
| 3 | `app/(auth)/` | no | `PlainShell` |
| 4 | `app/share/` | no | `PlainShell` |

`(marketing)`, `(app)` y `(auth)` son route groups: el nombre entre paréntesis **no forma parte
de la URL`**, sirve para compartir un layout entre rutas hermanas, y nada más.
`share/` **no** es un route group: es una carpeta común, y es una carpeta a secas
porque no comparte layout con nadie.

### El mecanismo: Next compone los layouts hacia arriba

Un route group nombra hermanos, pero **no corta la herencia hacia arriba**. Si la
ruta pública estuviera en `app/(app)/(public)/share/[slug]/page.tsx`, seguiría
teniendo `app/(app)/layout.tsx` como ancestro y, por lo tanto, seguiría viendo la
`BottomNav`. Compila, `next dev` no protesta, y el bug aparece en pantalla. Ese
razonamiento es [`gotchas.md`](gotchas.md) §17, y es la razón por la que las cuatro
ramas son carpetas hermanas y no subcarpetas de una.

La forma de verificarlo sin debate: en `.next/types/routes.d.ts`, `LayoutRoutes`
lista los **layout roots** del árbol, y un route group anidado no aparece ahí
porque no es una ruta.

### Por qué `/share/[slug]` no puede tener la `BottomNav`

La `BottomNav` manda a inicio, buscar, escanear, colecciones y ajustes: pantallas de
**tu** cuenta. Arriba de la colección de otra persona es un convite a dejar de
mirarla, y en el peor caso (el visitante no tiene cuenta) el chrome de tu cuenta no
debería existir. El JSDoc de `app/share/layout.tsx` lo dice sin rodeos.

El `OfflineToast` va en las ramas de la app y en la vista compartida: la lectura de
una colección compartida funciona sin conexión y el visitante tiene que enterarse
de por qué. El sitio de marketing no muestra chrome de la app.

### Por qué `/login` y `/registro` tampoco

Mismo argumento con una diferencia: la colección ajena es de otro, y estas
pantallas son tuyas, pero el efecto en pantalla es el mismo. Peor: **los cuatro**
destinos de la nav empujan a otra pantalla en el momento exacto en que el usuario
está por confirmar su email.

Por qué no alcanza con ocultar la nav con un condicional sobre la ruta: la nav no
tiene que saber que existe el login, y la página de auth no debería conocer la
estructura de la nav. La separación por árbol lo resuelve sin que ninguno de los
dos se entere del otro.

### `/` es marketing; `/inicio` sí lleva `BottomNav`

La landing pública vive en `(marketing)` para que el producto tenga una página de
adquisición y una FAQ indexables, separadas del flujo instalado. La PWA arranca en
`/inicio` (el `start_url` de `manifest.json`), que vive en `(app)` y hereda
`BottomNav`. El sitio de marketing no debe dejar a un visitante nuevo dentro del
chrome de la app antes de entender qué ofrece.

### Por qué los providers están en el layout raíz y no en cada rama

`ThemeProvider`, `AuthProvider`, `CurrencyProvider` y `ToastProvider` se montan
**una sola vez**, en `app/providers.tsx`, que envuelve todo el árbol desde
`app/layout.tsx`. Los layouts de rama solo pintan el canvas y deciden si hay
`BottomNav`.

Tres razones, y las tres importan:

1. **Son de la app, no de un tipo de pantalla.** El tema y la moneda son
   preferencias del usuario, no de la vista de auth. Montarlos por rama los
   duplicaría.
2. **Remontar un provider pierde el estado.** Si el tema y la moneda vivieran en
   los layouts de rama, cada navegación entre ramas los desmontaría y los volvería
   a crear desde cero — la preferencia de moneda y la clase `dark` del `<html>`
   parpadearían. El JSDoc de `AppShell` lo dice: *"el estado de la moneda y del tema
   se perdería al navegar"*.
3. **El skip link también va arriba.** Con la `BottomNav` fija y veinte cartas en
   grilla, el teclado no puede tener que atravesar diez controles para llegar al
   contenido, y eso es un problema de la app entera, no de una rama.

El mismo razonamiento es el que Justifica que haya **dos** shells y no uno con una
prop `nav`: ver [`components.md`](components.md) §2.1.

---

## 3. Server vs Client por ruta

El criterio es textual: **`'use client'` solo si el componente necesita estado,
efectos o handlers.**

Y el criterio de por qué importa tanto: **un Server Component no puede importar
un módulo client**, así que poner la directiva de más **acorta el grafo entero**.
`ThemeProvider` y `ToastProvider` son client: un `'use client'` en un layout de
rama los metería en el bundle de toda esa rama, y no hay forma de colgar un
`Toast` de un componente server que importa un provider client.

### Las server, y por qué

| Ruta | Por qué server |
|---|---|
| `/` | Landing pública server-rendered con hero, vista previa de cartas, beneficios, planes y FAQ. La vista previa consulta 3 cartas al backend local. |
| `/faq` | Preguntas frecuentes server-rendered, compartidas con la sección FAQ de la landing. |
| `/inicio` | Inicio de la PWA; el server renderiza hero, features y preview. CTA y reanudación son client components pequeños. |
| `/buscar` | *"Lo único que necesita el servidor es el chrome —el `ScreenHeader` y el `ScreenContainer`, que son puros— y la pantalla es toda de `useSearchParams`, así que el primer render no tiene nada que pedir ni nada que esperar: los datos salen del catálogo espejado y del caché de la API, no del render."* |
| `/carta/[id]` | Hace el `fetch` de la carta, el de los precios y el de "otras de este set", arma `generateMetadata` y renderiza `next/image` con `priority`. |
| `/colecciones` | *"Server Component, pero finito: no pide datos ni calcula nada."* El trabajo está en el cuerpo client. |
| `/colecciones/[id]` | Solo desenvuelve el `params` (que es una `Promise` en Next 16) y pasa el id. |
| `/colecciones/[id]/sets` | Solo arma el `Suspense`. |
| `/ajustes` | Solo metadata + chrome. El guard de sesión es client. |
| `/login`, `/registro` | *"La pantalla no pide datos: el único estado es el del submit, que vive en `LoginForm`."* |
| `/share/[slug]` | Hace el `fetch`, arma `generateMetadata` con `cache()` de React y es una landing de solo lectura. |

### La única client: `/escanear`

Es la pantalla más grande y la única con `'use client'` en el `page.tsx`. La
razón es que la máquina de estados (`idle | camera | processing | results |
organizing | error`) **es** el componente: vive en la página, no en un hijo, porque
cada estado decide qué se monta (cámara, panel de reposo, sheet, error) y cómo
cada hijo se le pasa. Partirla en un server y un `ScannerScreen` client obligaría a
cruzar el `stage` por props de una forma que no aporta nada.

`/colecciones/[id]/sets` también tiene su pantalla entera en client
(`SetProgressScreen`), pero la `page.tsx` sigue siendo server: es una envoltura
thin de un `Suspense`. La distinción es que la ruta **necesita** la frontera (por
`useSearchParams`) pero no necesita que la página sea client.

### El `Suspense` no es decorativo

Dos rutas lo necesitan y en las dos es por `useSearchParams()`:
`/buscar` y `/colecciones/[id]/sets`. Sin la frontera, Next no puede decidir en
el server qué HTML mandar y obliga a renderizar la página entera en el cliente. Los
JSDoc lo dicen en las dos.

El `fallback` es **el mismo componente** que usa `loading.tsx` (`SearchFallback` y
`SetProgressFallback` respectivamente), no una copia. La razón, textual y repetida
en los ocho `loading.tsx`: *"dos versiones del mismo skeleton que no coinciden son
un salto de layout esperando a aparecer"*.

### La URL de `/buscar` es el contrato de la pantalla

`CatalogSearch` no guarda filtros en el estado: `q`, `searchBy`, `setId`,
`rarity`, `sort`, `direction` y `page` salen de `useSearchParams`. Un link
reproduce la pantalla exacta y el botón atrás deshace un cambio de filtro sin
pila de estado.

| Param | Valores | Default |
|---|---|---|
| `q` | texto libre | ausente |
| `searchBy` | `name` · `number` · `artist` | `name` (no se escribe) |
| `setId` | id de set | ausente |
| `rarity` | rareza | ausente |
| `sort` | `name` · `price` · `rarity` · `number` | `name` (no se escribe) |
| `direction` | `asc` · `desc` | `asc` (no se escribe) |
| `page` | entero ≥ 1 | `1` |

`name` y `asc` no se escriben por default para que la URL que se comparte siga
siendo corta: `/buscar?q=charizard` es la que uno manda por WhatsApp.

**`sort` y `direction` se ignoran cuando hay `q`**, porque el backend ordena por
score de relevancia, que no es invertible. La UI lo refleja deshabilitando ambos
controles y explicándolo; mandarlos igual mantiene la URL y la pantalla
coherentes entre sí.

---

## 4. `escanear/layout.tsx` — un layout que solo aporta metadata

`app/(app)/escanear/page.tsx` es `'use client'` —la cámara, el reconocimiento visual y la máquina de
estados no se pueden renderizar en el servidor— y un Client Component **no puede
exportar `metadata`**. La salida idiomática es un layout hermano que aporta el
título y devuelve los hijos sin tocarlos: `page.tsx` sigue siendo enteramente
cliente y la ruta no gana ni un request.

Es el mismo patrón que ya usaba la app anterior en su propia ruta de escaneo. Y
es la razón por la que el nombre de la carpeta aparece dos veces en el árbol: no es
un error de tipeo.

---

## 5. Qué rutas requieren sesión

**Ninguna bloquea el acceso en el server.** La sesión vive en el navegador
(`sessionStorage`), así que el server no sabe si hay token. El patrón es el
contrario del que uno esperaría: la ruta renderiza siempre y el componente cliente
decide.

- **`/ajustes`** es la única con un guard dedicado: `RequireAuth` hace
  `router.replace('/login')` cuando `isLoading` ya terminó y
  `isAuthenticated === false`, y devuelve `null` mientras tanto. Mientras carga,
  un `Skeleton` con `role="status"`.
- **`/colecciones/[id]`** no tiene guard dedicado, pero hace lo mismo a mano:
  sin sesión renderiza un `EmptyState` con CTA a `/login`
  (`!isAuthLoading && !isAuthenticated`), y no dispara ningún fetch — el
  `useAsync` corta antes.
- **`/colecciones`** distingue **cuatro** estados en vez de tres: `loading` ·
  `error` · **no autenticado** · vacío · listo. El `IconButton` de "Nueva
  colección" en el header **no se renderiza** sin sesión (no sale `disabled`, no
  existe), y el estado vacío tiene su propio copy, porque "no hay nada que crear
  todavía" y "tenés que explicar para qué sirve una colección" son dos mensajes
  distintos.
- **`/colecciones/[id]/sets`** consulta la sesión con `useAuth` y, sin sesión,
  muestra un `EmptyState` con "Iniciá sesión para ver el progreso" y un CTA a
  `/login`. Antes no lo hacía: disparaba el `getProgress`, el 401 caía en el
  `ErrorState` y la pantalla decía "no pudimos cargar el progreso" con un botón
  de **Reintentar** que no iba a cambiar nada. Un 401 no es un error, es un
  estado esperado, y el mensaje tiene que ofrecer la salida.
- **`/carta/[id]`** es pública, pero `CardActions` pide datos de sesión: sin
  sesión no renderiza los chips "Añadir" e "Intercambio", y en su lugar pone una
  línea con un link a `/login` que explica qué hacer. El razonamiento está en el
  JSDoc: *"un chip deshabilitado sin explicación es un mueble"*.
- **`/`, `/faq`, `/buscar`, `/escanear` y `/share/[slug]`** son públicas por diseño.
  `/escanear` toca endpoints que exigen sesión, pero recién cuando el usuario pide
  guardar.
- **`/inicio`** es la pantalla de arranque de la PWA instalada (`manifest.json`
  `start_url`), aunque la landing pública está en `/`.
- **`/login` y `/registro`** son públicas y no tienen guard.

---

## 6. `title`, `loading.tsx`, `error.tsx` y `not-found.tsx`

### `title` por ruta

El layout raíz declara `title: { default: 'PokéScan', template: '%s · PokéScan' }`,
así que toda pantalla con título propio hereda el sufijo.

| URL | `title` | Fuente | `description` |
|---|---|---|---|
| raíz (`app/layout.tsx`) | `PokéScan` (default + template) | `layout.tsx` | sí |
| `/` | `PokéScan — tu colección Pokémon, más clara` | `(marketing)/page.tsx` | sí, + Open Graph |
| `/faq` | `Preguntas frecuentes` | `(marketing)/faq/page.tsx` | sí |
| `/inicio` | `Inicio · PokéScan` | `(app)/inicio/page.tsx` | sí, `noindex` |
| `/buscar` | `Buscar` | `page.tsx` | sí |
| `/carta/[id]` | `{card.name}` o `'Carta no encontrada'` | `generateMetadata` | sí, + `openGraph` |
| `/colecciones` | `Colecciones` | `page.tsx` | sí |
| `/colecciones/[id]` | `Colección` | `page.tsx` (estático) | sí |
| `/colecciones/[id]/sets` | `Progreso por set` | `page.tsx` | sí |
| `/escanear` | `Escanear` | `escanear/layout.tsx` | sí |
| `/ajustes` | `Ajustes` | `page.tsx` | sí |
| `/share/[slug]` | `'{collectionName} · {ownerDisplayName}'` o `'Colección compartida'` | `generateMetadata` | sí, + `openGraph` |
| `/login` | `Iniciar sesión` | `page.tsx` | sí |
| `/registro` | `Crear cuenta` | `page.tsx` | sí |

Dos detalles que no se deducen de la tabla:

- **`/` es la landing pública** y tiene su título orientado a adquisición; `/inicio`
  es el destino separado de la PWA instalada.
- **`/colecciones/[id]` tiene `metadata` estático y no `generateMetadata`**, a
  diferencia de `/carta/[id]`: el nombre de la colección no se conoce en el server.
  El JSDoc de la página lo dice.

**`generateMetadata` solo en las dos rutas con datos del server**, y las dos
reparten el mismo `fetch` entre la página y el metadata (§7).

Las rutas privadas de la app tienen `noindex`; la landing, el catálogo y la FAQ
son públicas. Los links `/share/[slug]` también devuelven `noindex`: son públicos
para quien recibió el enlace, pero eso no implica que el dueño quiera que Google
los catalogue. El `title`, la descripción y Open Graph siguen generándose para
WhatsApp/iMessage; los crawlers sociales pueden leerlos sin indexar la colección.

### Las fronteras

| Archivo | Qué hace |
|---|---|
| `app/(app)/error.tsx` | `ErrorState` + `reset()` + "Volver al catálogo" + el `digest` en un `<details>`. Client. Repite el shell `min-h-dvh bg-canvas` porque hereda el de su layout. |
| `app/(auth)/error.tsx` | El mismo `ErrorState`, con salida a la **home** en vez del catálogo, y **sin** el `min-h-dvh` porque el layout del grupo ya lo monta. Existe porque Next resuelve `error.tsx` por segmento: el de `(app)` no cubre esta rama. |
| `app/not-found.tsx` | `EmptyState kind="first-use"` + "Ir al catálogo". Cubre todo lo que no tiene 404 propia. |
| `app/share/[slug]/not-found.tsx` | Copy propio: un enlace revocado o vencido es un caso de negocio, no una URL mal tipeada. |

Los ocho `loading.tsx` tienen **la forma real del contenido** (§9.1), no una
aproximada. El caso extremo es `app/(app)/carta/[id]/loading.tsx`, que es un
esqueleto de la ficha completa: la imagen, el panel del precio con su cifra, la
fila de administración, la de chips, siete filas de `dl` y el scroller de "otras de
este set". El motivo: *"un bloque genérico de líneas hace que la pantalla salte de
alto cuando entra el contenido, que es exactamente lo que un skeleton tiene que
evitar"*.

Cuatro de los ocho **comparten el componente** con el `fallback` del `Suspense` o
con el estado `loading` del cuerpo client, en vez de duplicar el esqueleto:
`buscar/loading.tsx` usa `SearchFallback`, `colecciones/loading.tsx` y
`colecciones/[id]/loading.tsx` usan `CollectionsListSkeleton` y
`CollectionDetailSkeleton`, y `colecciones/[id]/sets/loading.tsx` usa
`SetProgressFallback`. Los otros cuatro (`/carta/[id]`, `/escanear`, `/ajustes` y
`/share/[slug]`) dibujan su forma local, y en los tres primeros es porque no hay un
`Suspense` que los tenga que cubrir con el mismo componente.

---

## 7. `/perfil` → `/ajustes`

`app/(app)/perfil/route.ts` exporta un `GET` que llama a `permanentRedirect` con
`NAV_ITEMS[NAV_ITEMS.length - 1].href` — el último ítem de la nav, que es
`/ajustes`.

Tres cosas de ese archivo, textual de su JSDoc:

- **El rename de la ruta llegó tarde, la del label no.** La pantalla se llama
  "Ajustes" desde que tiene el toggle de tema y la configuración de moneda, y la
  tab de abajo ya decía "Ajustes": la ruta era el único lugar del producto que
  seguía diciendo "perfil".
- **308, no 302.** *"La respuesta es permanente y el cliente tiene que cachearla.
  Con un 302, cada visita a `/perfil` paga un round-trip y Google nunca consolida
  las dos URLs."*
- **El destino sale de `nav.ts`, no de una cadena.** Un segundo cambio de nombre
  no puede dejar el redirect apuntando a algo viejo.

### `/escanear` es metadata, no una ruta

Ver §4. No figura en la tabla de §6 porque no produce una URL distinta.

---

## 8. Cómo traen los datos, y con qué caché

| Ruta | Cómo | Caché | Timeout |
|---|---|---|---|
| `/` | `fetch` en el server, `fetchPreviewCards()` | `next: { revalidate: 3600 }` | — |
| `/inicio` | `fetch` en el server, `fetchPreviewCards()` | `next: { revalidate: 3600 }` | — |
| `/buscar` | `useAsync` + `useInfiniteList` desde el cliente (`searchCards`, `getSets`) | ninguna | `AbortSignal` de `apiFetch` |
| `/carta/[id]` — carta | `fetch` en el server | `next: { revalidate: 3600 }` (`REVALIDATE`) | — |
| `/carta/[id]` — **precios** | `getCardPrices()` en `CardPriceSection` al hidratar | caché Redis/Postgres del backend | estado de carga propio; no bloquea SSR |
| `/carta/[id]` — otras del set | Server Component bajo `Suspense` | `next: { revalidate: 3600 }` | fallback vacío; no bloquea la ficha |
| `/colecciones*` | `lib/api/*` desde el cliente | ninguna | `AbortSignal` de `apiFetch` |
| `/escanear` | `identifyVisual` desde el cliente | ninguna | AbortSignal con 35 s para reconocer y 5 s para precio |
| `/ajustes` | `lib/api/*` desde el cliente | ninguna | `AbortSignal` de `apiFetch` |
| `/share/[slug]` | `fetch` en el server con **`cache()` de React** | `next: { revalidate: 60 }` | — |

### Frescura de precio y render de la ficha

La frescura del precio **la decide el backend** (Redis 1 h + Postgres 24 h). La
página server no solicita el precio: `CardPriceSection` consulta al hidratar y
muestra su propio skeleton. Así una consulta que entra a la cola de la fuente no
retiene el nombre, la imagen ni los datos estáticos de la carta.

Los precios no pasan por caché de Next; las cartas y sets sí usan `REVALIDATE =
3600`. `fetchRelated` también está bajo una frontera `Suspense`: es contenido
complementario y no tiene que demorar la ficha si el API responde lento. Pide
`RELATED_LIMIT + 1 = 15` cartas para poder cortar una (la propia) sin quedarse a
corto.

### Por qué `cache()` de React en la ruta pública

```ts
const fetchSharedCollection = cache(async (slug: string): Promise<FetchResult> => { … });
```

*"`cache()` de React deduplica el `fetch` entre la página y `generateMetadata`:
sin esto, cada render de la ruta hace **dos** requests al backend público."*

`revalidate: 60` es el mismo número desde siempre, con el argumento del JSDoc: *"el
backend ya cachea `/s/:slug` en Redis y el dato cambia recién cuando el dueño edita
la colección o cuando alguien la mira, así que bajar de 60 s no aporta nada y sube
la carga de la ruta pública, que es la que más tráfico tiene"*.

El resultado de `fetchSharedCollection` es una unión de tres casos —
`{ kind: 'ok' }` / `{ kind: 'missing' }` / `{ kind: 'error' }` — y esa distinción es
lo que permite que la página elija entre `notFound()`, el `ErrorState` y el render
normal. `410` también es `missing`: *"hoy el backend devuelve 404 para revocado y
vencido, pero si mañana los distingue, la 410 tiene que seguir significando 'no va
a volver'"*.

### `fetchPreviewCards` nunca tira

`/` pide 3 cartas al backend con `revalidate: 3600` y devuelve `[]` ante cualquier
falla. El motivo está en el JSDoc: *"el mock es decorativo: si el backend está
caído, la home tiene que seguir mostrando el hero, los CTA y las features, que es
todo lo que el usuario vino a hacer"*. Un `throw` mandaría la pantalla entera al
`error.tsx` por tres imágenes.

`3600` es aceptable **porque `/cards/search` lee la tabla local** de Postgres, no
la fuente: *"por eso puede ir en el server sin tocar el rate limit — lo que no
podría ir en el server es un precio, que sí sale a la fuente"*.

### El rate limit, de paso

`/escanear` consulta el índice local de la API con `identifyVisual`; no escribe en la fuente externa. Tiene dos frenos locales: `AUTO_IDENTIFY_INTERVAL_MS = 2500`
entre capturas **automáticas** (el obturador manual no espera) y el `busy` de la
pantalla, que apaga el obturador mientras hay un escaneo en vuelo, así que nunca
hay dos `identify` en paralelo. El chip de precio flotante **no pide nada**: lee
el precio ya consultado para el ID visual elegido.

---

## 9. La limitación conocida: 404 que devuelven HTTP 200

Vale igual que antes del rediseño, y aplica a las rutas nuevas porque el problema
es de Next, no de la pantalla:

- **`/carta/[id]` con un id inexistente** llama a `notFound()` y muestra el
  `not-found.tsx` correcto, pero responde **200**. En Next 16 el render es
  streaming: el shell — incluido el `loading.tsx` del segmento — se manda al
  navegador apenas está listo, y con él los headers. Para cuando el componente
  async termina el `fetch` y llama a `notFound()`, el 200 ya salió por el cable.
  Lo único que cambia es el `title`, vía `generateMetadata` → `'Carta no
  encontrada'`, que es la señal usable.
- **`/share/[slug]` con un slug inexistente, revocado o vencido** tiene el mismo
  comportamiento, por el mismo motivo. Y los tres casos son la misma pantalla a
  propósito: el backend devuelve 404 para los tres y desde el server no se puede
  saber cuál, así que el copy los cubre sin mentir sobre ninguno.
- **`/colecciones/[id]` esquiva el problema por diseño**: es client y muestra un
  `EmptyState` en vez de llamar a `notFound()`. El status también es 200, pero ahí
  la 404 es una decisión y no un accidente.
- **`/colecciones/[id]/sets` y `/buscar` no tienen el problema**: no llaman a
  `notFound()`.

Los workarounds (sacar el `loading.tsx` del segmento, o mover el chequeo a
`middleware.ts` / un route handler) siguen sin estar implementados. El detalle del
mecanismo está en [`gotchas.md`](gotchas.md) §10.
