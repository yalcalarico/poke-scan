# Guía de construcción

Cómo se trabaja en el frontend. Leé esto antes de tocar cualquier pantalla.

---

## 1. La regla de oro

**Hay una sola app.** No hay prefijo de versión, ni `V2_BASE`, ni dos versiones
conviviendo. `components/` y `app/` son las carpetas de siempre y lo que hay en
ellas es la app.

El linter de tokens de color cubre **todo** el JSX y TS del proyecto:

```bash
pnpm --dir frontend run lint
```

`lint` es `eslint && node scripts/check-no-raw-colors.mjs`, así que **un color
crudo de Tailwind rompe el build**. Las raíces del script son `app`, `components`,
`lib` y `hooks`; `scripts/` y los tests quedan afuera a propósito, porque un
fixture que reproduce a propósito el bug que se quiere evitar tiene que poder
escribir la clase cruda.

Dos consequences practices:

1. **No copies código de otro lado del repo sin revisarlo.** Cualquier cosa con
   `slate-*`, `bg-white`, `text-black` o `text-[13px]` es un error de lint, no una
   preferencia.
2. **Si agregás una clase nueva de color, va como token en `globals.css` primero.**
   La clase es la última parte del trabajo, no la primera.

---

## 2. Layout de archivos

```
app/
  layout.tsx              raíz: <html>, fuentes, metadata global, script anti-flash,
                          skip link y <Providers>
  providers.tsx           ThemeProvider · AuthProvider · CurrencyProvider · ToastProvider
  pwa-sw-register.tsx     el service worker, solo en producción
  globals.css             tokens del design system (fuera de @theme) + @theme inline
  not-found.tsx           404 general
  (app)/                  rutas de cuenta — CON BottomNav
    layout.tsx            <AppShell>
    page.tsx              /
    buscar/  carta/  escanear/  colecciones/  ajustes/
    error.tsx
  (auth)/                 login y registro — SIN BottomNav
    layout.tsx            <PlainShell>
    error.tsx
    login/  registro/
  share/                  colección pública — SIN BottomNav
    layout.tsx            <PlainShell>
    [slug]/

components/
  nav.ts                  NAV_ITEMS, isNavItemActive — fuente única de navegación
  ui/                     las 27 primitivas — NO las edites salvo que falte algo
  layout/                 AppShell, PlainShell, ScreenHeader, ScreenContainer,
                          BottomNav, OfflineToast, screen-container
  cards/                  CardTile, CardGrid, Money, ShowOrDash, set-media
  search/                 catalog-search, controles, filtros, fallback
  scanner/                cámara, frame, action bar, resultados, organización
  collections/            lista, detalle, summary, sheets de ítem y de colección
  set-progress/           progreso por set y binder
  prices/                 PriceHero, PriceDelta, PriceTable, CardPriceSection
  settings/               identidad, apariencia, moneda, sesión, RequireAuth
  share/                  enlaces del usuario, vista pública, InstallCta
  auth/                   AuthShell, LoginForm, RegisterForm
  home/                   dashboard inicial de la PWA, mock, CTA
  marketing/              landing pública, planes y FAQ
  brand/                  AppMark
```

**Regla de ubicación:** un componente va a `ui/` **solo si no depende de datos de
una pantalla**. Si depende de `CardDto`, va a `cards/`. Si depende de
`CollectionItemDto`, va a `collections/`. Si depende de `PriceDto`, va a
`prices/`. La razón de la regla está en
[`components.md`](components.md) §0.

**Barrels:** las carpetas con `index.ts` se importan como `@/components/<carpeta>`.
`layout/`, `cards/`, `search/` y `set-progress/` **no** tienen barrel: de esos se
importa el archivo.

---

## 3. El shell ya existe, usalo

`app/providers.tsx` monta los cuatro providers de la app entera. **`app/layout.tsx`**
monta el skip link, el script anti-flash y el `<body>`. **Los layouts de rama solo
pintan el canvas y deciden si hay `BottomNav`.**

**No los montes de nuevo en una pantalla.** Duplicar un provider no es solo
duplicar el código: remonta su estado. La preferencia de moneda y la clase `dark`
del `<html>` parpadearían en cada navegación entre ramas. El JSDoc de `AppShell`
lo dice: *"el estado de la moneda y del tema se perdería al navegar"*.

Si tu pantalla necesita `BottomNav` y está en `(app)`, ya la tiene. Si necesita
`AppShell` y está en `share/` o `(auth)`, **algo está mal**: esa pantalla no
puede llevar la nav, y si de verdad la necesita es porque debería estar en `(app)`.

En cada pantalla usá:

```tsx
import { ScreenHeader } from '@/components/layout/screen-header';
import { ScreenContainer } from '@/components/layout/screen-container';

<ScreenHeader title="Buscar" action={<IconButton … />} />
<ScreenContainer labelledBy="…">
  …
</ScreenContainer>
```

`ScreenContainer` es el `<main id="contenido">` al que apunta el skip link, y
**reparte los atributos que sobran**: si necesitás `aria-busy="true"`, pasalo
directo, no escribas un `<main>` propio copiándole las clases. Si renderizás tu
propio `<main>`, no uses `ScreenContainer` y poné el `id` vos.

`ScreenHeader` **no puede** usar `usePathname()`: es server-safe a propósito, y una
sola directiva de más convierte toda la rama en client. Cada pantalla le pasa su
`back={{ href, label }}` y su `action` desde abajo. Ver
[`gotchas.md`](gotchas.md) §21.

---

## 4. Cómo pedir datos

`lib/api/*` ya tiene todo lo que necesitan las pantallas. **No escribas `fetch` a
mano ni repitas la lógica de `AbortController`.**

```ts
import { searchCards, getCard, getCardPrices, getSets } from '@/lib/api';
import { listCollections, getCollection, getStats, listItems } from '@/lib/api';
```

- `apiFetch` ya maneja el token, el refresh y el `AbortSignal`.
- `AuthProvider` y `CurrencyProvider` vienen del layout raíz. `useAuth()` y
  `useCurrency()` funcionan en cualquier pantalla.
- **`useCurrency().formatMoney(usd)`** es la única forma de mostrar plata. El
  valor crudo siempre es USD; la conversión es del cliente.

### El patrón de estado

§9.1 del design system exige cinco estados y ninguno se saltea. El hook ya
está escrito:

```tsx
'use client';
import { useAsync } from '@/hooks/use-async';

const { status, data, error, reload } = useAsync(
  (signal) => getSets(signal),   // si la fn acepta signal
  [],                              // deps
);
```

Si la función de `lib/api` no acepta `signal`, envolvé con
`(signal) => { void signal; return getSets(); }` y seguí igual.

Para listas con "cargar más" usá `useInfiniteList` de `@/hooks/use-infinite-list`.

**El server no puede pedir nada de la cuenta.** El token vive en `sessionStorage`,
así que cualquier `fetch` desde un Server Component a un endpoint autenticado
sale sin credenciales y vuelve 401. `params` sí se desenvuelve en el server
(`await params`), pero los datos no.

### Loading

Si la ruta es un Server Component, creá `loading.tsx` con un `Skeleton` que tenga
**la forma real** del contenido, no aproximada. Si la pantalla es client-side,
`status === 'loading'` y un `Skeleton`.

`aria-busy="true"` en el contenedor, `role="status"` + label en el `Skeleton`
group. Los `Skeleton` son `aria-hidden` por diseño.

**Regla que se viola siempre:** el `fallback` de un `Suspense` y el `loading.tsx`
del mismo segmento son **el mismo componente**, no dos versiones. Dos skeletons de
la misma pantalla que no coinciden son un salto de layout esperando a aparecer.

---

## 5. Reglas que no se negocian

Extraídas de `design-system.md`. Las más violadas:

1. **Cero colores crudos.** Nada de `slate-*`, `white`, `black`, `sky-*`. Solo
   tokens. El linter lo verifica y falla el build.
2. **Nada fuera de la escala tipográfica.** No existe `text-[13px]`. Las 10
   clases son `text-display-lg` `text-display` `text-h1` `text-h2` `text-h3`
   `text-body` `text-body-strong` `text-label` `text-caption` `text-overline`.
3. **Nunca `space-y-*`.** `gap-*` en contenedores flex/grid, `mt-*` entre
   hermanos.
4. **`cn()` siempre.** Nunca template literals para clases. Y `cn()` con la
   escala tipográfica tiene un fix propio: ver [`gotchas.md`](gotchas.md) §16.
5. **`transition` con duración.** Nunca el `transition` pelado de 150 ms.
6. **Nada de `animate-pulse`.** Es `Skeleton` con `bg-shimmer animate-shimmer`.
7. **Todo número comparable lleva `tabular-nums`.** Precios, cantidades, `4 / 102`.
8. **Copy con tildes y `…`, y con voseo.** "Escaneá", no "Escanea" ni "Escanee".
9. **Cero `any`.**
10. **`'use client'` solo si hay estado, efecto o handler.** Un Server Component
    no puede importar un módulo client, así que poner la directiva de más acorta
    el grafo entero. Prefijá `'use client'` solo cuando la pantalla sea realmente
    interactiva.
11. **Ningún `z-[nnz]`.** La escala es `z-base` `z-sticky` `z-nav` `z-overlay`
    `z-sheet` `z-media` `z-offline`.

---

## 6. Cosas que ya están resueltas y no hay que volver a pensar

- **La `BottomNav` funciona en la PWA instalada.** No se oculta en standalone. La
  app anterior la escondía y dejaba la PWA sin navegación.
- **La cámara queda arriba de la nav.** `CameraView` es `fixed inset-0 z-media` y
  la nav es `z-nav`, así que el scanner escapa del shell sin que nadie tenga que
  esconderlo.
- **El `Select` propio** (listbox con ARIA) ya existe. No uses `<select>` nativo
  para nada con más de 12 opciones, y preferentemente no lo uses para nada.
- **El foco visible está garantizado** en todas las primitivas. No agregues
  `focus:outline-none` sin un `focus:ring-*` equivalente.
- **`prefers-reduced-motion`** está respetado globalmente desde `globals.css`.
- **Los toasts** reemplazan los `<p role="status">` con autocierre. Usá
  `useToast()`, no escribas tu propio temporizador de mensajes.
- **El tema se resuelve en el `<head>` antes de pintar.** `THEME_SCRIPT` corre
  inline, y por eso vive en `lib/theme-script.ts` y no en `lib/theme.tsx` (que es
  client): importarlo de ahí le devolvería una *client reference* al layout raíz y
  el `__html` sería `[object Object]`.

---

## 7. El rate limit (no negociable)

`AGENTS.md` §3.1: pokemontcg.io v2 sin key, **1.000/día, 30/min**. El catálogo ya
está espejado en Postgres y los precios se cachean 2 capas (Redis 1 h + Postgres
24 h).

**Nunca llames a pokemontcg.io desde un handler.** Toda lectura de precio pasa
por `getCardPrices(id)`. En el escáner, el chip de precio flotante **lee la fila
de precio que ya viene en la respuesta de `identifyCard`** — jamás dispara un
fetch, y jamás desde el loop de cámara. `PriceChip` no importa `lib/api`, no tiene
`useEffect` y no tiene estado: si le pasás un número, lo pinta; si no, no renderiza
nada.

---

## 8. Verificación antes de dar algo por terminado

```bash
pnpm run typecheck          # desde la raíz
pnpm --dir frontend run lint   # incluye check-no-raw-colors.mjs
pnpm --dir frontend run test   # incluye el test de regresión de cn()
```

`pnpm run check` desde la raíz corre todo: lint de los dos proyectos, typecheck,
tests y build. Es lo que se corre antes de dar algo por terminado.

Si tocaste datos, probá el flujo real con `pnpm run dev`. Y probá **en los dos
temas** y con `prefers-reduced-motion: reduce`.

> Si el typecheck falla con un error que no podés explicar leyendo el archivo, y
> da un resultado distinto en la segunda corrida, no estás arreglando código: es
> `tsconfig.tsbuildinfo` stale, o un `next dev` corriendo que escribe los tipos de
> ruta al mismo tiempo. Ver [`gotchas.md`](gotchas.md) §18.
