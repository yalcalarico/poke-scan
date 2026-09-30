# Plan de rediseño UI/UX 2026

> Rediseño visual y de navegación del frontend para llevar la app al look de las
> referencias (canvas gris claro, cards blancas flotantes, pills de filtro, acento
> rojo, cifras pesadas) **y** agregar la vista de progreso por set.
>
> El sistema de estilos que hay que seguir está en
> [`design-system.md`](design-system.md) (v2). Este documento es el *qué* y el *cuándo*.

---

## ESTADO (leé esto primero)

**El rediseño está terminado y es la única versión del frontend.** Esto ya no es un
plan: es el registro de lo que se hizo.

| | |
|---|---|
| **Fases 0 a 7** | ✅ Hechas |
| **Fase 8 (limpieza y flip)** | ✅ Hecha |
| **El flip** | ✅ Hecho — la app nueva **es** la app |
| **Fecha** | 2026-09-28 |

Lo que cambió estructuralmente con el flip:

| Antes | Ahora |
|---|---|
| `components/v2/*` | `components/*` |
| `app/v2/buscar`, `app/v2/carta`, `app/v2/colecciones`, `app/v2/escanear`, `app/v2/perfil` | `app/(app)/*` |
| `app/v2/page.tsx` (la home, en `/v2/home`) | `app/(app)/inicio/page.tsx` (en `/inicio`); `/` queda para la landing pública |
| `app/(v2auth)/v2/{login,registro}` | `app/(auth)/*` |
| `app/(v2public)/v2/share/[slug]` + su layout | `app/share/[slug]` + `app/share/layout.tsx` |
| `V2_BASE` en `components/nav.ts` | **eliminado**: los `href` son absolutos |
| `/perfil` | `/ajustes`, con un `app/(app)/perfil/route.ts` que hace 308 |
| `components/layout/v2-shell.tsx` | `components/layout/{app-shell,plain-shell}.tsx` |
| Theme/Toast montados en 3 ramas de layout | los cuatro providers en el **layout raíz** (`app/providers.tsx`) |
| `robots: noindex` en los 3 layouts | **eliminado** (ya no hay dos URLs para el mismo contenido) |

**Actualización posterior:** `/` ahora es la landing pública de PokéScan con planes
Gratis/Pro y FAQ; el inicio de la PWA instalada se movió a `/inicio`, que es el
`start_url` del manifest. No hay una segunda app: son dos entradas al mismo
producto, con shells distintos (`MarketingShell` y `AppShell`).

**Este documento es histórico**: las fases están escritas en el orden en que se
hicieron, cuando la app nueva convivía con la anterior bajo `/v2`. Cuando una
sección diga `/v2/…` o `components/v2/`, está describiendo el estado de ese
momento, no el de hoy.

| Para el estado actual | |
|---|---|
| **Componentes** | [`components.md`](components.md) |
| **Rutas** | [`routes.md`](routes.md) |
| **Cómo se trabaja acá** | [`build-guide.md`](build-guide.md) |
| **Estilos y tokens** | [`design-system.md`](design-system.md) |
| **Las fallas que costaron tiempo** | [`gotchas.md`](gotchas.md) |

---

## 1. Decisiones tomadas

| Decisión | Valor | Por qué |
|---|---|---|
| Tema | **Light default + dark como tema**, con toggle | Las referencias son light. El dark se conserva como modo, no como identidad. Mata de paso la deuda de `prefers-color-scheme` muerto. |
| Dependencias | **`lucide-react` + `clsx` + `tailwind-merge` + `class-variance-authority`** | Lo mínimo para un design system real. Nada más. |
| Alcance | **Rediseño + sistema**, y **set progress / binder view** | Favoritos, wishlist e historial de precio quedan afuera: requieren cambios de contrato grandes. |
| Animación | **CSS-first**, sin librería | Keyframes + tokens de duración/easing cubren el 90 %. `motion` suma 40 kB para 4 animaciones. |
| Primitivas accesibles | **A mano**, sin Radix | 8 selects y 3 sheets. Es trabajo real pero controlado, y evita un bundle de 30 kB por un listbox. |

---

## 2. Diagnóstico: dónde estamos

Resumen del estado actual, para dimensionar el trabajo.

**Lo que ya está bien** (no se toca): el escáner de verdad (OCR con tesseract,
preprocess, crop, identify), la arquitectura de precios en 2 capas, la lógica de
frescura, la sesión y el refresh de token, el service worker, el route splitting
Server/Client bien aplicado, y un nivel de accesibilidad por encima del promedio
(`useId` consistente, focus trap, `role`s diferenciados, `aria-describedby`).

**Lo que está roto o ausente:**

| # | Problema | Impacto |
|---|---|---|
| 1 | **No hay design tokens.** 6 custom properties, 2 en conflicto. Colores, spacing, radius, shadow y motion salen de clases Tailwind copiadas a mano. | Un rebranding son ~200 ediciones. El color crudo de la home (`sky-400`) ya no coincide con el de las otras 15 pantallas. |
| 2 | **`body { font-family: Arial; background: var(--background) }` pisa Tailwind.** | El body renderiza en **Arial, no Geist**. Y en tema claro hay un frame blanco. |
| 3 | **La `BottomNav` desaparece en standalone** y el `TopBar` no tiene links a las secciones. | **En la PWA instalada no se puede navegar a `/colecciones` ni `/escanear`.** El gap funcional más grave. |
| 4 | **~30 duplicaciones exactas**: botón primario (12 variantes de padding), input (7 estilos), stat tile (5), alert (9), chip (8), header de modal (3), icono (4 duplicados exactos, 15 SVG inline), spinner (3 estilos), "Reintentar" (6, con 3 estilos). | Deriva visual garantizada. |
| 5 | **2 sombras en toda la app.** | En light no hay jerarquía. La v2 necesita un sistema de elevación real. |
| 6 | **84 `transition` bare**, 0 keyframes, 0 `prefers-reduced-motion`. | Los sheets cortan seco, el skeleton parpadea sin importar la preferencia del usuario. |
| 7 | **8 `<select>` nativos**, el de set con 176 opciones. | El peor punto de UX mobile de la app. |
| 8 | **17 elementos con `focus:outline-none` sin anillo alternativo.** | WCAG 2.4.7: un usuario de teclado no ve dónde está. |
| 9 | **La tabla de precios fuerza scroll horizontal** (`min-w-[440px]`) en 390 px. | Ilegible en mobile, que es el 100 % del tráfico. |
| 10 | **El filtro "Para intercambio" es client-side sobre la página actual.** | Muestra "0 resultados" en la página 3 aunque haya 200 en la colección. |
| 11 | **Branding inconsistente**: manifest dice "PokéScan", `TopBar` y `(auth)/layout` dicen "Pokémon Scanner". | |
| 12 | **El CTA "Empezar a escanear" de la home lleva a `/buscar`.** | |
| 13 | **No hay `error.tsx` en ninguna ruta.** | Un error de render muestra la pantalla genérica de Next, sin chrome ni CTA. |
| 14 | **Sin `dvh`**: todo es `min-h-screen` = `100vh`. | Salto clásico de contenido en Safari iOS. |
| 15 | **Campos del contrato sin usar**: `SetDto.logoUrl`, `SetDto.symbolUrl`, `UserDto.avatarUrl`, `IdentifiedCandidateDto.matchedText`, `CollectionItemDto.notes`. | 5 mejoras de UX grandes gratis, hoy tiradas. |
| 16 | **La cámara es `z-40` y la `BottomNav` es `z-50`.** | En browser el shutter y el frame quedan **debajo** de la nav. |

**Lo que hay que construir de cero**: `Button`, `Input`/`Select`/`Textarea`/`Checkbox`/
`Switch`, `Chip`, `Badge`, `Alert`, `Sheet`, `Toast`, `Stat`, `StatRow`, `Progress`,
`Avatar`, `ScreenHeader`, `useAsync`, `PriceHero`, `PriceDelta`, `SetProgressCard`,
`useSheet`, `useToast`, `ThemeProvider`, `cn()`. Más 15 SVG inline y
`components/scanner/icons.tsx` que se borran.

---

## 3. Lenguaje visual objetivo

Extraído de las 4 referencias, y cómo se traduce a tokens.

| Señal de la referencia | Traducción en el sistema |
|---|---|
| Canvas gris muy claro, cards blancas | `bg-canvas` `#F4F4F6` + `Surface` `bg-surface` `#FFF` con `shadow-sm` |
| Card = la imagen, sin contenedor con borde | `CardTile` sin borde ni fondo: la imagen flota con `rounded-surface` + `shadow-sm` |
| Pills de filtro, activo **negro** invertido | `Chip` activo = `bg-primary text-inverse` (el rojo queda para precio y CTA) |
| Título centrado + chevron, sin borde | `ScreenHeader` sticky con `backdrop-blur`, sin border-bottom |
| Nav inferior 4 items, activo en rojo | `BottomNav` con `text-brand` en el activo, **siempre visible** |
| Cifras enormes, `tabular-nums`, en verde | `text-display` `text-positive` `tabular-nums` |
| Delta de precio en píldora roja con % | `PriceDelta` → `bg-negative-soft text-negative` |
| Fila label-izq / valor-der / chevron | `StatRow` |
| Resumen de colección: tile de ícono + total | `CollectionSummary` con `Surface` de 2 columnas |
| Frame de detección **verde** sobre la foto | `--positive` con glow, sobre `--on-media` |
| Chip de precio flotante sobre la foto | `bg-on-media` + `text-positive` |
| Grid de colección a 3 columnas | `grid-cols-3` con `gap-2` |
| Grilla de búsqueda a 2 columnas | `grid-cols-2` con `gap-3` |

---

## 4. Fases

Cada fase entra por separado, con `pnpm run check` en verde. Ninguna depende de que
la anterior esté "terminada", sí de que esté mergeada.

### Fase 0 — Cimientos (sin cambio visual)

Objetivo: que todo lo demás sea posible. **Ningún componente existente cambia de
aspecto todavía.**

**Dependencias**
```
pnpm --filter frontend add lucide-react clsx tailwind-merge class-variance-authority
```

**Tokens** — `app/globals.css` reescrito con los bloques del §1 del design system.
Incluye el bloque `prefers-reduced-motion` y el fix del `body {}` (se borra).

**Archivos nuevos**
```
app/globals.css                  reescrito
lib/cn.ts                        cn() con clsx + tailwind-merge
lib/theme.tsx                    'use client' — ThemeProvider, useTheme, script anti-flash
lib/variants.ts                  unificación de labels de variante/condición
hooks/use-async.ts               AsyncState + reload
hooks/use-toast.tsx              provider + useToast
scripts/check-no-raw-colors.mjs  falla el build si aparece un color crudo
```

**Primitivas** — `components/ui/`: `button.tsx`, `icon-button.tsx`, `surface.tsx`,
`chip.tsx`, `badge.tsx`, `stat.tsx`, `alert.tsx`, `skeleton.tsx`, `spinner.tsx`,
`spinner.tsx`, `avatar.tsx`, `progress.tsx`, `divider.tsx`, `empty-state.tsx`,
`error-state.tsx`, `toast.tsx`, `sheet.tsx`, `field.tsx`, `input.tsx`, `textarea.tsx`,
`select.tsx`, `checkbox.tsx`, `switch.tsx`, `screen-header.tsx`.

**Criterios de aceptación**
- [ ] `pnpm run check` en verde, y el build de producción pasa (el `'use client'` de
      `lib/theme.tsx` no arrastra nada del server).
- [ ] `document.documentElement` tiene `dark` solo con preferencia dark, sin flash.
- [ ] El `Select` custom: teclado completo (↑↓ Home End Enter Esc typeahead),
      `aria-activedescendant`, portal a `body`, foco atrapado, y **búsqueda interna
      cuando hay más de 12 opciones**.
- [ ] `scripts/check-no-raw-colors.mjs` está enganchado a `pnpm run lint` y **falla**
      (se verifica corriendo el grep sobre un archivo con `bg-slate-950`).
- [ ] Las 15 primitivas se ven en un `/dev` scratch route (se borra al terminar la
      fase).

**Riesgo**: el `Select` custom es la pieza más delicada de toda la fase. Si se
delay, se puede arrancar con un `<select>` estilizado (`appearance-none` + chevron) y
el listbox propio entra en la Fase 2, que es donde se usa de verdad.

---

### Fase 1 — Chrome de la app

Objetivo: **arreglar la navegación en PWA instalada** y unificar el shell. Es la fase
con más relación beneficio/trabajo.

| Cambio | Detalle |
|---|---|
| **Borrar `TopBar`** | Reemplazado por `ScreenHeader` por pantalla. El "Pokémon Scanner" del top bar desaparece con él. |
| **`BottomNav` siempre visible** | Se borran `.pwa-hide-in-standalone` y `.pwa-content-inset` de `globals.css`. `bg-surface/90 backdrop-blur-lg` + `shadow-md`, `h-16`, `pb-[env(safe-area-inset-bottom)]`, `max-w-lg` centrada. Iconos de `lucide`. Activo = `text-brand`. |
| **`AppShell`** | `min-h-dvh`, skip link, `<main id="contenido">`, `pb-[calc(5rem+env(safe-area-inset-bottom))]`, `bg-canvas text-primary`. |
| **`OfflineBanner` → `Toast`** | El `div` fijo de 32 px se va. Se queda el guard que escribe `document.documentElement.dataset.offline` y un `role="status"` `sr-only`. Visible = un `Toast tone="warning"`. Se borra el CSS de `html[data-offline]` que empujaba el layout. |
| **Z-index** | Escala del §6 del design system. La cámara pasa a `z-media`, la nav a `z-nav`. Se arregla el bug de solapamiento. |
| **`error.tsx`** | Uno por segmento: `(app)/error.tsx`, `(auth)/error.tsx`, `share/error.tsx`. `ErrorState` + "Reintentar" (`reset()`) + "Volver al inicio". |
| **Branding** | "PokéScan" en los 6 lugares. Se decide si se renombra el `<h1>` de auth. |
| **Metadatos** | `title.template` en `layout.tsx`, `metadataBase`, `twitter:card`, `sitemap.ts`, `robots.ts`, y `title` propio en las rutas que no lo tienen. |
| **Manifest** | `screenshots`, `share_target` con deep link a `/carta/[id]`, `display_override`, `prefer_related_applications: false`. |
| **Tema** | Toggle en un lugar accesible desde perfil. Se implementa en la Fase 7, pero el `ThemeProvider` ya está montado acá. |

**Criterios de aceptación**
- [ ] Instalada como PWA, las 4 secciones se navegan desde la `BottomNav`.
- [ ] En `sm:` y `md:` el header no pisa el notch.
- [ ] Con `prefers-reduced-motion: reduce` no hay ni shimmer ni transición de tema.
- [ ] Un error de render en `/colecciones` muestra el `error.tsx` con chrome, no la
      pantalla de Next.
- [ ] Sin flash de tema en carga, con DevTools en Slow 3G.

---

### Fase 2 — Buscar (la pantalla bandera)

Es la que mejor muestra el lenguaje nuevo. Reemplaza la pantalla actual.

```
┌──────────────────────────────────┐
│  ←        Buscar            [X] │  ScreenHeader sticky, título centrado
├──────────────────────────────────┤
│  ┌────────────────────────────┐  │
│  │ 🔍 Buscá por nombre…     ⨯ │  │  Input grande, rounded-control, clear dentro
│  └────────────────────────────┘  │
│  ( Nombre ) ( Número ) ( Artista)│  Chip row — cambia el modo de búsqueda
│                                  │
│  (Todas) (Sword & Shield…) (+)   │  Chip row de filtros + "Más" → Sheet
│                                  │
│  1.204 cartas            Limpiar │  Contador aria-live + limpiar filtros
│  ┌────────┐  ┌────────┐          │
│  │ img    │  │ img    │          │  2 col, sin borde de tarjeta,
│  │ Gengar │  │ Gengar │          │  solo la imagen con shadow
│  │ Base   │  │ Neo    │          │
│  └────────┘  └────────┘          │
│           [ Cargar más ]         │
└──────────────────────────────────┘
```

| Cambio | Detalle |
|---|---|
| `CardTile` rediseñado | **Sin** `border` ni `bg-surface`. La imagen con `rounded-surface shadow-sm` y `group-hover:-translate-y-0.5 group-hover:shadow-md` con `--duration-fast`. Debajo: nombre `body-strong truncate` + set `caption text-tertiary truncate` + precio en `text-positive` si existe. El chip `x{N}` pasa abajo a la derecha, no encima de la imagen. |
| Filtros | Set y rareza pasan de `<select>` a `Chip` con "Más" que abre un `Sheet` con búsqueda. Rareza (12 opciones) entra directo como chips en un `overflow-x-auto snap-x`. |
| Modo de búsqueda | `Nombre` / `Número` / `Artista` como `Chip` con `aria-pressed`. **Requiere backend**: hoy `SearchCardsDto` solo busca por `name` (ver §6). |
| Paginación | `Pagination` → botón "Cargar más" + `IntersectionObserver` con fallback de 600 px. La URL sigue siendo la fuente de verdad y `?page=` sigue funcionando para linkear. |
| `AddToCollectionButton` | En el tile pasa a ser un `IconButton` de `Plus` con `aria-label="Añadir a colección"`, que abre el `Sheet` de agregar. El botón grande de la home / detalle se mantiene. |
| `ScanResults` reusa `CardTile` | Se eliminan las 2 filas custom de candidato: el resultado del escáner es un `CardTile` con la barra de confianza abajo. |

**Criterios de aceptación**
- [ ] Un search por URL reproduce exactamente el mismo estado.
- [ ] 390 px: 2 columnas, nombres legibles sin truncar a media palabra.
- [ ] Todos los filtros son alcanzables por teclado y tienen label.
- [ ] `Select` de 176 sets: buscar "base" encuentra los sets en <400 ms.
- [ ] Un resultado sin precio muestra `—` en `text-tertiary`, nunca `$0.00`.
- [ ] El input no se borra al volver atrás (el bug de `gotchas.md` #3 sigue cubierto).

---

### Fase 3 — Ficha de carta + precios

```
┌──────────────────────────────────┐
│  ←        Gengar ex             │  ScreenHeader
├──────────────────────────────────┤
│         ┌────────────┐          │
│         │            │          │  Imagen centrada, shadow-xl
│         │   CARTA    │          │
│         │            │ [LIVE]  │  Pill de marca arriba a la derecha
│         └────────────┘          │
│      ▓▓▓ el logo del set ▓▓▓    │  SetDto.logoUrl — campo sin usar
│                                  │
│  ┌────────────────────────────┐  │
│  │ Precio medio                │  │
│  │ ▇ $1.316,45                 │  │  text-display tabular-nums
│  │ ▼ -$2.839,31 (-73%) 30d  › │  │  PriceDelta
│  └────────────────────────────┘  │  tap → Sheet con la tabla completa
│  ┌────────────────────────────┐  │
│  │ 🗂 Administrar        1/4 › │  │  StatRow
│  └────────────────────────────┘  │
│  (Añadir) (Intercambio) (Compartir)│ Chip row de acciones
│                                  │
│  N.º 4/102 · Rareza Secret · …   │  dl de datos
│                                  │
│  Otras de este set  →            │  Scroller horizontal
│  ┌──┐ ┌──┐ ┌──┐ ┌──┐            │
│  └──┘ └──┘ └──┘ └──┘            │
└──────────────────────────────────┘
```

| Cambio | Detalle |
|---|---|
| **`PriceHero` (nuevo)** | Label `overline text-tertiary`, cifra `text-display tabular-nums text-primary`, `BarChart3` de lucide como afordancia. Debajo el `PriceDelta` (cuando haya histórico, ver §6) o la fecha de actualización. |
| **`PriceDelta` (nuevo)** | Pill `bg-negative-soft` / `bg-positive-soft`, `TrendingDown` / `TrendingUp`, `tabular-nums`. Hoy muestra solo "actualizado hace X"; el delta real requiere backend. |
| **La tabla de precios deja de ser tabla en mobile** | `CardPriceTable` (5 columnas, `min-w-[440px]`) pasa a un `Sheet`: las 8 variantes como filas de `dl` con `StatRow` (bajo / medio / alto / mercado apilados, no en columnas). En `lg:` la tabla se mantiene, porque ahí sí hay ancho. **Esto elimina el scroll horizontal en 390 px.** |
| `SetDto.logoUrl` y `symbolUrl` | El logo del set debajo de la imagen, y el symbol como `Badge` en la fila de datos. **Dos campos del contrato que nunca se usaron.** |
| "Otras de este set" | Scroller horizontal con `CardTile` chico, de `/cards/search?setId=`. Un request. |
| Chip row de acciones | Reemplaza los 3 chips de la referencia (Favorites / My collection / Wishlist) por los que existen: **Añadir a colección** / **Para intercambio** / **Compartir**. Se eliminan los 3 `InfoRow` duplicados de `TYPE_LABELS` inline y van a `lib/pokemon.ts`. |
| `ItemActions` | Pasa de modal a `Sheet`. `Field` en todos los inputs. Borrado con `AlertDialog` en lugar de la confirmación inline dentro del card. |
| `CardPriceSection` | Se borra el state `revalidating` que nunca se ponía en `true` (`gotchas.md` #11). El `flash-once` marca la cifra cuando cambia. |

**Criterios de aceptación**
- [ ] A 390 px no hay ningún scroll horizontal en la pantalla.
- [ ] El precio se ve sin zoom y es el elemento más grande de la pantalla.
- [ ] Con la moneda en ARS, la cifra principal es ARS y el USD aparece debajo en
      `caption text-tertiary` con `tabular-nums`.
- [ ] `add-to-collection` sigue funcionando y trata el 409 como éxito.
- [ ] Si no hay precio: `—` con `aria-label="Sin precio"`, y no una fila de ceros.

---

### Fase 4 — Escanear

La pantalla más grande y la que más cambia. Se apoya en el `Scanner` chrome de la
referencia.

```
┌──────────────────────────────────┐
│                          ⚡ ∞  🔇 │  Controles flotantes sobre la foto
│  ┌──────────────┐                │
│  │  $11.791     │                │  Chip de precio, bg-on-media, text-positive
│  └──────────────┘                │  display-lg tabular-nums
│                                  │
│      ┌────────────┐              │
│      │  ┏━━━━━━┓  │              │  Frame VERDE, glow, esquinas redondeadas
│      │  ┃ carta ┃  │              │
│      │  ┗━━━━━━┛  │              │
│      └────────────┘              │
│                                  │
│  ┌──┐ Gengar ex        ▓ $11.791 │  Barra de carta detectada
│  │img│ Base Set    4/102         │
│  └──┘                             │
│  ┌──┐ 🗑  (  ●  )  Organizar (1) │  Action bar
└──────────────────────────────────┘
```

| Cambio | Detalle |
|---|---|
| **Escapa del `AppShell`** | La cámara es `fixed inset-0 z-media` con su propio chrome. La `BottomNav` y el `ScreenHeader` se ocultan mientras el scanner está activo. Arregla el bug de z-index. |
| **Frame verde** | De "4 esquinas con borde dashed blanco" a un `rounded-2xl` con `ring-2 ring-positive` + `shadow-[0_0_0_8px] shadow-positive/20`, más 4 corner brackets fijos. Pulso suave al detectar. Colorea el frame por confianza: `positive` ≥ 0.75, `warning` 0.4–0.75. |
| **Chip de precio flotante** | `bg-on-media text-positive text-display-lg tabular-nums` con `shadow-xl`. Muestra el precio **de la carta detectada**. Ver la advertencia de rate limit en §6 — es la parte más delicada de la fase. |
| **Barra de carta detectada** | `Thumbnail + nombre + set + formatCardNumber + precio`, en `bg-on-media` con `backdrop-blur`. Reemplaza el `ScanProgress` de modal por algo inline y no bloqueante. |
| **Action bar** | `Images` (galería), `Trash2` (descartar la captura), shutter `h-20 w-20 rounded-full border-4 border-white bg-white/25 backdrop-blur` con `active:scale-90`, y `Organizar (N)` como `Button variant="inverse"`. |
| **Sesión por lotes** | `Organizar (N)` abre un `Sheet` con las N cartas detectadas en la sesión, cada una con destino de colección y cantidad. Resuelve el caso real de "escaneé 20 cartas y las tengo que agregar de a una". |
| **Controles de cámara** | `Zap` (flash), `Infinity` (modo continuo), `VolumeX` / `Bluetooth` (según el dispositivo). Pill único `bg-on-media` arriba a la derecha. |
| `ScanProgress` | Pasa de card a card inline. Fases con copy propio (ya está en `PHASE_HEADLINE`). Barra con los tokens de motion. `skeleton` de la carta en vez de `spinner`. |
| Estado idle | Deja el gradiente oscuro: pasa a `Surface` de `radius-panel` con el ícono de cámara en un círculo `bg-brand-soft text-brand`, y los 3 CTAs como `Button` (escanear / subir foto / buscar). |
| `ScanResults` | Reusa `CardTile` + `Progress` de confianza. **Mostrar `matchedText`**: qué fragmento del OCR matcheó, resaltado. Es el mejor win de UX del escáner y el campo ya está en el contrato. |

**Criterios de aceptación**
- [ ] Ningún request a pokemontcg.io desde el loop de cámara (verificado en Network).
- [ ] El shutter y el frame quedan **por encima** de la nav en browser.
- [ ] El scanner no se corta al rotar el teléfono.
- [ ] 20 cartas escaneadas en sesión se organizan en una sola pasada por el `Sheet`.
- [ ] El scanner funciona con el tema claro y oscuro (el chrome sobre foto es fijo).
- [ ] `prefers-reduced-motion`: sin pulso del frame, sin shimmer.
- [ ] El copyright de Pokémon: el chrome del scanner **no** usa el logo de la
      franchise.

---

### Fase 5 — Colecciones

**`/colecciones`**

```
┌──────────────────────────────────┐
│  ←        Colecciones        (+) │  ScreenHeader
├──────────────────────────────────┤
│  2 colecciones · 48 cartas        │
│  ┌────────────┐  ┌────────────┐  │
│  │ ▨▨ mosaic  │  │ ▨▨ mosaic  │  │  CollectionCard con cover
│  │ Mi colección│  │ Binders    │  │
│  │ 24 cartas  │  │ 24 cartas  │  │
│  │ $2.450   › │  │ $980     › │  │  total en text-positive
│  └────────────┘  └────────────┘  │
└──────────────────────────────────┘
```

El **mosaic de portada** (4 `imageSmall` en un collage) es el salto visual más grande
de la pantalla. Requiere backend (ver §6): hoy no hay `coverImageUrl` y traer 4
items por colección es un N+1, que `AGENTS.md` prohíbe.

**`/colecciones/[id]`**

```
┌──────────────────────────────────┐
│  ←      Mi collection        (⚙) │  ScreenHeader
├──────────────────────────────────┤
│ ┌──────────────────────────────┐ │
│ │ ▣  Total Cards: 24           │ │  CollectionSummary
│ │    Tu colección     VALOR     │ │  2 columnas
│ │                   $29.850    │ │  text-display text-positive
│ └──────────────────────────────┘ │
│ (Todas)(Duplicadas)(Sets)(Trade) │  Chips, aria-pressed
│ ┌──┐┌──┐┌──┐                     │  3 col, sin labels
│ │  ││  ││  │                     │  el nombre va al tile detail
│ └──┘└──┘└──┘                     │
│ │+2││  ││  │                     │  badge de cantidad DEBAJO
│ └──┘└──┘└──┘                     │
│           [ Cargar más ]         │
│ ┌──────────────────────────────┐ │
│ │ 48 cartas · $29.850    (+)   │ │  Barra fija: total + FAB
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

| Cambio | Detalle |
|---|---|
| `CollectionSummary` (nuevo) | `Surface` con 2 columnas: tile de ícono `rounded-control bg-brand-soft text-brand` + título/subtítulo, y a la derecha `overline text-tertiary` "VALOR" + `text-display text-positive tabular-nums`. Es literalmente la referencia. |
| `CardTile` denso (nuevo modo `compact`) | Solo la imagen + badge de cantidad circular abajo. 3 columnas. El nombre va en la `Sheet` de detalle, no en el grid. |
| Chips de filtro | Todas / Duplicadas / Sets / Para intercambio. **"Para intercambio" pasa a ser server-side** (o sale de la lista paginada y pasa a ser un filtro global de la colección) — se arregla el bug del filtro client-side. |
| Sort | `StatRow` o `Chip` con un `Popover`: por valor, por fecha, por nombre, por cantidad. |
| `ItemActions` | `Sheet` con `Field`, thumbnail grande, y las stats en `Stat` de a 2 (nunca 5 en 2 columnas). |
| Barra inferior fija | `z-nav`, `bg-surface/90 backdrop-blur`, total de la colección + `IconButton` de `Plus`. Reemplaza al FAB absoluto por card. |
| `RenameForm` | Se reescribe sin el `setState` en el cuerpo del render (el patrón fragile de `gotchas.md` #12). Pasa a un `Sheet` con un `Field`. |
| `renderItemAction` | El botón circular de engranaje por card desaparece: tap en el tile abre la `Sheet`. Un objetivo de toque menos. |

**Criterios de aceptación**
- [ ] El filtro de intercambio no muestra "0 resultados" teniendo cartas.
- [ ] El total de la barra inferior coincide con el de la `CollectionSummary`.
- [ ] El grid de colección a 390 px es de 3 columnas y las imágenes no se deforman.
- [ ] 200 cartas scrollean sin jank en un iPhone de gama media.

---

### Fase 6 — Progreso por set / binder *(la funcionalidad nueva)*

Único bloque que **agrega** algo que no estaba. Es lo que convierte "una lista de
cartas" en "una colección".

**`/colecciones/[id]` → chip "Sets"**, o ruta propia `/colecciones/[id]/sets`.

```
Vista 1 — progreso por set
┌──────────────────────────────────┐
│  ←       Progreso por set        │
├──────────────────────────────────┤
│  ┌────────────────────────────┐  │
│  │ [symbol]  Base Set         │  │  SetDto.symbolUrl
│  │           24 / 102  ●●●●  │  │  anillo o barra de progreso
│  │           $1.240   24%    │  │  valor + porcentaje
│  └────────────────────────────┘  │
│  ┌────────────────────────────┐  │
│  │ [symbol]  Sword & Shield  │  │
│  │            0 / 84          │  │  set sin cartas: atenuado
│  └────────────────────────────┘  │
│  ┌────────────────────────────┐  │
│  │ [symbol]  Neo              │  │
│  │           12 / 108         │  │
│  └────────────────────────────┘  │
│  ┌────────────────────────────┐  │
│  │ [symbol]  Stellar Crown    │  │  el logo del set (logoUrl)
│  │            0 / 107  Come…  │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

**Vista 2 — binder / faltantes**

```
┌──────────────────────────────────┐
│  ←        Base Set          (☰)  │
├──────────────────────────────────┤
│  24 / 102  ·  $1.240  ·  24%     │
│  ┌───┐┌───┐┌───┐┌───┐┌───┐      │
│  │ 1 ││ 2 ││ 3 ││ 4 ││ 5 │      │  slot 4 lleno = tu carta
│  └───┘└───┘└───┘└───┘└───┘      │  slot 3 vacío = contorno punteada
│  ┌───┐┌───┐┌───┐┌───┐┌───┐      │  + nº de carta adentro
│  │ 6 ││ 7 ││ 8 ││ 9 ││10 │      │
│  └───┘└───┘└───┘└───┘└───┘      │
│  (Todas)(Faltantes)(Duplicadas)  │
└──────────────────────────────────┘
```

**El slot vacío** es la pieza de diseño clave: `rounded-surface border-2 border-dashed
border-line bg-surface-2`, con el **número de carta** en `text-caption
text-tertiary tabular-nums` adentro. Cuando tenés la carta, es un `CardTile`. Cuando
tenés duplicados, un badge `x2` en `text-positive`.

**Depende de backend** (ver §6):

| Necesario | Endpoint |
|---|---|
| Aggregate por set de una colección | `GET /api/collections/:id/set-progress` |
| Lista completa de un set (para el binder) | `GET /api/sets/:id/cards` |

Sin el primero, la Vista 1 no existe. La Vista 2 se puede construir con
`/cards/search?setId=` paginado, pero para sets de 300+ cartas eso son 3 requests
mínimos: el endpoint dedicado es lo correcto.

**Criterios de aceptación**
- [ ] La lista de sets está ordenada por valor primero, luego por porcentaje.
- [ ] Un set sin cartas aparece y es distinguible de un set que no está en la colección.
- [ ] El binder con 300 slots scrollea bien.
- [ ] Tocar un slot lleno abre el `ItemActions`; uno vacío abre la ficha de la carta
      con "Añadir a colección".
- [ ] La URL del filtro es compartible y sobrevive a un refresh.

---

### Fase 7 — Perfil, auth, share, home, PWA

| Pantalla | Cambio |
|---|---|
| **`/perfil` → `/ajustes`** | Se renombra la tab a **"Ajustes"** (la referencia dice "Settings"). Redirect `permanent: true` desde `/perfil`. Secciones: Identidad (con `avatarUrl` real, hoy hardcodeada la inicial) · Moneda · **Apariencia** (nuevo: Sistema / Claro / Oscuro) · Enlaces compartidos · Sesión. |
| **`/login` / `/registro`** | Se quedan en `/` con un `Button` de ancho completo, `Field` en todo, y **toggle de mostrar contraseña** (falta). Se les agrega `title` propio y OG image. El CTA de la home deja de mandar a `/buscar`. |
| **`/` home** | Canvas claro, `display` gigante, 3 feature cards con ícono de lucide, mock de la app en desktop y stacked en mobile, y un footer con link a `/share`. El CTA "Empezar a escanear" va a **`/escanear`**. Secondary CTA "Explorar el catálogo" a `/buscar`. |
| **`/share/[slug]`** | Se queda **fuera de `(app)`** (es pública, no lleva `BottomNav`). Canvas claro, header con `avatarUrl` del owner, `CollectionSummary`, grid de 3 col, y footer de marca con CTA a instalar la PWA. `ShareLinkCard` del perfil pasa a `Surface` + `Stat` + `Button`. Arreglo: **"Revocado" y "Desactivado" hoy se ven igual** (`share-utils.ts`) → se distinguen por tono y por qué acción queda habilitada. |
| **PWA** | `share_target` con deep link a `/carta/[id]`, `screenshots` para el store, íconos regenerados con `scripts/generate-icons.mjs` para el nuevo logo. |

**Criterios de aceptación**
- [ ] El toggle de tema persiste entre recargas y entre pestañas.
- [ ] `/perfil` redirige a `/ajustes` con 308.
- [ ] "Revocado" ≠ "Desactivado" en la lista de enlaces, y la acción correcta
      aparece en cada estado.
- [ ] `/share/[slug]` se ve igual sin sesión que con sesión.
- [ ] El deep link del `share_target` abre la ficha correcta.

---

### Fase 8 — Limpieza

Última fase, y es obligatoria.

- [ ] Borrar `components/scanner/icons.tsx` (7 iconos a mano) y los 15 SVG inline.
- [ ] Borrar `FormField`, `FormAlert`, `SubmitButton` (reemplazados por `Field`,
      `Button`).
- [ ] Borrar `ModalShell` (reemplazado por `Sheet`), `pagination.tsx` (si ya no se usa
      salvo en `/share`), `PriceCell`.
- [ ] Borrar `Notice` y `ResultFooter` locales de `escanear/page.tsx` (→ `Alert`).
- [ ] **0 ocurrencias** de `slate|zinc|neutral|gray|stone|red|rose|emerald|amber|sky|blue|green` como
      clase de color, y de `text-[Npx]` salvo los valores justificados en el
      design system. El script de la Fase 0 lo verifica.
- [ ] Los 5 archivos `probe-*.ts` de la raíz de `frontend/` (no declarados en ningún
      lado, parecen scratch): decidir si se borran.
- [ ] Actualizar `docs/`: `design-system.md` (ya v2), `components.md`, `routes.md`,
      `gotchas.md` (los bugs 1–15 de la lista de arriba: marcar los resueltos),
      `scanner.md`.
- [ ] Auditoría de a11y: `Tab` completo por todas las rutas en ambos temas, foco
      visible, contraste AA, `prefers-reduced-motion`.
- [ ] Barrido de `console.log` / `eslint-disable` justificados.

---

## 5. Qué se borra

| Archivo | Razón | Lo reemplaza |
|---|---|---|
| `components/scanner/icons.tsx` | 7 SVG a mano | `lucide-react` |
| `components/auth/form-controls.tsx` | `FormField` / `FormAlert` / `SubmitButton` reimplementan `Field` / `Alert` / `Button` | `components/ui/*` |
| `components/collections/modal-shell.tsx` | Sin portal, sin `inert`, sin animación, sin título integrado | `components/ui/sheet.tsx` |
| `components/ui/pagination.tsx` | Reemplazado por "Cargar más" (se conserva en `/share`) | `use-infinite-list.ts` |
| `app/globals.css:22-26` | El `body {}` que pisa Tailwind | Los tokens de §1 |
| `.pwa-hide-in-standalone` / `.pwa-content-inset` | Causaron el bug de navegación en PWA | `BottomNav` siempre visible |
| `html[data-offline]` CSS | Empujaba el layout | `Toast` |
| `lib/collections/collection-options.ts` (labels) | Tres tablas de labels que no coinciden | `lib/variants.ts` |

---

## 6. Trabajo de backend

La regla de `AGENTS.md` §1: **si tocás un DTO, actualizá `frontend/types/api.ts` en el
mismo commit.**

### 6.1 Necesario para el rediseño (bloqueante)

| # | Cambio | Para qué | Esfuerzo |
|---|---|---|---|
| B1 | `SearchCardsDto`: agregar `searchBy: 'name' \| 'number' \| 'artist'` | Los 3 chips del buscador | Bajo. `cards.service.ts:170` cambia un `WHERE` |
| B2 | `SearchCardsDto`: `sort: 'price'` es un **no-op silencioso** (`cards.service.ts:421-430` cae en `name`) | Ordenar la colección y la búsqueda por valor | Bajo. Falta el `LEFT JOIN` a `card_prices` |
| B3 | `SearchCardsDto`: `direction: 'asc' \| 'desc'` | "Más caras primero" | Muy bajo |
| B4 | `SetDto` ya trae `logoUrl` y `symbolUrl` | Set progress y ficha de carta | **Ya está, solo hay que usarlo** |
| B5 | `CardDto` ya trae todo lo necesario | Highlights de OCR | **Ya está** |
| B6 | `ListItemsDto`: agregar `forTradeOnly` | Arreglar el filtro client-side | Muy bajo |

### 6.2 Necesario para set progress (Fase 6)

| # | Cambio | Detalle |
|---|---|---|
| B7 | `GET /api/collections/:id/set-progress` | Un `$queryRaw` con `DISTINCT ON` siguiendo el estilo de `collections.service.ts:559-576` (que ya usa raw SQL + `DISTINCT ON`, hay precedente). Devuelve `[{ setId, owned, total, valueUsd, valueArs, missingCount }]`, ordenado por valor. `latestPriceJoin()` es reutilizable tal cual. |
| B8 | `GET /api/sets/:id/cards` | Lista completa de un set para el binder. Evita 3 requests paginados contra `/cards/search?setId=`. |

### 6.3 Opcionales (dejan features enteras afuera)

| # | Cambio | Unlockea |
|---|---|---|
| B9 | `CollectionDto`: `cover: [{ imageSmall, cardId }]` (3 items) | El mosaic de portada de `/colecciones`. **Un** query agregado, no un N+1 |
| B10 | `PriceDto`: `change30d: { absolute, percent }` | El `PriceDelta` real de la referencia. `card_prices` es append-only: el `DISTINCT ON` de `fetchedAt` da el valor de hace 30 días sin tabla nueva |
| B11 | `IdentifiedCandidateDto.matchedText` — **ya está, nunca se usó** | Resaltar qué matcheó el OCR |

> **B10 es interesante**: `card_prices` ya es append-only y no tiene job de poda
> (`sync-prices.service.ts:243`), así que el histórico de 30 días sale de un
> `DISTINCT ON (cardId, variant) ... WHERE fetchedAt <= now() - 30 days`. No hace
> falta ninguna tabla nueva. Pero **no es gratis**: es un nuevo query por cada carta
> que se muestra en la home, y eso multiplica la carga. Por eso queda para después.

### 6.4 No se pide (fuera de alcance)

Histórico completo para gráficos, favoritos, wishlist, print runs, ratings, social.
Cada uno es una tabla y una decisión de producto, no un rediseño.

---

## 7. El rate limit y el chip de precio del scanner

**Esto es lo más importante de leer antes de la Fase 4.**

`AGENTS.md` §3.1: pokemontcg.io v2 sin key, **1.000 requests/día, 30/min**, cola en
background con 2,3 s entre requests. El chip de precio flotante de la referencia
**no puede** implementarse pidiendo precios al vuelo mientras se encuadra la carta.

**Regla dura para la Fase 4:**

1. El chip **nunca** dispara un fetch a pokemontcg.io. Lee de
   `CardPrice` (Postgres, ya espejado, cacheado 24 h) o del cache Redis de 1 h.
2. Se identifica **una sola vez** por captura, no por frame. El loop de cámara no
   habla con la red.
3. Para el preview se usa la fila de precio que **ya existe** en la respuesta de
   `/identify` (`IdentifiedCandidateDto.price`). Si no hay, el chip no aparece.
4. Un contador local: como máximo **1 request a `/api/cards/identify` por 2,5 s**, y
   el debounce se sube si la cola está llena.

El chip es decorativo sobre una fila que ya está en la respuesta. Si algún día se
quiere "precio en vivo mientras encuadro", es una feature de backend con su propio
cola, y en otra fase.

---

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| **Reescribir 33 componentes a la vez rompe todo** | 8 fases mergeables. Fase 0 no cambia un solo componente existente. Cada fase pasa `pnpm run check`. |
| **El `Select` custom es difícil de hacer bien** | Es la única pieza con riesgo real de a11y. Se puede arrancar con `<select>` estilizado y diferir el listbox. |
| **Doble tema duplica el trabajo visual** | Los colores son tokens desde la Fase 0. Ningún componente escribe un color crudo, así que el dark sale solo. Solo los SVG con `fill` hardcodeado hay que revisarlos. |
| **Los skeletons quedan desalineados** si se rediseña la pantalla y no el `loading.tsx` | Regla: **toda fase que cambia una pantalla cambia su `loading.tsx` en el mismo commit.** El skeleton tiene la forma real del contenido, no aproximada. |
| **`card_prices` es append-only sin poda** | `B10` es opcional justamente por esto. Si se activa, se agrega retención. |
| **StrictMode monta efectos dos veces** | `gotchas.md` #1: la cámara se rompe con doble montaje. Toda la lógica de sesión de escaneo sigue con el patrón de `runIdRef` que ya está. |
| **El bundle crece** con `lucide-react` | Se importa **named**, nunca el barrel completo, y `next.config` ya tiene `optimizePackageImports`. Se verifica con el analyzer en la Fase 8. |
| **Scope creep a Favoritos / Wishlist** | No entran. Si entran, son fases nuevas **después** de la 8, con su propio contrato. |

---

## 9. Verificación

Nada está terminado sin esto en verde:

```bash
pnpm run check     # lint + typecheck + tests + build, los dos proyectos
pnpm run dev       # flujo real contra el stack
```

Y en cada fase, además:

- [ ] A **390 × 844** (iPhone 14), **768** (iPad portrait) y **1440** (desktop).
- [ ] En **los dos temas**.
- [ ] Con `prefers-reduced-motion: reduce`.
- [ ] **Teclado solamente**: Tab, Shift+Tab, Enter, Escape, flechas en el `Select`.
- [ ] Con el **lector de pantalla** en al menos un flujo completo (escanear → agregar).
- [ ] **PWA instalada**, no solo browser (es el gap que se arregla en la Fase 1).
- [ ] Con **DevTools en Slow 3G** y offline: el estado de cada pantalla es usable.
- [ ] Con el **umbral de contraste** de DevTools, ≥ 4.5:1 en todo texto.

**Sobre tests de componentes:** hoy hay 0 (`vitest` solo cubre `lib/scanner/**`, que
es lógica pura). Agregar `@testing-library/react` + `jsdom` para testear las
primitivas nuevas es recomendable pero **requiere tu OK** (no estaba en el paquete de
dependencias que aprobaste). Sin eso, la Fase 8 depende de verificación manual.
Decidilo antes de arrancar la Fase 0.

---

# 10. Estado verificado

> Este documento se escribió como plan, cuando la app nueva convivía con la
> anterior bajo `/v2`. Lo que sigue es lo que **realmente se hizo**, verificado
> contra el árbol. No es un backlog abierto: las fases están hechas y el flip
> ocurrió.
>
> Los paths de la columna "dónde quedó" son los **de hoy**, después del flip. Donde
> el texto de las fases dice `/v2/…` o `components/v2/…`, está describiendo el
> estado de ese momento y no el actual.

## 10.1 Las 8 fases

| Fase | Estado | Dónde quedó |
|---|---|---|
| **0 — Cimientos** | ✅ Hecha | `app/globals.css` (tokens, tema claro/oscuro, `prefers-reduced-motion`), `lib/cn.ts`, `lib/theme.tsx`, `lib/theme-script.ts`, `lib/variants.ts`, `lib/pokemon.ts`, `lib/select-utils.ts`, `hooks/use-async.ts`, `hooks/use-infinite-list.ts`, `scripts/check-no-raw-colors.mjs`, y las 27 primitivas de `components/ui/`. |
| **1 — Chrome de la app** | ✅ Hecha | `components/layout/` (`AppShell`, `PlainShell`, `ScreenHeader`, `ScreenContainer`, `BottomNav`, `OfflineToast`), `error.tsx` y `not-found.tsx` por rama. **La `BottomNav` ya no desaparece en standalone** y la cámara es `z-media` (arriba de la nav). |
| **2 — Buscar** | ✅ Hecha | `components/search/`, `cards/`, `Chip` de filtros, "Cargar más", `PriceChip`. Los tres modos de búsqueda están habilitados, y el `sort` con `price` y la `direction` se piden desde la URL. Ver B1–B3 abajo. |
| **3 — Ficha + precios** | ✅ Hecha | `prices/price-hero.tsx`, `price-delta.tsx`, `price-table.tsx` (filas en mobile, tabla en `lg:`), `SetDto.logoUrl` y `symbolUrl` en uso, "Otras de este set", `app/(app)/carta/[id]/actions.tsx`. |
| **4 — Escanear** | ✅ Hecha | `components/scanner/` completo: frame, action bar, controles, chip de precio, barra de carta detectada, `matchedText` resaltado, sesión por lotes con `Organize (N)`. El chip de precio **no pide nada**: lee la fila de la respuesta de `identify`. |
| **5 — Colecciones** | ✅ Hecha | `components/collections/`: `CollectionSummary`, grid denso con mosaico de portada, `CollectionBottomBar`, sheets de alta/renombre/ítem, orden por precio y filtro de intercambio **server-side**. Ver B6 y B9 abajo. |
| **6 — Set progress / binder** | ✅ Hecha **con backend** | `components/set-progress/` completo (Vista 1 y binder, troceado en 60, `matched` de B11), corriendo sobre `API_SET_PROGRESS_SOURCE`. B7 y B8 **están implementados** y el fallback fue eliminado. Ver §10.2. |
| **7 — Perfil, auth, share, home, PWA** | ✅ Hecha | `/ajustes` con las 5 secciones, redirect 308 desde `/perfil`, toggle de tema, `PasswordInput` en los dos formularios, home con hero y mock, `PublicCollectionView`, `shareLinkStatus` con los cuatro estados, `InstallCta`. |
| **8 — Limpieza y flip** | ✅ Hecha | Se borró la app anterior y con ella la deuda del `body {}` de `globals.css` y las clases `.pwa-hide-in-standalone` / `.pwa-content-inset`. **`check-no-raw-colors.mjs` está enganchado a `pnpm run lint`** y sus raíces son hoy `app`, `components`, `lib` y `hooks`. Los `probe-*.ts` de la raíz de `frontend/` que este plan mencionaba ya no están. |

**Lo que sigue abierto de la Fase 0:** nada. `@testing-library/react` + `jsdom`
ya están instalados y hay tests de las primitivas a11y-sensitive: el focus trap
del `Sheet`, el `aria-activedescendant` del `Select`, el `aria-labelledby` del
`Field`, y las de `Button`, `Switch`, `Divider` y `SegmentedControl`. El
inventario real está en [`testing.md`](testing.md).

## 10.2 El trabajo de backend

### Hecho y usado

| # | Cambio | Estado |
|---|---|---|
| B4 | `SetDto.logoUrl` y `symbolUrl` | ✅ En uso en la ficha (`app/(app)/carta/[id]/page.tsx`) y en el set progress. |
| B5 | `CardDto` alcanza para los highlights de OCR | ✅ `matchedText` se muestra en `components/scanner/matched-text.tsx`. |
| B11 | `IdentifiedCandidateDto.matchedText` | ✅ En uso. Era un campo muerto. |
| B7 | `GET /api/collections/:id/set-progress` | ✅ **Implementado.** `collections.controller.ts::getSetProgress` + `collections.service.ts::getSetProgress` con el `$queryRaw` y `DISTINCT ON`. `SetProgressDto` está en `types/api.ts`. |
| B8 | `GET /api/sets/:id/cards` | ✅ **Implementado.** `cards/sets.controller.ts` (`@Get(':id/cards')`) + `cards.service.ts`. `SetCardsResponseDto` está en `types/api.ts`. |
| B1 | `SearchCardsDto`: `searchBy: 'name' \| 'number' \| 'artist'` | ✅ **Backend y frontend hechos.** Los tres chips de `search-controls.tsx` están `available: true` y `catalog-search.tsx` manda el `searchBy` que corresponde. Ojo: `number` matchea por **igualdad** (el `4` no trae el 40 ni el 104). |
| B2 | `sort: 'price'` | ✅ **Backend y frontend hechos.** `catalog-search.tsx` manda `sort` y `direction` desde la URL, y `SearchControls` expone los cuatro criterios y el sentido dentro del `Sheet` de filtros. Con texto en el input el control se apaga y se explica, porque el backend ignora el orden cuando hay `q`. |
| B3 | `direction: 'asc' \| 'desc'` | ✅ **Backend y frontend hechos.** Vive en el mismo `SegmentedControl` del `sort`, con la misma regla: **con `q` se ignora** (el score de relevancia no es invertible), así que ambos controles se deshabilitan mientras el input tenga texto. |
| B6 | `ListItemsDto`: `forTradeOnly` | ✅ **Backend y frontend hechos.** `collection-detail.tsx` pasa el flag a `listItems`, ya no hay `.filter()` en el cliente y el `Alert` de honestidad se borró. El filtro compone con `duplicatesOnly` en el mismo `where`, y el `count` usa el mismo filtro. **Consecuencia**: una respuesta vacía con filtro puesto ahora significa "no hay en la colección" y no "no hay entre lo cargado", así que los vacíos se separan por filtro activo y no por `items.length`. |
| B9 | `CollectionDto`: `cover: [{ imageSmall, cardId }]` | ✅ **Backend y frontend hechos.** `collections-screen.tsx` pasa `collection.cover` a `CollectionCard`, que ya tenía el mosaico escrito. El backend lo arma con un `$queryRaw` agregado (no un N+1). El fallback de marca queda solo para la colección sin cartas, que es el único caso en que `cover` llega `[]`. |

**B2, B3, B6 y B9 están las cuatro cerradas.** Lo que queda de esta lista es
B10, y es la única que empezó desde cero.

### B10 — `PriceDto`: `change30d`

**Hecho, en los dos lados.** `PriceHistoryDto` y el `change` de `PriceDto`
existen en el contrato, el backend los agrega con un `DISTINCT ON
(fetchedAt::date)` sobre el índice que `card_prices` ya tenía, y el frontend
muestra el sparkline, el `PriceDelta` real y el texto de cuántos días hay.

Lo que **no** se hizo, y sigue pendiente: el segundo paso de P6.1, que es el
histórico **por colección** ("tu colección subió $47 este mes"). El endpoint
individual ya no gasta una sola request del presupuesto externo —sale del
índice de Postgres—, pero el agregado por colección sí necesita decidir qué
pasa con las cartas sin precio.

## 10.3 El flip

**Hecho.** La app nueva es la única versión del frontend. El detalle de qué quedó
dónde está en el bloque de ESTADO de arriba; el razonamiento de por qué se hizo de
golpe y no por ruta está en
[`docs/decisions.md`](../../docs/decisions.md) §19.

Las tres cosas que el flip dejó sueltas y que valen como deuda conocida:

1. **Los espacios en los template literals.** Sacar `V2_BASE` dejó `` href: ` /buscar` ``
   en tres lugares y `${origin} /share/…` en las dos URLs que se comparten. No lo
   detecta el typecheck, ni el build, ni el linter. Está documentado en
   [`gotchas.md`](gotchas.md) §23.
2. **El `body {}` de `globals.css`.** La regla que quedó (fondo por token, no por
   clase) está en `globals.css` con su comentario; el porqué está en
   [`gotchas.md`](gotchas.md) §11 y §H.1.
3. **Los `robots: noindex` se borraron**, y con ellos la última deuda de SEO de la
   estrategia "en paralelo". `/share/[slug]` quedó indexable, que es lo que
   corresponde ahora que es la única URL de ese contenido.
