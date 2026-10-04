# Inventario de componentes

27 primitivas en `components/ui/` y 13 carpetas alrededor. Este documento es el
índice de **qué existe, qué hace y por qué está hecho así**. Para *cómo se
construye* el sistema está [`design-system.md`](design-system.md) (tokens, reglas,
anti-patrones) y para *cómo se trabaja acá* está
[`build-guide.md`](build-guide.md).

**No hay dos versiones de la app.** Esto inventaría la que se ve: `components/` es
la carpeta de componentes del frontend y estos son los que existen. El historial
de la app anterior está en [`redesign-2026.md`](redesign-2026.md) (el plan) y en
§14 de [`design-system.md`](design-system.md) (qué convenciones se conservaron).

Salvo que se diga lo contrario, un componente **sin** `'use client'` se puede
renderizar en un Server Component. Convención de nombres: un componente por
archivo, `kebab-case` en el nombre de archivo y `PascalCase` en el export. Los
`.ts` son hooks y módulos de datos puros.

Las carpetas con `index.ts` exports (barrel): importá de `@/components/<carpeta>`,
no del archivo suelto. `layout/`, `cards/`, `search/` y `set-progress/` **no**
tienen barrel: de esos se importa el archivo.

**Nota de notación:** este documento sigue comparando contra *"la v1"* en varios
lugares, y ahí "la v1" es **la app anterior** (la de `slate-*`, `TopBar` y
`ModalShell`), no una segunda versión que exista. Las comparaciones están porque
explican por qué algo es como es; el código al que apuntan ya no está.

**Disclaimer sobre números de línea**: las referencias apuntan a **archivo +
símbolo + fragmento de código**, que es lo que no se mueve. Cuando el archivo y el
símbolo están citados, la afirmación es verificable con un grep.

---

## Índice

| Carpeta | Qué hay | Punto de entrada |
|---|---|---|
| `nav.ts` | `NAV_ITEMS`, `isNavItemActive` | `NAV_ITEMS` |
| `ui/` | 27 primitivas, sin datos de pantalla | `components/ui/index.ts` |
| `layout/` | `AppShell`, `PlainShell`, `ScreenHeader`, `ScreenContainer`, `BottomNav`, `OfflineToast` | `AppShell` |
| `cards/` | `CardTile`, `CardGrid`, `Money`, `ShowOrDash` | `CardGrid` |
| `search/` | `CatalogSearch` y sus controles | `CatalogSearch` |
| `scanner/` | cámara, frame, action bar, resultados, organización | `CameraView` + `app/(app)/escanear/page.tsx` |
| `collections/` | lista, detalle, summary, sheets de ítem y de colección | `CollectionsScreen` / `CollectionDetailScreen` |
| `set-progress/` | progreso por set y binder | `SetProgressScreen` |
| `prices/` | `PriceHero`, `PriceDelta`, `PriceTable`, `CardPriceSection` | `CardPriceSection` |
| `settings/` | identidad, apariencia, moneda, sesión, `RequireAuth` | `RequireAuth` + las 5 secciones |
| `share/` | enlaces del usuario, vista pública, `InstallCta` | `PublicCollectionView` / `ShareLinksSection` |
| `auth/` | `AuthShell`, `LoginForm`, `RegisterForm` | `AuthShell` |
| `home/` | inicio PWA: reanudación, mock y CTA de sesión | `app/(app)/inicio/page.tsx` (server) |
| `marketing/` | landing pública, planes y FAQ | `app/(marketing)/page.tsx` (server) |
| `brand/` | `AppMark` | `AppMark` |

---

# 0. La convención de ubicación

La regla de [`build-guide.md`](build-guide.md) §2:

> Un componente va a `ui/` **solo si no depende de datos de una pantalla**. Si
> depende de `CardDto`, va a `cards/`. Si depende de `CollectionItemDto`, va a
> `collections/`.

**Por qué la regla existe.** `ui/` es el design system: son primitivas que se
reusan en toda la app y que no conocen el dominio. La frontera no es
estilística, es de dependencia. Si un componente de `ui/` importara `CardDto`,
entonces:

1. **El `Skeleton` dejaría de ser agnóstico.** `CardGridSkeleton` (que vive en
   `ui/skeleton.tsx` y dibuja la grilla de cartas) tendría que importar la forma
   de una carta. Hoy define sus propias dos grillas en una constante local
   (`GRIDS` en `skeleton.tsx`) en vez de importarlas de `cards/card-grid.tsx`, y
   está escrito por qué: *"el skeleton no puede importar de un componente de
   `cards/` sin que un placeholder conozca del dominio de la carta"*
   (`cards/card-grid.tsx`, JSDoc de las grillas duplicadas).
2. **El tipado del `cn()` y de la escala de colores se contaminaría.** El
   `tailwind-merge` extendido de `lib/cn.ts` ya es una pieza que depende de las 10
   clases `text-*` de la escala tipográfica; agregarle DTOs lo vuelve imposible de
   testear en aislamiento.
3. **La regla de "no edites `ui/` salvo que falte algo" se vuelve inaplicable.**
   Un componente que depende de `CardDto` cambia cuando cambia el contrato, y
   `AGENTS.md` §1 obliga a actualizar `types/api.ts` en el mismo commit. Eso
   metería al design system en el ciclo de cambio del contrato.

Lo que **sí** se comparte es lo que no depende de datos: `toCardGridEntries`
acepta `CardDto[]` y vive en `cards/`, no en `ui/`, por la misma razón. Y
`PriceHero` está en `prices/` aunque sea visualmente una primitiva, porque su
`usd` viene de `PriceDto`.

**Corolario que se viola a diario:** `useFieldA11y` es un hook que vive en
`ui/field.tsx` y devuelve un objeto de props. Es la excepción que hace posible
todo el patrón de `Field` (ver §1.3 de este doc): si el hook estuviera en otro
lado, `ui/` importaría de la carpeta de pantalla y la regla se rompe igual.

---

# 1. Las 27 primitivas de `components/ui/`

| # | Archivo | Tipo | Qué hace |
|---|---|---|---|
| 1 | `alert.tsx` | server | Aviso de 5 tonos × 2 tamaños. Reemplaza las 9 variantes de la v1. |
| 2 | `avatar.tsx` | server | `next/image` cuadrada con fallback de iniciales. |
| 3 | `badge.tsx` | server | Chip no interactivo de 20 px, `text-overline`. |
| 4 | `button.tsx` | server | `primary`/`secondary`/`ghost`/`destructive`/`inverse` × `sm`/`md`/`lg`/`icon`. |
| 5 | `checkbox.tsx` | **client** | Checkbox nativo de 20×20 con tercer estado `indeterminate`. |
| 6 | `chip.tsx` | server | Pill de filtro (`aria-pressed`) o de contenido (con `tone`). |
| 7 | `divider.tsx` | server | `<hr>`, separador vertical o fila con label. |
| 8 | `empty-state.tsx` | server | `kind="first-use"` vs `kind="no-results"`. |
| 9 | `error-state.tsx` | server | Montado sobre `Alert tone="error"`, con `RetryButton`. |
| 10 | `field.tsx` | server | Label + hint + error. Exporta `useFieldA11y`. |
| 11 | `icon-button.tsx` | server | Ícono + `aria-label` obligatorio. |
| 12 | `input.tsx` | server | El input del sistema, con `leadingIcon` y `trailingSlot`. |
| 13 | `password-input.tsx` | **client** | `Input` + toggle de visibilidad. |
| 14 | `progress.tsx` | server | `Progress` (`progressbar`) y `Meter` (confianza, `role="img"`). |
| 15 | `segmented-control.tsx` | server | 2–4 opciones excluyentes, `role="group"` + `aria-pressed`. |
| 16 | `select-option-list.tsx` | **client** | El `role="listbox"` + `role="option"`, extraído del `Select`. |
| 17 | `select-search-sheet.tsx` | **client** | `useSelectSearch` + `SelectSearchInput` para filtros con muchas opciones. |
| 18 | `select.tsx` | **client** | Listbox propio, portal a `body`, `aria-activedescendant`. |
| 19 | `sheet.tsx` | **client** | Bottom sheet en mobile, diálogo en `sm:`. Pila de overlays. |
| 20 | `skeleton.tsx` | server | Placeholder con `shimmer` + `CardGridSkeleton`. |
| 21 | `spinner.tsx` | server | El único spinner de la app. |
| 22 | `stat.tsx` | server | `Stat`, `StatValue` y `StatGrid` con la regla del huérfano. |
| 23 | `stat-row.tsx` | server | Fila label-izq / valor-der / chevron, en 4 modos semánticos. |
| 24 | `surface.tsx` | server | `bg-surface` + `border-line` + `shadow-sm`. |
| 25 | `switch.tsx` | **client** | Toggle de 44×26 controlado, `role="switch"`. |
| 26 | `textarea.tsx` | **client** | Multilínea con contador de `maxLength`. |
| 27 | `toast.tsx` | **client** | `ToastProvider` + `useToast`, portal a `body`. |

9 llevan `'use client'` y 18 son server-safe. Barrel en `index.ts`: **importá
siempre de `@/components/ui`**, no del archivo suelto.

Las primitivas que se documentan a fondo abajo, porque su comportamiento no es
deducible de la firma: **`Sheet`**, **`Select`**, **`Field` + `Input`**,
**`StatGrid`**, **`Toast`**, **`Skeleton`** y **`SegmentedControl`**. El resto
tiene la tabla de arriba y el JSDoc del archivo.

---

## 1.1 `Sheet` — `ui/sheet.tsx`

Es el componente con más comportamiento no obvio de la app. Siete decisiones que
no se deducen de la firma:

```ts
<Sheet open onClose title subtitle footer size="sm|md|lg|full">
  <Sheet.Header action={…} />   // opcional, el componente lo pone si falta
  <Sheet.Body bleed>…</Sheet.Body>
  <Sheet.Footer>…</Sheet.Footer>
</Sheet>
```

No hay `titleId` como prop: el `id` del `<h2>` lo genera el componente
(`${useId()}-title`) y el `aria-labelledby` del diálogo apunta ahí. La v1
obligaba a que el hijo pusiera el id a mano y por eso tenía tres copias del
header con el mismo SVG inline.

### La pila de `OpenLayer`

El archivo tiene un array de módulo (`const openLayers: OpenLayer[] = []`) y
funciones sueltas `registerLayer` / `unregisterLayer` / `topLayer`. El
comentario de bloque explica el porqué:

> *"el scroll lock y el `inert` son de la capa, no del componente: por eso viven
> acá y no en el `useEffect` del `Sheet`. Con un booleano por componente, dos
> sheets anidados se desbloquean mal entre sí (el que cierra primero saca el lock
> del que sigue abierto); con una pila, el lock se devuelve recién cuando la pila
> queda vacía."*

Consecuencia práctica: `registerLayer` **cierra el sheet anterior** si hay uno
abierto con un token distinto (§8.9: "solo un `Sheet` abierto a la vez"). El
`token` es el `useId()` de la instancia, y por eso el doble montaje de
`StrictMode` no se cierra a sí mismo: las dos pasadas comparten token.

### El `inert` con snapshoteo de valores previos

`applyInert()` recorre `document.body.children` y pone `inert = true` +
`aria-hidden="true"` en todo lo que no sea el contenedor de una capa abierta.
Dos detalles que hacen que funcione:

1. **Es idempotente.** Antes de escribir, guarda el valor original del elemento
   en `inertSnapshot` (un `Map`), y solo si no estaba ya. Sin esa guarda, el
   doble montaje de `StrictMode` sobrescribiría el snapshot con `inert: true` y
   al cerrar quedaría el resto del documento permanentemente inerte.
2. **`restoreInert()` devuelve el valor exacto que había**, incluido el
   `aria-hidden` ausente vs. presente: si el `ariaHidden` anterior era `null` se
   hace `removeAttribute`, si no, se restaura el string.

### El focus trap con `capture: true`

El listener se registra en `document`, no en el panel:

```ts
document.addEventListener('keydown', handleKeyDown, true);
```

Con `capture: true` el handler corre en la fase de captura, **antes** de que el
evento llegue a cualquier listener del panel o de un hijo. Eso es lo que hace
que el trap sea efectivo frente a un `stopPropagation` de un control interno. La
primera línea del handler es una guarda de pertenencia:

```ts
if (topLayer()?.token !== layerToken) return;
```

O sea: **el trap de un sheet que quedó debajo de otro en la pila no responde
teclas**. Sin esa guarda, dos sheets abiertos a la vez se pelearían el `Tab`.

El trap además cubre el foco que se fue por otro lado: la condición es
`!inside || active === last` para `Tab` y `!inside || active === first` para
`Shift+Tab`. El `!inside` es el que recupera el foco si un click en otro overlay
o un `autofocus` se lo llevó. Si el panel no tiene ningún elemento enfocable,
`Tab` hace `preventDefault()` y deja el foco en el panel.

### La devolución de foco cuando el elemento se desmontó

El cleanup del efecto de la capa hace tres cosas, en este orden:

1. `unregisterLayer(layerToken)`.
2. **Si hay otro `Sheet` vivo, el foco es suyo** — se lo lleva y retorna. Sin
   esto, devolver el foco al trigger original dejaría el foco **fuera** del
   diálogo de arriba.
3. Si no, `previouslyFocused.focus()`, **con guarda `previous.isConnected`**.

Y el caso que motivated el `isConnected`: si el trigger se desmontó (una tarjeta
que salió de la grilla, un sheet que cerró a otro), `.focus()` sobre un nodo
desconectado es un no-op silencioso y el foco se pierde al `<body>`. La
solución:

```ts
const { body } = document;
const hadTabIndex = body.hasAttribute('tabindex');
if (!hadTabIndex) body.setAttribute('tabindex', '-1');
body.focus();
if (!hadTabIndex) body.removeAttribute('tabindex');
```

`body` no es enfocable por defecto; se le da `tabindex="-1"` un instante y se
saca. `hadTabIndex` existe para no pisar un `tabindex` que otro ya puso.

El foco inicial va **al panel, no al primer control**:

```ts
panelRef.current?.focus();
```

El comentario dice el porqué: *"lo que el lector de pantalla necesita primero es
el nombre accesible del diálogo (el `title`), no un input que el usuario no
pidió abrir"*. El panel tiene `tabIndex={-1}` para eso.

### El scroll lock por conteo y no por boolean

`document.body.style.overflow` se guarda **una sola vez**, cuando la pila pasa
de 0 a 1, y se restaura cuando vuelve a 0:

```ts
if (openLayers.length === 1) {
  previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
}
// …
if (openLayers.length === 0) {
  document.body.style.overflow = previousBodyOverflow ?? '';
  previousBodyOverflow = null;
  restoreInert();
}
```

Restaurar a `''` en vez de `'visible'` es lo que permite que el valor previo sea
respetado si algo externo había puesto algo. Y `restoreInert()` vive en la misma
rama que la del lock **a propósito**: si queda una capa, se reaplica el `inert`
(`else applyInert()`) para que el panel de la capa sobrevivienta deje de estar
inerte.

### El gesto de drag

Bottom sheet en mobile, diálogo centrado en `sm:`. Los umbrales:

| Constante | Valor | Qué |
|---|---|---|
| `DRAG_CLOSE_DISTANCE` | `120` px | Tirón largo. |
| `DRAG_CLOSE_VELOCITY` | `0.5` px/ms | Tirón corto y rápido también cierra. |
| `DRAG_SLOP` | `4` px | Por debajo de esto fue un click, no un arrastre. |
| `EXIT_DURATION_MS` | `160` ms | `--duration-fast` de §5.1. |

Cuatro detalles:

- **`setPointerCapture`** en el `pointerdown`, así el gesto sigue aunque el dedo
  se salga del handle.
- **Guarda de breakpoint**: `if (window.matchMedia('(min-width: 640px)').matches) return;`.
  En `sm:` el panel es un diálogo y arrastrarlo no significa nada.
- **Solo hacia abajo**: `const offset = Math.max(0, event.clientY - start.startY)`.
  Hacia arriba el panel ya está pegado al tope y dejarlo flotar en el medio se
  ve roto.
- **El click sintético se descarta.** Al soltar se dispara un `click` que el
  browser sintetiza. Si el arrastre terminó sobre el botón de cerrar, ese click
  lo cerraría dos veces. `didDragRef` marca "esto fue un arrastre" y
  `handleClickCapture` hace `preventDefault()` + `stopPropagation()` y se
  consume el flag.
- Mientras se arrastra, el body no scrollea (`isDragging` → `overflow-hidden`): el
  gesto va primero.

El offset se aplica con `style={{ transform: translateY(Npx) }}` en el panel, y
mientras se arrastra se pone `transition-none` para que siga el dedo; al soltar
sin alcanzar el umbral vuelve a 0 con `duration-fast ease-exit`.

### Otras dos que conviene conocer

- **La transición de salida se hace con un estado, no con unmount.** El
  componente tiene un `status: 'closed' | 'open' | 'closing'`, y el `open`/`close`
  se resuelve **en el cuerpo del render**, no en un efecto:
  `if (open && status === 'closed') setStatus('open'); else if (!open && status === 'open') setStatus('closing');`
  El nodo sigue montado `EXIT_DURATION_MS` y recién ahí pasa a `closed`. Sin
  esto, cerrar un sheet sería un corte seco.
- **`createPortal` necesita `document`.** El componente arranca con
  `canPortal = false` y lo pone en un `queueMicrotask` dentro de un `useEffect`
  (`if (!canPortal || status === 'closed') return null`). El microtask, y no el
  setter directo, es por `docs/gotchas.md` #9: un `setState` en el camino
  síncrono de un efecto dispara un render en cascada.

---

## 1.2 `Select` — `ui/select.tsx` (+ `select-option-list.tsx`, `select-search-sheet.tsx`)

Listbox propio, no `<select>` nativo. Tres archivos: el componente, la lista
extraída y el estado del filtro buscable.

### El mapa de teclado, tecla por tecla

**Cerrado** (`handleKeyDown`, rama `if (!isOpen)`):

| Tecla | Efecto |
|---|---|
| `ArrowDown` | Abre, con el resaltado en la opción elegida si hay una, y si no en la **primera** habilitada. |
| `ArrowUp` | Abre, con el resaltado en la opción elegida si hay una, y si no en la **última** habilitada. |
| `Enter` | Abre. |
| `Espacio` | Abre. |

Las cuatro hacen `preventDefault()`. El comentario aclara una razón concreta:
*"`preventDefault` en Enter/Espacio evita que el click sintético del `<button>`
se dispare después y vuelva a cerrar lo que acabamos de abrir"*.

La resolución del resaltado inicial la hace `resolveInitialActiveIndex()`
(`lib/select-utils.ts`): **si hay `value`, gana la elegida**; solo si no la hay,
`ArrowDown` cae en la primera habilitada y `ArrowUp` en la última. Es lo que hace
que reabrir un `Select` con algo elegido deje el resaltado donde el usuario lo
dejó, y no arriba de la lista.

**Abierto** (el `switch`):

| Tecla | Efecto | Nota |
|---|---|---|
| `ArrowDown` / `ArrowUp` | `moveActive(±1)`, saltea las deshabilitadas. | `preventDefault`. |
| `Home` / `End` | Primera / última habilitada. | **No hace nada con el foco en el buscador**: ahí son del cursor, no del listbox. |
| `Enter` | `commit()`: `onChange` + cierra y devuelve el foco al trigger. | |
| `Espacio` | `commit()`. | **Igual que `Home`/`End`**: con el foco en el buscador, el espacio es un espacio — si cayera acá commitearía la opción resaltada. |
| `Escape` | `close(true)`, vuelve el foco al trigger. | `preventDefault` + `stopPropagation`. |
| `Tab` | `close(false)`. | **Sin `preventDefault`**: el foco se devuelve al trigger *antes* de cerrar, así el input se desmonta en el mismo flush y el default del browser sigue su curso hacia el próximo control. |
| Cualquier otra con `key.length === 1` | Typeahead. | **Solo si `!isSearchable`**: con buscador las letras filtran. Además ignora `metaKey`/`ctrlKey`/`altKey`. |

El typeahead acumula en un buffer con un timer de `TYPEAHEAD_TIMEOUT_MS` que
borra el buffer si dejás de tipear.

El flag `inSearch` (el segundo argumento de `handleKeyDown`, `true` cuando el
evento viene del `<input>` del buscador) es lo que distingue "el foco está en el
trigger" de "el foco está escribiendo".

### Por qué el foco queda en el trigger con `aria-activedescendant`

Del JSDoc de `Select`:

> *"El foco real nunca sale del trigger. Se usa `aria-activedescendant` para mover
> el resaltado. Es el patrón de combobox y evita el scrollbelado de llevar el foco
> a la opción: con 176 filas, `focus()` + `scrollIntoView` se pelean con el
> `overflow-anchor` del navegador."*

Consecuencias en el código:

- `SelectOptionList` scrollea **a mano**:
  `nodeRefs.current.get(activeIndex)?.scrollIntoView({ block: 'nearest' })`, con
  `block: 'nearest'` para no arrastrar el scroll de la página.
- El `listbox` tiene `onPointerDown={(event) => event.preventDefault()}`, con el
  comentario *"sin esto el click le saca el foco al `<body>` y se pierde el
  `aria-activedescendant`"*.
- Con buscador, el `<input>` **también** lleva `aria-activedescendant`, y el
  comentario cita la norma: *"ARIA 1.2 lo permite en `textbox`: con buscador el
  foco real está acá, y sin esto el lector de pantalla no anuncia por dónde va el
  resaltado"*.
- `aria-controls` solo se escribe **mientras el listbox existe**:
  `aria-controls={isOpen ? listboxId : undefined}`. Apuntar a un id que no está en
  el DOM es un `aria-controls` colgando.

El resaltado se guarda como **valor**, no como índice:

```ts
const activeIndex = useMemo(() => {
  if (filteredOptions.length === 0) return -1;
  if (activeValue !== null) { const i = filteredOptions.findIndex(…); if (i >= 0) return i; }
  if (value !== null) { const i = filteredOptions.findIndex(…); if (i >= 0) return i; }
  return firstEnabledIndex(filteredOptions);
}, [activeValue, filteredOptions, value]);
```

Un índice queda apuntando a otra opción en cuanto la lista cambia de largo, y
sincronizarlo con un efecto es el anti-patrón de `docs/gotchas.md` #2. El mismo
`useMemo` está duplicado en `useSelectSearch`.

### El reposicionado en mobile

`positionPopover(trigger, popover)` es una **función suelta sin estado** que
escribe directo sobre el nodo, llamada desde un `useLayoutEffect`. El porqué está
en el JSDoc de la función y es doble:

1. *"Medir y guardar en `useState` provocaría un segundo render sin propósito en
   el frame exacto en que el popover aparece, que es cuando el ojo detecta el
   parpadeo."*
2. En el efecto: *"`useLayoutEffect` y no `useEffect`: medir después del paint
   deja ver un frame del popover en 0,0 con `w-0`, que es el parpadeo más visible
   de todo el componente."* — y de hecho el popover se monta con `w-0` a
   propósito.

La función **abre para arriba** cuando no entra abajo:

```ts
const openUp = spaceBelow < Math.min(POPOVER_MAX_HEIGHT, spaceAbove) && spaceAbove > spaceBelow;
```

con `POPOVER_MAX_HEIGHT = 288` (el `max-h-72` de §8.3),
`POPOVER_MIN_HEIGHT = 160` (piso: *"por debajo de 160 px el popover tapa el
trigger y no se puede usar"*), `POPOVER_GAP = 8` y `VIEWPORT_MARGIN = 8`. Cuando
abre para arriba se ancla por `bottom` y no por `top`, porque el alto real depende
de cuántas opciones haya y anclar arriba lo dejaría flotando si es corto.

Al abrir se registran dos listeners: `resize` y **`scroll` con `capture: true`**,
para que también se repositione con el scroll de contenedores internos de la
página y no solo el de la ventana. El handler además **cierra** el popover si el
trigger se fue de la pantalla (`rect.bottom <= 0 || rect.top >= innerHeight`), y
antes de escribir estilos compara con el `lastRect` para no escribir 60 veces por
segundo en cada scroll.

**No hay animación de salida.** La de entrada es `animate-pop-in`. El JSDoc da la
razon: agregarla obligaría a conservar el nodo montado 160 ms más, y mientras está
montado hay que seguir contestando teclado y hover de una lista que ya no se ve.

### Por qué el click que abre no cierra

El click-afuera está en **`pointerdown` y en fase de captura**:

```ts
document.addEventListener('pointerdown', handlePointerDown, true);
```

El comentario lo dice sin rodeos:

> *"Cuando este listener existe, el `pointerdown` del click que ABRIÓ ya terminó de
> propagar, así que no lo cierra en la misma interacción. Con `click` el cierre
> dependería de si el efecto corrió antes o después del dispatch."*

El efecto que lo registra depende de `[close, isOpen]`, o sea corre **después** de
que `isOpen` pasó a `true`, o sea después del `pointerdown` que abrió. Las dos
guardas de target son `triggerRef.current?.contains(target)` y
`popoverRef.current?.contains(target)`.

`close(restoreFocus)` es explícito sobre a quién le devuelve el foco: `true`
cuando el cierre es del propio componente (Escape, Enter, click en una opción),
`false` cuando viene de afuera (click fuera, Tab), porque en esos casos robarle
el foco al click es lo que el usuario está pidiendo.

### El buscador

`searchable` es `options.length > 12` por default
(`SEARCHABLE_THRESHOLD = 12`), con debounce de `SEARCH_DEBOUNCE_MS = 150` (el de
`lib/select-utils.ts`, **no** el `SEARCH_DEBOUNCE_MS = 300` de
`search/catalog-options.ts`, que es el del input de búsqueda de `/buscar` y es
otra cosa) cuyo `setState` vive adentro de un `setTimeout` (fuera del camino
síncrono del efecto, por `gotchas.md` #9). El botón de "limpiar búsqueda" mide
**36 px, no 44**, con la excepción justificada: *"es una acción redundante —el
input se vacía con la tecla de borrado— y a 44 px se comería media fila del
buscador en 390 px"*.

`select-search-sheet.tsx` es el mismo estado para usar dentro de un `Sheet` (el
filtro de 176 sets). Comparte las clases de la fila de búsqueda y el markup del
listbox con el popover, así que las dos formas de elegir se ven igual. Su JSDoc
aclara lo que **no** hace: no monta el overlay, no atrapa el foco, no hace
typeahead.

### `name` y el `<input type="hidden">`

`{name ? <input type="hidden" name={name} value={value ?? ''} /> : null}` existe
para poder reemplazar un `<select name=…>` sin romper el submit de un form nativo.

---

## 1.3 `Field` + `Input` — `ui/field.tsx`, `ui/input.tsx`

### Por qué el `aria-invalid` lo pone el consumidor

Del JSDoc de `Field`, textual:

> *"Un `Input` no puede saber que está dentro de un `Field` con error: no hay
> relación entre el árbol de React de uno y del otro (el hijo puede ser un `Select`
> propio que también necesita el estado, o un `Switch` que ya lo deriva de
> `checked`). Inyectarlo con contexto obligaría a que **todos** los controles
> fueran client components, y `Field` + `Input` son server-safe hoy justamente
> porque no lo son. El costo de que lo declare el consumidor es una prop; el costo
> de que lo declare el componente es que el design system entero no se puede
> renderizar en un Server Component."*

Y el `Input` y el `Textarea` **pintan** el estado desde `aria-invalid`, no desde
el prop `invalid`:

```ts
'aria-[invalid=true]:border-negative aria-[invalid=true]:focus:border-negative',
'aria-[invalid=true]:focus:ring-negative/20 dark:aria-[invalid=true]:focus:ring-negative/40',
```

con el comentario *"si el consumidor pone el atributo a mano, el borde y el anillo
cambian igual, y lo que se anuncia nunca puede desincronizarse de lo que se ve"*.
El prop `invalid` solo hace el trabajo mecánico de setear el atributo:
`aria-invalid={ariaInvalid ?? (invalid ? true : undefined)}`.

### `useFieldA11y`: la salida de una limitación de la API por composición

El mismo JSDoc:

> *"un `Field` no puede inyectarle props a su hijo sin `cloneElement` (que rompe
> cuando el hijo es un `Select` propio o un `Switch`) o sin contexto (que obliga a
> los dos a ser client). El hook es la salida: el `Field` y el control se arman
> con el mismo objeto."*

```tsx
const field = useFieldA11y({ id: 'email', error });
<Field {...field} label="Email" error={error}>
  <Input id={field.id} invalid={field.invalid} aria-describedby={field.describedBy} … />
</Field>
```

`describedBy` apunta a **una sola** cosa y el error le gana al hint
(`resolveDescribedBy`). Se calcula en un módulo compartido, no en cada uno de los
dos, para que el hook y el `Field` no puedan discrepar: *"si divergieran, el lector
anunciaría un `id` que no existe"*.

**El hint desaparece cuando hay error** (`hasHint = !hasError && isPresent(hint)`).
El porqué, textual: *"El hint describe el camino feliz ('Máximo 999') y el error
describe qué está mal ahora: mostrarlos los dos duplica el bloque de ayuda, suma
dos filas de layout a un campo que ya está vibrando, y hace que el lector anuncie
la instrucción y el error pegados"*.

### El resto que no es obvio

- **`className` del `Input` va al wrapper `<div className="relative w-full">`**,
  no al `<input>`, porque es la caja que se estira dentro de un `Field` o de un
  grid. El input lleva `w-full` por su cuenta.
- **El padding vertical se deriva del alto** (`sm: 'h-8 px-3.5 py-1'`), no el
  `py-2.5` nominal de §4.1: con un `h-*` fijo, `py-2.5` deja 18 px de caja para
  22 px de interlineado y el texto se recorta.
- **`Textarea` es client solo por el contador**, y el estado interno **solo existe
  si el consumidor no pasa `value`**: el camino controlado no paga nada.
- **`Checkbox` es client solo por `indeterminate`**, que no es un atributo HTML
  sino una propiedad del DOM y la única forma de ponerla desde React es un ref.
  Se usa un **ref con callback** (no un `useEffect`) para evitar el flicker de
  "vacío → indeterminado" al abrir una fila.
- **`Switch` es controlado** (`checked` + `onCheckedChange` obligatorios): un
  switch que administra su propio estado no se puede resetear desde un formulario.
  Mide 44×26 (`md`) y 36×22 (`sm`), por debajo de los 44 px de §0.5, con la
  excepción justificada: *"la fila completa es tappable (el label es el target del
  click y del foco) y por encima del switch hay padding de la fila"*.

---

## 1.4 `StatGrid` — `ui/stat.tsx`

La regla de §8.7 ("nunca 5 stats en `grid-cols-2`, deja un huérfano") **no está
prohibida, está resuelta**. El componente calcula el `col-span` del último hijo:

```ts
const GRID = {
  2: { cols: 'grid-cols-2', odd: 'col-span-2' },
  3: { cols: 'grid-cols-2 md:grid-cols-3', odd: 'col-span-2 md:col-span-1' },
  4: { cols: 'grid-cols-2 md:grid-cols-4', odd: 'col-span-2 md:col-span-1' },
  5: { cols: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5', odd: 'col-span-2 md:col-span-1' },
} as const;
```

**En mobile todas las grillas arrancan en 2 columnas** (390 px es la referencia,
§0.1), así que la regla del huérfano aplica siempre en la base y se deshace sola
en el breakpoint donde ya hay columnas para todos. El `columns` default es `2`.

El JSDoc explica las dos mitades de la decisión:

> *"[…] en vez de forbidding (que deja al consumidor descubriéndolo en el render)
> el último stat se estira a `col-span-2` y se lee como el total de la pantalla,
> que es exactamente el patrón que el doc propone para los conjuntos de 5. Con 5
> stats queda `2 + 2 + 1 full`: la aritmética del `2 + 3` del doc, sin el hueco."*

Y el complemento importante: el `col-span-2` **se deshace en el breakpoint** donde
la grilla ya tiene columnas para todos (`md:col-span-1`). Resolver el huérfano en
la base sin des-resolverlo arriba produce un estirón feo en desktop.

`Stat` renderiza el grupo `dt` + `dd` y es hijo de `<dl>`. El `tone` es para el
**valor**, no para la celda: la celda es siempre `bg-surface-2` de §2.2, porque
*"un `Stat` que se pinta entero de rojo compite con la carta, que es la
protagonista"*. `StatValue` existe suelta para el consumidor que arma su propio
`dl/dt/dd`.

`StatRow` es la otra mitad de §8.7 y resuelve el mismo problema por otro lado: el
`dl`/`role="button"` es incompatible, así que hay **4 modos** (`dl`, `button`,
`link`, `listitem`) y el `dt`/`dd` solo se usa en el modo `dl`. El default sale de
las props: `button` si hay `onClick`, `dl` si no.

---

## 1.5 `Toast` — `ui/toast.tsx`

**Reemplaza los `<p role="status">` con autocierre.** En la v1 había cuatro
archivos con su propio temporizador de mensajes, su propio `setTimeout` y su
propio estilo de "Copiado". Ahora hay un provider, un portal y una API.

```ts
const toast = useToast();
toast.success('Carta añadida a Mi colección');
toast.error(…); toast.warning(…); toast.info(…);
const id = toast.show({ tone, title, description, duration, action, id });
toast.dismiss(id);
toast.connection(isOffline);   // el toast de "Sin conexión"
```

Lo no obvio:

- **La API tiene un espejo en un ref** (`itemsRef`), porque leer el estado dentro
  de un callback sin stale closure obliga a leer de un ref. Los updates pasan por
  un `commit` único, así que el ref y el estado nunca divergen.
- **El descarte del toast más viejo no toca los persistentes.** `evictable =
  visible.filter((entry) => entry.duration > 0)`, con el comentario *"un aviso de
  'sin conexión' no puede caer porque llegó un 'carta añadida'"*.
- **`dismiss` no borra: marca `exiting`.** El borrado real pasa por
  `scheduleRemoval`, que espera `EXIT_DURATION_MS = 160` para que la animación
  corra.
- **`role="alert"` + `aria-live="assertive"` solo para `error`.** Los otros tres
  son `role="status"` + `polite`.
- **El timer pausa en hover y en focus** (`onMouseEnter`/`onFocus` →
  `setPaused(true)`), y el tiempo restante se descuenta **en el arranque del
  efecto pausado, no en el cleanup**, para que el doble cleanup de `StrictMode` no
  descuente dos veces.
- **Posición**: mobile abajo a la izquierda por encima de la `BottomNav`
  (`bottom-[calc(5rem+env(safe-area-inset-bottom))]`), `sm:` arriba a la derecha.
  §8.10: *"Debajo de la nav (`z-sheet` con offset), nunca tapando la `BottomNav`"*.
- `toast.connection(isOffline)` es **idempotente** (id fijo `pokescan:offline`),
  así el guard de `OfflineToast` puede llamarla en cada `online`/`offline` sin
  acumular toasts. **Espera el estado, no un evento** — y eso es justamente lo que
  `OfflineToast` resuelve con `useSyncExternalStore` (ver `gotchas.md` #19).

---

## 1.6 `Skeleton` — `ui/skeleton.tsx`

**`shimmer` y no `animate-pulse`.** Del JSDoc: *"el pulso se ve 'hospital' y el
shimmer usa los tokens de `--shimmer-from/to` del tema"*. La clase es
`bg-shimmer animate-shimmer`, y §12 de `design-system.md` pone `animate-pulse` en
la lista de anti-patrones.

Los dos tokens existen en los **dos** temas (`--shimmer-from: #eeeef2` /
`--shimmer-to: #f8f8fa` en claro, `#1d1d24` / `#26262f` en dark) y están
re-expuestos como `--color-shimmer-from` / `--color-shimmer-to` en `@theme inline`,
así que `bg-shimmer` es un gradiente y `animate-shimmer` (`1.6s linear infinite`)
anima el `background-position`. La v1 usaba `animate-pulse` sin mirar
`prefers-reduced-motion`; el bloque global de §5.3 lo cubre ahora.

Las 6 variantes: `text` (una línea), `card` (`aspect-[63/88]`, los mm reales de
una carta), `stat`, `avatar`, `block`, `sheet`.

**El `Skeleton` es siempre `aria-hidden`.** El anuncio es del **contenedor**, no
del placeholder: *"el skeleton se repite N veces y N anuncios 'cargando' son
ruido"*. El patrón es
`<div role="status" aria-label="Cargando cartas"><Skeleton …/></div>`.

`CardGridSkeleton` sí trae el `role="status"` + label, con dos grillas que
**duplican** a propósito las de `cards/card-grid.tsx` (por qué, ver §0).

`Spinner` es el otro extremo: siempre `aria-hidden`, con el texto de carga puesto
por quien lo muestra. §8.12: *"un `Skeleton` para estructura conocida, un
`Spinner` para contenido desconocido. Nunca los dos juntos"*.

---

## 1.7 `SegmentedControl` — `ui/segmented-control.tsx`

**No es un `Chip`.** Del JSDoc:

> *"el `Chip` es un filtro sobre un conjunto que puede crecer y scrollea (§8.4), y
> el activo invertido a negro es un look de filtro. Acá las opciones son **fijas y
> mutuamente excluyentes**, y todas tienen que estar visibles a la vez porque el
> usuario está eligiendo entre un número cerrado de cosas, no explorando."*

Comparte paleta con el `Chip` activo (`bg-primary text-inverse` — el rojo queda
para el precio y el CTA) pero no forma: es `flex gap-0.5 rounded-control border
bg-surface-2 p-0.5` con un `h-11` por segmento (44 px, sin excepción que
justificar, contra los 36 px del `Chip`).

**Semántica: `role="group"` + `aria-pressed`, no `tablist` ni `radiogroup`.** No
hay `tabpanel` que mostrar — el contenido no cambia, cambia una preferencia — y
§11 es explícito: *"si el contenido no cambia, son controles con `aria-pressed`"*.

El **label visible lo pone el consumidor** como texto arriba, y el `label` de la
prop es solo el nombre accesible del grupo. El porqué: *"así no hay dos labels
idénticos peleándose por el mismo espacio en las pantallas de dos niveles
(moneda → tipo de dólar)"*.

---

## 1.8 El resto, en una línea cada una

- **`Alert`** — 5 tonos × 2 tamaños. `role="alert"` **solo** en `error`; los otros
  cuatro son `role="status"` + `aria-live="polite"`. El ícono es siempre
  `aria-hidden`. `warning` nunca es un error (§2.3). `RetryButton` vive en el
  mismo archivo a propósito: separarla invita a importarla desde `alert.tsx` en
  vez de desde donde vive el `Alert`. El texto "Reintentar" **no es prop**.
- **`Avatar`** — `src` opcional, `name` obligatoria igual (es el fallback, el `alt`
  y el nombre accesible). Se mide con el tamaño del token y **no** con `fill`.
  Las iniciales son la primera del primer nombre y la del último.
- **`Badge`** — sin borde: *"a 20 px el borde se come el padding y deja de leerse
  como chip"*. Si necesita `onClick` es un `Chip`: *"un badge pulsable no anuncia su
  estado"*.
- **`Button`** — **no hay `asChild`**: es siempre un `<button>`. Los links usan
  `next/link` con las clases de `buttonVariants` re-exportadas. `isDisabled` se
  omite de la API pública (existe solo para que `cva` resuelva el color de apagado
  por variante). `loading` = `Spinner` + `pendingLabel` + `aria-busy` + `disabled`.
  `type` default `'button'`, no el `'submit'` del DOM.
- **`Chip`** — el `tone` vive en un mapa aparte, no en `cva`, porque en `content`
  el color pisa el `active` y `cva` no puede expresar "el tone gana" sin un
  `compoundVariant` por cada tone. El `active` se ignora en `content`. El
  `size` default depende del `mode` (`sm` en content, `md` en filter).
- **`Divider`** — `<hr>` sin label, `role="separator"` sobre un `span` para el
  vertical, y un `div` flex con dos líneas y el label en el medio cuando lo hay (no
  se puede poner texto adentro de un `<hr>`). `spacing` controla los márgenes del
  línea y de la fila por separado. **Nota**: el JSDoc del archivo dice que "el
  separador decorativo lleva `aria-hidden`", pero el markup no lo pone — la
  horizontal sale como un `<hr>` pelado. Ojo si se toca.
- **`EmptyState`** — `kind` distingue "nunca usaste la feature" de "tu filtro no
  devolvió nada", y el segundo **repite el criterio** en el copy. **Nunca** para
  un error. Sin `role="status"`: *"una región viva anunciaría 'Sin resultados' dos
  veces en el primer render"*.
- **`ErrorState`** — otro componente y no un `kind` más de `EmptyState`: en la v1
  los dos pintaban con el mismo chrome y un error se leía como "no hay nada acá".
  El cuerpo es qué pasó + qué hacer. Sin `onRetry` **no** dice "reintentá": el
  copy no puede prometer lo que no está en pantalla.
- **`IconButton`** — `label` obligatorio, `title` default a `label`, ícono
  `aria-hidden` + `focusable="false"` + `strokeWidth={1.75}`. Sin tooltip propio.
  `sm` = 40×40 (mínimo de §0.5), `md` = 44×44 (lo que piden `ScreenHeader` y
  `Sheet`).
- **`PasswordInput`** — el toggle es un `IconButton` de verdad (llega con Tab, se
  activa con Enter y Espacio) y anuncia su estado de **dos** formas: `aria-label`
  dinámico y `aria-pressed`. El tamaño del toggle se calcula contra el `size` del
  input, porque un botón de 40 px dentro de un input de 32 px se sale del track.
- **`Progress` / `Meter`** — `Progress` es `role="progressbar"` con
  `aria-valuenow`; **`Meter` es `role="img"`** a propósito: *"no es algo que
  avanza, es una lectura puntual ('Coincidencia 84 por ciento'). Un `progressbar`
  haría esperar que la barra llegue a 100"*. `value` se recorta a 0–100. El track
  no se tintea: siempre superficie hundida.
- **`Surface`** — `as` acepta `div | section | article | aside` y lo renderiza con
  `createElement`. Borde y sombra **siempre juntos**, en los dos temas, para no
  bifurcar el JSX.

---

# 2. Las carpetas de pantalla

Mismo nivel de detalle, más breve: qué hay, qué es el punto de entrada y lo que
no es obvio. Los componentes con comportamiento especial (`Sheet`, `Select`) ya
están arriba.

## 2.1 `layout/` — chrome

| Componente | Tipo | Qué hace |
|---|---|---|
| `AppShell` | server | Canvas + `BottomNav` + `OfflineToast`. Lo usa `app/(app)/layout.tsx`. |
| `PlainShell` | server | Canvas + `OfflineToast`, **sin** `BottomNav`. Lo usan `app/(auth)/layout.tsx` y `app/share/layout.tsx`. |
| `ScreenHeader` | **server** | El header de una pantalla. Por pantalla, no global. |
| `ScreenContainer` | server | El `<main id="contenido">` con el ancho, el ritmo y el `pb` de la nav. |
| `BottomNav` | client | Cinco destinos en mobile; desktop usa el wordmark como Inicio y deja cuatro secciones a la derecha. |
| `OfflineToast` | client | El aviso de "Sin conexión", como toast. |

### `AppShell` y `PlainShell` — por qué son dos y no uno con una prop

Los dos hacen **exactamente lo mismo** menos la `BottomNav`:

```tsx
// components/layout/app-shell.tsx
<div className="flex min-h-dvh flex-col bg-canvas font-sans text-primary">
  {children}
  <BottomNav />
  <OfflineToast />
</div>
```

```tsx
// components/layout/plain-shell.tsx
<div className="flex min-h-dvh flex-col bg-canvas font-sans text-primary">
  {children}
  <OfflineToast />
</div>
```

Podrían ser el mismo componente con `nav?: boolean`. Se eligieron dos porque la
diferencia **no es un parámetro de la pantalla, es de qué rama del árbol es la
pantalla**, y un booleano en el call site volvería a dejar el problema abierto:
reponer `<BottomNav />` en la ruta pública es un copy-paste, y nadie lo va a notar
hasta que se vea.

El layout de `share/` lo dice, y es el mejor resumen del criterio:

> *"No es un route group como `(auth)` porque no aporta nada: no lleva `error.tsx`
> ni `not-found.tsx` propios, y los providers ya están en el layout raíz."*

Los **providers no están en ninguno de los dos**: `ThemeProvider`,
`AuthProvider`, `CurrencyProvider` y `ToastProvider` se montan una sola vez en
`app/providers.tsx`, que envuelve todo el árbol. Ver
[`routes.md`](routes.md) §2 para por qué quedaron arriba y no en los layouts de
rama, y [`gotchas.md`](gotchas.md) §17 para por qué las ramas son carpetas
hermanas y no route groups anidados.

El `OfflineToast` sí va en las tres ramas, incluida la pública: leer una colección
compartida funciona sin conexión y el visitante tiene que enterarse de por qué.

### `ScreenHeader` — server-safe a propósito

**No puede usar `usePathname()`, y esa es la decisión.** Cada pantalla le pasa su
`back` y su `action` desde abajo:

```tsx
<ScreenHeader
  title="Buscar"
  back={{ href: '/buscar', label: 'el catálogo' }}
  action={<IconButton … />}
 />
```

El `back` es un objeto `{ href, label }`, no un booleano, y el `aria-label` del
chevron se arma con el label: `` aria-label={back.label ? `Volver a ${back.label}` : 'Volver'} ``.

Tres cosas del markup:

- Sin `back` **y** sin `action` el título se alinea a la izquierda; con cualquiera
  de los dos se centra (`back || action ? 'text-center' : 'text-left'`), para que
  el chevron de la izquierda y la acción de la derecha no lo descentren.
- Los dos lados son contenedores de **40×40 fijos** (`shrink-0`), ocupados o no.
  Es lo que hace que el título quede centrado pase lo que pase del lado izquierdo.
- El título va en un `<p>`, no en un `<h1>`. Por eso las pantallas que necesitan
  el heading real lo ponen aparte como `<h1 className="sr-only">` y rotulan el
  `<main>` con él (`app/(app)/ajustes/page.tsx`, `app/(app)/carta/[id]/page.tsx`).
  El comentario de `ajustes/page.tsx` lo llama *"la solución estándar cuando el
  título visible vive en un componente de chrome"*.
- `sticky top-0 z-sticky bg-surface/85 backdrop-blur-md pt-[env(safe-area-inset-top)]`,
  contenido de `h-14`, **sin borde inferior** (§7.5: la sombra y el blur separan).

`app/(app)/buscar/page.tsx` lo usa **sin** `back` ni `action`, y el JSDoc explica la
desviación del wireframe del plan: *"`/buscar` es una raíz de la `BottomNav` y
el punto de arranque del producto, así que no hay a dónde volver ni qué cerrar. Un
chevron a una pantalla hermana o una `X` que no cierra nada serían dos controles
que mienten"*.

### `ScreenContainer`

Es el `<main id="contenido">` al que apunta el skip link. **Reparte los atributos
que sobran** (`ComponentPropsWithoutRef` menos los que él mismo expone), y por
eso un `loading.tsx` puede pegarle un `aria-busy="true"` al `<main>` sin escribir
un `<main>` propio y copiarle las clases de ancho y ritmo. `className` e `id` **no**
entran por ahí: son props propias, se resuelven después y por eso el `className`
del call site **pisa** el ancho por defecto en vez de pelearse con él.

El `pb-[calc(5rem+env(safe-area-inset-bottom))]` reserva la `BottomNav` más el
safe area. El detalle de colección lo pisa pasando
`DETAIL_CONTENT_INSET` (exportado por `collections/collection-bottom-bar.tsx`) como
`className`, y funciona porque `tailwind-merge` resuelve el conflicto de `pb-*` a
favor del `className` — no hace falta tocar la primitiva.

`bleed` quita `max-w` y `px` (scanner, home). `as` acepta `main | div | section`.

### `BottomNav`

`fixed inset-x-0 bottom-0 z-nav`, `h-16`, `max-w-lg` centrada, activo con
`text-brand` + `aria-current="page"` + `strokeWidth` 2.25 contra 1.75. **No tiene
`display-mode: standalone`**: en la PWA instalada la pantalla ya ocupa todo el
viewport y esconder la nav dejaba la app sin forma de navegar, que era el gap
funcional más grave de la versión anterior (§7.5). Las 4 entradas salen de
`NAV_ITEMS` en `nav.ts` y `isNavItemActive` es el match exacto o por prefijo de
segmento.

### `OfflineToast`

`navigator.onLine` con **`useSyncExternalStore` y server snapshot `true`**. Del
JSDoc: *"Con `useState`+`efecto` el primer render afirmaría que estamos online
aunque no lo estuviéramos, y el toast aparecería un frame tarde"*. Es el patrón de
[`gotchas.md`](gotchas.md) §19.

Sigue escribiendo `document.documentElement.dataset.offline` (el service worker lo
consulta) y expone un `<p role="status" className="sr-only">` para lectores de
pantalla. **No empuja el layout**: el aviso es un toast que flota, así que en
`globals.css` la única regla de `html[data-offline='true']` es `color-scheme`, sin
padding.

## 2.2 `cards/` — la carta es la protagonista

| Componente | Tipo | Qué hace |
|---|---|---|
| `CardTile` | server | El tile. `catalog` (imagen + nombre + set + precio) o `collection` (solo imagen). |
| `CardGrid` | server | Elige la grilla de §7.2 y delega cada celda. |
| `set-media.tsx` | **client** | `SetLogo` y `SetSymbol` con degradación a texto. |
| `Money` | **client** | Formatea USD en la moneda activa. |
| `ShowOrDash` | **client** | `—` con `aria-label="Sin precio"` cuando no hay precio. |

`set-media.tsx` merece una nota porque implementa una defensa de la que casi nadie
se acuerda: `SetDto.logoUrl` y `symbolUrl` vienen textualmente de la fuente y el
backend los espeja **sin validarlos**. `next/image` **lanza** cuando el host no está
en `remotePatterns`, y en el server eso es un error de render, no un 404: un set con
el logo en otro host tumba la pantalla entera. `parseRemoteImage()` filtra por
protocolo `https` y por una allowlist de dos hosts **duplicada a propósito** (no se
puede importar `next.config.ts` desde un Client Component sin meter la config
entera en el bundle). Después queda un segundo problema —URL bien formada con
recurso inexistente— que se maneja con `onError` y un fallback de texto, más
`unoptimized` para los `.svg` porque el optimizador de Next no los sirve.

### `CardTile` — lo que hay que saber

- **El tile es la imagen, no un contenedor.** No lleva `border` ni `bg-surface`:
  la imagen flota sobre el canvas con `shadow-sm` y sube medio píxel en hover
  (`group-hover:-translate-y-0.5 group-hover:shadow-md`). En la v1 era un
  `rounded-xl border bg-slate-900/40 p-2` con la sombra en la imagen, y el
  resultado eran 20 cajas de gris compitiendo con 20 obras de arte.
- **`priceUsd` tiene tres estados, y el tercero es el importante**: número →
  se muestra; `null` → sabemos que no tiene precio, va `—`; **omitido** → no se
  dibuja la fila. El motivo es el rate limit: *"`/cards/search` no devuelve
  precios, y pedir 20 `/cards/:id/prices` para pintar una grilla es 20 requests
  contra el rate limit de pokemontcg.io (`AGENTS.md` §3.1)"*.
- **`<Link>` o `<button>`, nunca los dos.** Con `onSelect` el tile es un
  `<button>`; si no, un `<Link>`. El JSDoc descarta explícitamente la alternativa
  de anidar: *"un `<button>` adentro de un `<Link>` es HTML inválido y, en un
  navegador real, el toque dispara la navegación y el `onClick` juntos"*.
  Existía la salida de un `IconButton` de engranaje encima; desapareció porque
  obligaba a apuntar a un ícono de 20 px en vez de a la carta.
- El nombre se trunca a **una** línea con `title`, no a dos. Es el trade-off
  explícito de §3.3 para tile vertical: a 2 columnas en 390 px no entra un
  `line-clamp-2` sin que la fila de precio se vaya del alto.
- El `x{N}` va **debajo** de la imagen, no encima: en la v1 el chip tapaba la
  esquina superior derecha, que es donde está el número y el set impreso.
- `SIZES` es una constante por variante, y es la que se pasa a `next/image`.
  Importa que sean correctas: sin eso el LCP de `/buscar` se va al primer `fetch`
  de la grilla en vez de al de la primera carta. `sizes` por prop existe para el
  binder (5 columnas, ~17vw).

### `CardGrid`

Elige la grilla y delega. Nada más. Detalles con motivo:

- **`data-card-index` en cada celda** — "no es decorativo: `/buscar` lo usa para
  bajarse a la primera carta nueva cuando carga una página más".
- **`key={`${entry.card.id}-${entry.key ?? index}`}`** — en una colección la misma
  carta con dos variantes son dos ítems con el mismo `card.id`, y con la `key`
  sola React reusa el nodo y el primer hover se queda pegado al equivocado.
- `priority` para las primeras 5 **en catálogo** y **0 en colección**
  (`DEFAULT_PRIORITY_COUNT = 5`): `priority` en una grilla entera mata el
  beneficio de `next/image`.
- `as="ul"` para las vistas públicas, con `role="list"` donde hace falta.
- `if (list.length === 0) return null;` — la grilla vacía la decide la pantalla,
  con su `EmptyState` y su criterio repetido.

### `Money` / `ShowOrDash`

`Money` es un componente y no una función para poder vivir en un Server Component:
el formateo ocurre en el cliente (`useCurrency().formatMoney`). `ShowOrDash` es
la envoltura que reemplaza la regla de §9.2 (`''` → `—` con
`aria-label="Sin precio"`), y es la que usa `CardTile`.

## 2.3 `search/` — `/buscar`

| Archivo | Qué hace |
|---|---|
| `catalog-search.tsx` (client) | **Punto de entrada.** La pantalla. |
| `search-controls.tsx` (client) | Input, modo de búsqueda, filtros. |
| `set-filter-sheet.tsx` (client) | El filtro de set en un `Sheet` buscable. |
| `rarity-filter.tsx` (client) | Las 12 rarezas como `Chip`. |
| `search-fallback.tsx` (server) | El `Skeleton` de la pantalla. |
| `catalog-options.ts` (módulo) | `CATALOG_PAGE_SIZE = 24`, `SEARCH_DEBOUNCE_MS = 300`. |

Lo no obvio:

- **La URL es la fuente de verdad.** `q`, `setId`, `rarity`, `sort`,
  `direction` y `page` salen de `useSearchParams`. Un link reproduce la pantalla
  exacta y el botón atrás deshace un filtro sin pila de estado. `name` y `asc` son
  los defaults y no se escriben, para que la URL que se comparte siga siendo
  corta.
- **La lista se remonta con `key`, no con un efecto que llame a `reload()`.**
  `<CardResults key={listKey} />` se remonta cuando cambia cualquier criterio. La
  alternativa es exactamente `gotchas.md` #9, y con `key` el contador de "cartas ya
  cargadas" —del que depende el scroll a la primera carta nueva— arranca en cero
  sin resetearlo a mano.
- **El input no se borra al navegar**, y la sincronización vive en un solo lugar
  (`catalog-search.tsx`), no repartida: `SearchControls` es controlado y "pinta
  exactamente lo que le pasó". El patrón del ref "este cambio de la URL es
  mío" es el de `gotchas.md` #3.
- **`SEARCH_MODES` declara qué existe de verdad, y hoy los tres están
  disponibles**: `name`, `number` y `artist` con `available: true`, porque
  `SearchCardsDto` acepta los tres. El campo `available` sigue declarado porque
  es el que evita tocar la pantalla entera si uno vuelve a quedar deshabilitado,
  pero hoy ningún chip se ve apagado: *"la función existe y la app no la ofrece"*
  es un defecto, no una prudencia.
- **El `sort` y la `direction` viven en el `Sheet` de filtros**, no en la barra:
  son cuatro criterios más un sentido, y la barra está pensada para input + un
  botón. Con texto en el input **ambos se deshabilitan y se explica por qué**,
  porque el backend ignora el orden cuando viene `q` (manda el score de
  relevancia, que no es invertible). Cambiar el `sort` pone la `direction` en
  `desc` para `price` y `number` —"las más caras primero"— y en `asc` para los
  otros dos, porque alfabético descendente no lo pide nadie.
- `SearchFallback` se usa **tanto** en el `fallback` del `Suspense` como en
  `loading.tsx`, en vez de duplicar el skeleton. Las tres carpetas que tienen
  `loading.tsx` hacen lo mismo, con la misma justificación: *"dos versiones del
  mismo skeleton que no coinciden son un salto de layout esperando a aparecer"*.

## 2.4 `scanner/` — la pantalla más grande

La página `/escanear` mantiene la sesión y ejecuta DINOv2. `CameraView` conserva el video durante la consulta y captura automáticamente un encuadre estable. `CardFrame` dibuja rojo/verde; `ActionBar` ofrece captura manual de respaldo, galería, descarte y organización. Los controles de flash/infinito están ocultos.

`DetectedCardBar` y `PriceChip` muestran la carta elegida y sus precios sin consultar APIs. `VisualDiagnostics` muestra ranking y tiempos de una foto subida. `IdlePanel` ofrece cámara solo en teléfonos. `OrganizeSheet` guarda las entradas en la colección elegida; la primera predicción se suma por defecto y no hay un selector de candidatos.

`image-input.ts` decodifica archivos; `lib/scanner/visual-photo.ts` prepara el recorte de galería. La cámara ya captura la guía y no vuelve a rotarla. `copy.ts` contiene mensajes y fases. `types.ts` y `session-storage.ts` definen/persisten la sesión, hasta 30 entradas. Ver [scanner.md](scanner.md) para cancelación, tiempos, geometría y actualización del índice.

## 2.5 `collections/`

| Archivo | Qué hace |
|---|---|
| `collections-screen.tsx` (client) | **Punto de entrada** de `/colecciones`. |
| `collection-detail.tsx` (client) | **Punto de entrada** de `/colecciones/[id]`. |
| `collection-card.tsx` (server) | La tarjeta con mosaic de portada. |
| `collection-summary.tsx` (client) | El bloque de cabecera con el total en `text-display`. |
| `collection-filters.tsx` (client) | Todas · Duplicadas · Para intercambio · Sets. |
| `collection-bottom-bar.tsx` (client) | La barra fija con el total y el `+`. |
| `collection-create-sheet.tsx` (client) | Alta. |
| `collection-rename-sheet.tsx` (client) | Renombrar. |
| `item-sheet.tsx` (client) | `ItemSheet` + `AddToCollectionSheet`. |
| `collection-skeletons.tsx` (server) | `CollectionsListSkeleton` + `CollectionDetailSkeleton`. |
| `collection-options.ts` (módulo) | `COLLECTION_PAGE_SIZE = 24`, `formatCount`. |

Lo no obvio:

- **El mosaico de portada es 2×2 con huecos resueltos estirando la primera**: con
  1 no hay grilla, con 2 son dos mitades verticales, con 3 la izquierda completa y
  dos apiladas, con 4 llena. El tipo `CollectionCoverItem` declara **solo**
  `imageSmall`, más angosto que el `cover: [{ imageSmall, cardId }]` del DTO: el
  `cardId` no se usa para pintar, y un tipo más angosto sigue aceptando el objeto
  más ancho (tipado estructural). `collections-screen.tsx` pasa `collection.cover`
  y el fallback de marca queda solo para la colección sin cartas, que es el único
  caso en que `cover` llega `[]`. Traer la portada no es un N+1: el backend la
  arma con un `$queryRaw` agregado para todas las colecciones del listado.
- **`CollectionSummary` pone el total en `text-display`, no en un `Stat`.** El
  total es la cifra que el usuario vino a ver; un `Stat` la pone en `text-h3` al
  lado de cuatro contadores y la vuelve una más.
- **"Intercambio" no es una tercera pestaña.** Es un `Chip` más, y se combina
  con el filtro de duplicadas. Ambos son **server-side**: `listItems` los pasa al
  backend, que compone los dos en el mismo `where` y hace el `count` con ese
  mismo filtro. No hay `Alert` de honestidad ni `.filter()` en el cliente.
  Lo que sí cambia con el server-side es la distinción de vacíos: una respuesta
  vacía con filtro puesto ahora significa "no hay en la colección", así que
  `isEmptyFilter` se separa de `isEmptyCollection` por **el filtro activo** y no
  por `items.length`. El copy nombra el filtro que no matcheó, porque los dos se
  pueden combinar y hay cuatro combinaciones.
- **"Sets" es un `Link`, no un `Chip`.** Porque cambia la URL. Se arma con
  `chipVariants` sobre un `<Link>` con `aria-current="page"`: *"el `Chip` es un
  `<button>` y un botón no navega"*.
- **Todos los sheets resetean con el patrón `wasOpen`.** Comparar `open` contra el
  valor anterior **durante el render** y recién ahí resetear. El JSDoc descarta
  las dos alternativas: un `useEffect` que resetea (render en cascada, y con
  `StrictMode` dispara el doble fetch) y un contador `resetKey` que el padre tiene
  que mantener solo para forzar un remontaje.
- **`CollectionBottomBar` va siempre**, también en error y en colección vacía: el
  padding de abajo es invisible ahí, y hacerlo condicional haría saltar el layout
  en el momento exacto en que llegan los datos.
- La barra y la `BottomNav` comparten `z-nav` a propósito: *"si fuera mayor, en el
  único lugar donde se tocan —el borde de arriba de la nav— la barra le ganaría al
  chrome global"*.
- **`AddToCollectionSheet` trata el 409 como éxito** y preselecciona la colección
  pedida → la principal → la primera, **solo si la pedida está en la lista**.
- El error de un `Field` vive **dentro** del `Field` y no en un `Alert` aparte:
  *"el `Field` ya lo pinta con `role="alert"`, y dos superficies para el mismo
  string leen como dos errores distintos"*.

## 2.6 `set-progress/` — progreso por set y binder

| Archivo | Qué hace |
|---|---|
| `set-progress-screen.tsx` (client) | **Punto de entrada.** Las dos vistas. |
| `set-progress-list.tsx` (client) | Vista 1: una fila por set. |
| `set-progress-card.tsx` (client) | La tarjeta de un set. |
| `binder-view.tsx` (client) | Vista 2: los slots. |
| `set-progress-source.ts` (módulo) | **La fuente de datos, con dos implementaciones.** |
| `use-chunked-list.ts` (hook) | Trocea la lista para que el DOM no crezca. |
| `set-progress-skeleton.tsx` (server) | `SetProgressFallback` + `SetProgressFallbackBody`. |

Lo no obvio:

- **Dos vistas en una sola ruta.** `?set=<setId>` abre el binder; sin el
  parámetro, la lista. El motivo es concreto: el plan pide que *"la URL del filtro
  sea compartible y sobreviva a un refresh"*, y un link a
  `/colecciones/x/sets?set=swsh4` tiene que abrir el binder. Con dos rutas haría
  falta un redirect.
- **El `ScreenHeader` va adentro del componente**, no en la `page.tsx`, porque el
  título depende de la vista ("Progreso por set" vs. el nombre del set) y el
  nombre del set solo existe en el cliente.
- **`set-progress-source.ts` tiene dos implementaciones y una constante.**
  `API_SET_PROGRESS_SOURCE` (pega a B7 y B8) y `FALLBACK_SET_PROGRESS_SOURCE`
  (deriva lo mismo con `/sets`, `/collections/:id/stats` y `/collections/:id/items`).
  Se elige con `SET_PROGRESS_SOURCE`, una constante con nombre al final del
  archivo. El porqué de que sea una constante y no un `if` escondido en un hook:
  *"nadie sabría en qué entorno está, y el flag envejecería"*.
- **El binder trocea en 60 (`BINDER_CHUNK = 60`) en vez de usar
  `content-visibility: auto`.** El JSDoc evalúa las dos: `content-visibility` hace
  que el grid deje de tener altura calculada, Chrome y Safari recalculan el
  `scrollHeight` a 20 celdas por vez, el scroll da saltos en un set de 300 y el
  find-in-page deja de encontrar las cartas no pintadas. Trocear es predecible:
  el DOM nunca pasa de 120 slots.
- **La pantalla consulta la sesión.** `SetProgressScreen` usa `useAuth` y, sin
  sesión, muestra un `EmptyState` con "Iniciá sesión para ver el progreso" en
  lugar de disparar la request y dejar que un 401 caiga en el `ErrorState`
  genérico. El motivo es concreto: "No pudimos cargar el progreso" con un botón
  de "Reintentar" que no iba a cambiar nada es un mensaje que esconde la causa,
  y el caso de un 401 no es un error — es un estado esperado.
- `partitionSetProgress` separa `owned` / `suggested` / `orphan` (B9), y
  `compareCardNumbers` ordena los números de carta de verdad (`4` antes que `102`).

## 2.7 `prices/`

| Componente | Tipo | Qué hace |
|---|---|---|
| `card-price-section.tsx` | client | **Punto de entrada.** Orquesta la carga. |
| `price-hero.tsx` | client | El precio como protagonista de la ficha. |
| `price-delta.tsx` | client | La píldora de variación, o la fecha. |
| `price-table.tsx` | client | Los dos layouts: tabla en `lg:`, filas en mobile. |

- **`PriceHero` es interactivo solo si le pasan `onOpenDetails`**: *"sin esto el
  panel no es interactivo y no se dibuja el ícono de gráfico: una afordancia que
  no hace nada es peor que no tenerla"*.
- **El valor crudo siempre es USD** y la conversión es del cliente, porque la
  preferencia llega del token: formatearlo en el server produciría HTML que no
  corresponde a la moneda que el visitante tiene activa.
- **`PriceDelta` tiene dos salidas en un componente** porque las dos ocupan el
  mismo lugar en la composición y nunca aparecen juntas. Lo que **no** hace es
  inventar el dato: sin `changeUsd` y `changePercent` no hay píldora, hay
  "Actualizado hace 3 h". El `Alert` de "esto está viejo" lo pone
  `CardPriceSection`, *"porque un `Alert` no es una píldora y esta caja no debe
  crecer de ancho completo"*.
- **B10 está implementado.** `PriceDto.change` y `PriceHistoryDto` llegan del
  backend, así que `changeUsd`/`changePercent` ya no llegan `undefined`: el
  `PriceDelta` muestra la variación real y `PriceHistory` el sparkline. El
  caption sigue siendo el que dice cuántos días hay —nunca "0 %" cuando el
  backend devuelve `change: null`— y el color de la línea sale **solo** del
  `change` del servidor, para que el sparkline no pueda contradecir a la píldora.
- **La procedencia va en el texto visible.** `PriceDto.provider` y
  `PriceHistoryDto.provider` + `source` están en el contrato para que se muestren:
  el caption de `PriceHistory` termina con `· tcgplayer · TCGdex` y `PriceTable`
  rotula el mercado de cada fila. Con `provider: null` el texto dice "origen no
  identificado" en vez de atribuir la serie a la fuente activa —no hay dato que
  pruebe de dónde salió— y `PriceDto.isStale` (precio de otro proveedor o de más
  de 24 h) es lo que dispara el `Alert` de "esto está viejo" y el refresh.
- **`PriceDelta` tiene un tercer tono, `flat`.** *"Sin cambio no es 'ni una cosa ni
  la otra': es un precio quieto, y pintar un 0 % de rojo dice 'cayó' cuando no cayó
  nada"*.
- **`PriceTable` renderiza los dos layouts y el CSS los separa.** No decide con un
  listener de `matchMedia`, que además no funcionaría en un Server Component. El
  corte está en `lg:` (1024 px), que es donde las 5 columnas entran sin scroll. La
  tabla conserva `<caption class="sr-only">` y `scope="col"`/`"row"`.
- `heroPriceUsd(prices)` elige el precio de referencia y `countPricelessVariants`
  da el "N cartas sin precio" del estado parcial de §9.1.

## 2.8 `settings/` — `/ajustes`

| Componente | Tipo | Qué hace |
|---|---|---|
| `require-auth.tsx` | client | El guard de sesión. |
| `identity-card.tsx` | client | Avatar (`avatarUrl` real), nombre, "Miembro desde". |
| `appearance-settings.tsx` | client | Sistema / Claro / Oscuro, con `SegmentedControl`. |
| `currency-settings.tsx` | client | Moneda y tipo de dólar. |
| `session-settings.tsx` | client | Cerrar sesión. |
| `settings-section.tsx` | server | `Surface` + `h2` + `aria-labelledby` autogenerado. |

- **`RequireAuth` es el guard de sesión** y hace `router.replace('/login')` cuando
  `isLoading` ya terminó y no hay sesión; mientras, un `Skeleton` con
  `role="status"`. Reemplaza al `ProtectedRoute` anterior, que hardcodeaba un
  spinner con clases crudas sobre el canvas claro.
- **`SettingsSection` es server-safe a propósito**: el `h2` real y el
  `aria-labelledby` los pone el componente, así un Server Component puede componerlo
  sin que todo el archivo se vuelva client. Existe porque ya había tres
  `aria-labelledby` autogenerados a mano.
- La ruta se llama `ajustes`, que es el nombre de la tab (`nav.ts`) y el de la
  pantalla. `/perfil` quedó con un `route.ts` que hace **308** a `/ajustes`; el
  JSDoc de ese archivo explica por qué es permanente y no temporal.
- `ShareLinksSection` **no** está en esta carpeta: es de `share/` y se compone
  desde la página. La sección se arma en `app/(app)/ajustes/page.tsx`.

## 2.9 `share/`

| Archivo | Qué hace |
|---|---|
| `public-collection-view.tsx` (server) | **Punto de entrada** de `/share/[slug]`. |
| `share-links-section.tsx` (client) | La lista de enlaces en Ajustes. |
| `share-link-card.tsx` (client) | Un enlace. |
| `share-link-creator.tsx` (client) | El `Sheet` de alta. |
| `share-link-status.ts` (módulo) | `active \| disabled \| expired \| revoked`. |
| `copy-to-clipboard.ts` (módulo) | Con fallback a `execCommand`. |
| `use-copy-to-clipboard.ts` (hook) | `Promise<boolean>`, sin temporizador. |
| `use-share-url.ts` (hook) | `` `${origin}/share/${slug}` ``. |
| `install-cta.tsx` (client) | La CTA de instalar la PWA. |

**El guard del DTO público no está acá**: vive en `lib/api/schema.ts`
(`toPublicSharedCollection`), junto con `toCardDto` / `toCardList` /
`toPriceList`, que son los que usan `app/(app)/carta/[id]/page.tsx` y
`home/preview-cards.ts`. Está en `lib/` y no en la carpeta de la pantalla porque es
el mismo guard para las dos rutas server y duplicarlo garantiza que uno de los dos
se quede sin validar.

Lo no obvio:

- **`shareLinkStatus` distingue cuatro estados, no dos.** La v1 mostraba
  "Revocado" tanto para `!isActive` como para revocado, así que "Revocado" y
  "Desactivado" se veían iguales. La tabla del módulo es explícita:

  | Estado | Copiar | Toggle | Acción |
  |---|---|---|---|
  | `active` | sí | sí | Desactivar |
  | `disabled` | no | **sí**, con un clic | Activar |
  | `expired` | no | no, sin tocar la fecha | ninguna |
  | `revoked` | no | **no**, hay que crear otro | ninguna |

  Y cada estado trae una `description` que *"responde la única pregunta que importa:
  ¿puedo recuperarlo?"*, *"siempre, en los cuatro estados. Sin esto el usuario tiene
  que adivinar desde el color del chip"*.
- **`useShareUrl` arma la ruta pública en un solo lugar.** El origen sale de
  `useSyncExternalStore` con **server snapshot `''`**: si el server renderizara
  `window.location.origin`, el primer render del cliente no coincidiría y React
  pelearía con el hydration.
- **`useCopyToClipboard` devuelve `Promise<boolean>` y no tiene temporizador.** El
  estado "copiado" es del componente, no de un hook compartido con un `setTimeout`
  de 1,8 s por cada botón.
- **`PublicCollectionView` es server-safe** y usa `MAX_PUBLIC_ITEMS = 500`: el
  límite de la vista pública, no el del grid. Si la colección tiene más, muestra
  las primeras 500 y lo dice.
- **El DTO público se valida con un guard, no con un cast.** `toPublicSharedCollection`
  en `lib/api/schema.ts`: el backend devuelve `unknown` en la práctica y un Server
  Component no puede confiar en `apiFetch`. Si el guard devuelve `null`, la página
  cae al `ErrorState` en vez de renderizar `undefined` en pantalla.

## 2.10 `auth/`

| Componente | Tipo | Qué hace |
|---|---|---|
| `auth-shell.tsx` | server | La card angosta: logo, nombre, título, form, link. |
| `login-form.tsx` | client | El formulario. |
| `register-form.tsx` | client | El formulario. |

- **`AuthShell` no usa `ScreenHeader` y no lleva `BottomNav`.** El header sobra
  (nada a qué volver) y la nav la saca el layout de la rama: `app/(auth)/layout.tsx`
  monta `PlainShell`, *"el único que puede sacarla — `app/(app)/layout.tsx` la
  monta para todas las demás"*.
- **El `pb` de `ScreenContainer` se sobreescribe** en el shell: acá no hay nav que
  reservar.
- **Server Component**: la card es puro layout, y el formulario client se le pasa
  como `children`. Por eso `login/page.tsx` y `registro/page.tsx` pueden ser
  server y exportar `metadata`.
- **Los dos formularios usan `PasswordInput`**, que antes no existía: con la
  contraseña autocompletada no había forma de verificar qué se escribió sin larga
  pulsación (que en iOS dispara el menú de pegar).
- El 409 del registro (email tomado) se maneja como estado propio del formulario,
  no como un error genérico.

## 2.11 `home/`, `marketing/` y `brand/`

Tres áreas: `brand/` es de la app entera, `home/` es el inicio tras abrir la PWA,
y `marketing/` es la página pública de adquisición y su FAQ.

| Componente | Tipo | Qué hace |
|---|---|---|
| `brand/app-mark.tsx` | server | El icono de marca. Lo usan la navegación desktop, auth y el marketing shell. |
| `home/app-preview.tsx` | server | El mock con `CardTile`. |
| `home/feature-grid.tsx` | server | Las features del inicio de la app. |
| `home/home-cta.tsx` | client | El CTA del inicio, que depende de la sesión. |
| `home/preview-cards.ts` (módulo) | `fetchPreviewCards()`. |
| `marketing/marketing-shell.tsx` | server | Cabecera, enlaces del sitio y footer público. |
| `marketing/landing-page.tsx` | server | Hero, prueba de producto, Gratis/Pro y CTA. |
| `marketing/faq-section.tsx` | server | FAQ compartida por `/` y `/faq`. |

- **`/inicio` es server y casi todo es estático.** La única parte que necesita el
  navegador es el CTA, porque depende de la sesión y la sesión vive en
  `sessionStorage`. Un solo client component chico.
- **`fetchPreviewCards` nunca tira.** El mock es decorativo: si el backend está
  caído, `/inicio` tiene que mostrar hero, CTA y features igual. Un `throw` mandaría
  la pantalla entera al `error.tsx` por tres imágenes. `[]` es un estado vacío
  legítimo y `AppPreview` devuelve `null`.
- **La landing pública `/` no comparte `BottomNav`**: una persona nueva necesita
  entender el producto antes de caer en las herramientas. La PWA arranca en
  `/inicio`, que sí hereda `AppShell` y sus cinco destinos móviles.
- **Gratis/Pro dice el estado real del producto.** Gratis está disponible hoy;
  Pro aparece como "En preparación", sin precio ni botón de compra, porque no
  existe billing todavía. La FAQ aclara qué ideas de Pro no están activas.
- **No hay testimonios ni rating inventados.** El bloque de prueba usa datos
  verificables del catálogo y explica límites del reconocimiento visual, la conexión y los precios.

---

## 3. `nav.ts` — la fuente única

```ts
export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/buscar', label: 'Buscar', icon: Search },
  { href: '/escanear', label: 'Escanear', icon: ScanLine },
  { href: '/colecciones', label: 'Colecciones', icon: Layers },
  { href: '/ajustes', label: 'Ajustes', icon: Settings },
] as const;
export function isNavItemActive(pathname: string, href: string): boolean;
```

**Los href son absolutos y no hay prefijo.** No existe ninguna constante de base
que componer: `NAV_ITEMS` es la lista completa de destinos de la `BottomNav` y el
único lugar del código donde hay que tocar para cambiar el orden o los destinos
de la navegación.

El orden es el del ciclo de uso, no el de "la pantalla más importante primero":
mirar qué tengo, agregar algo nuevo, ver el conjunto, ajustar el comportamiento.
**Escanear va segundo y no primero** porque la pantalla de arranque es el
catálogo, no el escáner.

Cuando la ruta `/perfil` se renombró a `/ajustes`, este archivo fue el que hizo
consistente el cambio, y `app/(app)/perfil/route.ts` deriva el destino del redirect
de acá (`NAV_ITEMS[NAV_ITEMS.length - 1].href`) en vez de hardcodear la cadena.

---

## 4. Lo que este documento no cubre

- **Tokens, motion, z-index, spacing y el resto del sistema visual**:
  [`design-system.md`](design-system.md).
- **Las rutas, quién las puede ver y de dónde traen los datos**:
  [`routes.md`](routes.md).
- **Los bugs que costaron tiempo**: [`gotchas.md`](gotchas.md).
- **Cómo se trabaja acá, en general**: [`build-guide.md`](build-guide.md).
- **La historia de por qué la app es como es** (incluido el rediseño y el flip):
  [`redesign-2026.md`](redesign-2026.md).
