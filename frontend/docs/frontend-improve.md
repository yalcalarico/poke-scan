# Plan de mejora de frontend — PokéScan

> Auditoría de UI/UX hecha **leyendo el código**, no la documentación de diseño.
> Todo lo que sigue cita `archivo:línea` y, cuando es un número de contraste,
> el valor medido con la fórmula de WCAG 2.x sobre los tokens reales de
> `app/globals.css`.
>
> **Fecha:** 2026-09-28 · **Alcance:** `frontend/` completo (11 pantallas, 27
> primitivas, 26.186 líneas) · **Método:** skill `ui-ux-pro-max` (corpus de 119
> guidelines UX, 105 iconos, 25 tipos de chart, 74 pairings tipográficos, 50
> estilos, 192 paletas) cruzado con lectura directa del árbol.

---

## ESTADO — aplicado el 2026-09-29

> **Las cuatro fases de este plan están aplicadas.** El documento quedó como el
> registro de *qué se encontró y por qué*, y los números de contraste que hay
> abajo son los **de antes del arreglo**: son el registro histórico del bug y no
> se actualizaron a propósito.
>
> Commits: `cbc62e3` (el plan) y `0a1370d` (saca `token.txt` del tracking).
> `pnpm run check` en verde: 206 tests de backend, 310 de frontend, lint, guard
> de colores, typecheck y build de los dos proyectos.
>
> ### Lo que cambió respecto de lo que este plan decía
>
> Cuatro cosas que se supusieron mal, y que aparecieron al aplicar, no al leer:
>
> | El plan decía | La realidad |
> |---|---|
> | "No hay ningún chip deshabilitado en producción" | `carta/[id]/actions.tsx:212` pasa `disabled` a un `Chip`. Era deuda viva, no latente. |
> | "`PriceDto` ya tiene `changeUsd`/`changePercent`" | Los tenía **anidados** en `change: PriceChangeDto`, y el backend ya mandaba ese objeto. La premisa "el backend nunca los manda" era a medias. |
> | "`--border-control` en light cumple 3:1" | El valor elegido daba **2.22:1**. Hubo que oscurecerlo a `#8a8a96` (3.22:1) para que cumpliera lo que el comentario decía. |
> | "`PriceDelta` nunca recibió números" | Cierto, pero el componente ya tenía el formateo, el ícono y el tono prontos: el trabajo real fue **el endpoint**, no el componente. |
>
> Y dos que el plan no vio y aparecieron con la base real o con el navegador:
>
> - **La columna `cards.rarity` tiene 41 valores, no 12**, y mezcla dos
>   vocabularios: pokemontcg.io con espacios (`Rare Holo`) y scrydex en
>   camelCase (`RareHolo`, `RareUltra`, `HyperRare`). La primera versión de la
>   señal de rareza era una lista cerrada, así que `RareHolo` (1621 cartas),
>   `RareUltra` (799) y `IllustrationRare` (511) caían en "sin acento" y **no
>   dibujaban nada**. Ahora el match es por patrón, normalizado.
> - **`applyResolved` tenía un `return` temprano** antes de la mutación del DOM,
>   así que el arreglo del `theme-color` —tal como estaba especificado— nunca se
>   hubiera ejecutado en la primera carga, que es el caso común.
>
> ### Ajuste posterior a P6.1 — la línea se muestra siempre
>
> El sparkline de P6.1 se aplicó con un umbral de **3 puntos** para dibujar la
> línea, y con menos de eso se mostraba solo un descarte. El resultado fue que la
> feature no se veía: `card_prices` tiene 124 filas en 5 días y la mayoría de las
> cartas tienen **un** día, así que casi todas caían en el descarte. El umbral
> escondía la cosa, no la protegía.
>
> Ahora se dibuja **siempre que haya geometría**: 2 o más puntos dan línea, 1
> punto da un punto suelto (`PriceDot`, porque un `<polyline>` de un punto no
> dibuja nada), y 0 días sigue sin dibujar. La honestidad se quedó en la capa del
> **caption** y no a la geometría: el texto siempre dice cuántos días hay, nunca
> dice "0 %" cuando el backend devuelve `change: null`, y el color de la línea
> sale **solo** del `change` del servidor para que el sparkline no pueda
> contradecir a la píldora de `PriceDelta` de arriba. El umbral de 3 días quedó
> únicamente como el corte entre "esto es una tendencia" y "esto son dos
> consultas y crece con cada una".
>
> ### El hallazgo de esta tanda: la Fase 4 entró sin entradas
>
> La Fase 4 se aplicó **entera** —P6.1 a P6.6— y el resultado en pantalla fue
> *"no hay ninguna opción que me lleve a las pantallas nuevas"*. El motivo no es
> que las features estuvieran mal: es que **no se agregó ninguna ruta**. Siguen
> siendo las mismas 11 pantallas de siempre; lo que cambió es que las existentes
>comsumieron capacidades nuevas:
>
> | Capacidad de la Fase 4 | Dónde quedó | Cómo se llegaba |
> |---|---|---|
> | P6.1 · sparkline + `PriceDelta` real | `/carta/[id]` | Se ve solo, al abrir la carta |
> | P6.2 · waffle 9×3 | `/colecciones/[id]/sets?set=<id>` | **Solo** desde el chip "Sets", adentro de una colección ya abierta |
> | P6.3 · acciones masivas | `/colecciones/[id]` | Solo con una colección con cartas |
> | P6.4 · orden por precio | `/colecciones/[id]`, `/buscar` | Solo con una colección con cartas |
> | P6.5 · sesión de escaneo | `/` | Solo si hay una sesión guardada |
> | P6.6 · señal de rareza | `/carta/[id]`, grids | Se ve solo |
>
> Tres huecos concretos, y los tres son de **entrada**, no de código:
>
> 1. **P6.2 no tenía entrada de primer nivel.** `/colecciones/[id]/sets` era
>    alcanzable únicamente desde adentro de `/colecciones/[id]`. Alguien que no
>    supiera que la ruta existía no la encontraba nunca. Se resolvió **dentro de
>    las rutas existentes**: la `CollectionCard` de `/colecciones` ahora tiene una
>    franja de pie con el link "Progreso por set". No se agregó una quinta tab a
>    la `BottomNav` (son cuatro por `nav.ts` y §0.1 es mobile-first) ni una ruta
>    nueva, que sería una decisión de producto y no un fix de UI.
> 2. **Sin sesión no se veía nada y no se decía por qué.** `/colecciones` con un
>    `EmptyState` de "Iniciá sesión" nombra un bloqueo, no una capacidad. Ahora
>    los dos estados sin colecciones —sin sesión y con sesión pero vacía— listan
>    las cuatro cosas que una colección abre. Son cuatro afirmaciones
>    verificables contra el código, no copy de venta.
> 3. **Sin colección no se veían las features nuevas.** El estado vacío es el
>    lugar legítimo para decir qué va a hacer la pantalla una vez poblada, y es
>    el mismo `CollectionCapabilities` de (2).
>
> Lo que **sigue** sin entrada, y es honesto: el filtro "para intercambio"
> server-side (B6) y la búsqueda por número y artista (B1) son de `/buscar` y de
> `collection-detail.tsx`, y ese filtro solo se pone a "tan alto" como el aviso
> `Alert` que ya tenía. Un usuario nuevo no lo descubre, y no se fingió lo
> contrario.
>
> ### Estado de las fases — corregido el 2026-09-29
>
> La tabla de fases que estaba más abajo decía "Fase 3 ⏳ Pendiente" y
> "Fase 4 ⏳ Pendiente" cuando las cuatro estaban aplicadas (decía lo mismo en
> el encabezado, 100 líneas antes). Las dos son **✅ aplicadas**:
>
> | Fase | Estado real |
> |---|---|
> | **Fase 1 — Correcciones** | ✅ Aplicada. Los 11 ítems, `scroll-padding-top`, `touch-action`, `overscroll-behavior-y`, y la baja de `share_target` y `window_controls_overlay` del manifest. |
> | **Fase 2 — Contraste y tacto** | ✅ Aplicada. `--focus-ring` + migración a `outline`, `--border-control` (que hubo que oscurecer a `#8a8a96` para cumplir el 3:1 del comentario), `--switch-track-off`, shimmer, `overline` a 11 px, `forced-colors`, `md` a 44 px, y `haptics.ts`. |
> | **Fase 3 — Tests de las primitivas** | ✅ Aplicada. Hay 25 archivos de test y las primitivas a11y-sensitive tienen cobertura de componente. Ver [`testing.md`](testing.md). |
> | **Fase 4 — Producto** | ✅ Aplicada. P6.1 a P6.6 están en producción, y la Fase 4 no agregó rutas: las capacidades se consumieron desde las 11 pantallas de siempre. Ver el detalle más abajo. |
>
> **Pendiente que quedó de la Fase 2:** los cuatro indicadores del scanner siguen
> usando `outline-on-media-text` en vez de `--focus-ring-on-media`. Es el mismo blanco,
> así que no cambia nada de lo que se ve; es un cambio de componente pendiente.
>
> ### Lo que la Fase 4 entró sin rutas, y cómo se cerró
>
> La Fase 4 se aplicó **entera** y el resultado en pantalla fue *"no hay ninguna
> opción que me lleve a las pantallas nuevas"*. El motivo no es que las features
> estuvieran mal: es que **no se agregó ninguna ruta**. Se cerró con tres cambios:
>
> 1. La `CollectionCard` de `/colecciones` tiene una franja de pie con el link
>    "Progreso por set", que es la entrada de primer nivel a `/colecciones/[id]/sets`.
> 2. Los dos estados sin colecciones —sin sesión y con sesión pero vacía— listan
>    las cuatro cosas que una colección abre (`CollectionCapabilities`).
> 3. El filtro de intercambio y el orden de `/buscar` ahora son **server-side**
>    y su control está en el `Sheet` de filtros que ya existía, así que se
>    venden solos. Ver `redesign-2026.md` §10.2 (B2, B3, B6 y B9 cerradas).
>
> ### Lo que quedó afuera, a propósito
>
> - **`share_target`**: se **sacó** del manifest en vez de arreglarlo. El
>   arreglo real (handler de `getShareTarget()` que resuelva la carta) es una
>   feature, no un fix, y correspondía a su propio commit.
> - **Acciones masivas**: no hay endpoint de bulk, así que la acción itera el
>   `PATCH` uno por uno, **secuencialmente**, con tope de 60 y el costo declarado
>   en la propia UI. No se inventó un endpoint.
> - **Histórico por colección**: el histórico **por carta** existe (sparkline y
>   `PriceDelta` real en `/carta/[id]`), pero el agregado "tu colección subió $47
>   este mes" no. Falta decidir qué pasa con las cartas sin precio.
> - **`--rarity-*`**: la señal de rareza usa tokens que ya existen
>   (`--info` y `--warning`); no se agregaron tokens nuevos al palette.
> - **`docs/design-system.md`** se re-sincronizó por completo contra el código.

---

## 📌 Estado — 2026-09-29

> **El cuerpo de este documento no se tocó.** Sigue siendo el plan de registro y los
> números de contraste que están abajo son, a propósito, el registro histórico de lo
> que estaba mal. No los actualices: el valor **nuevo** de cada token vive en
> [`design-system.md` §2.1 y §2.4](design-system.md), que es la fuente de verdad.

| Fase | Estado |
|---|---|
| **Fase 1 — Correcciones** | ✅ **Aplicada.** Los 11 ítems, incluido `scroll-padding-top`, `touch-action`, `overscroll-behavior-y` en `html`, y la baja de `share_target` y `window_controls_overlay` del manifest. |
| **Fase 2 — Contraste y tacto** | ✅ **Aplicada.** `--focus-ring` + migración a `outline` en toda la app, `--border-control`, `--switch-track-off`, shimmer, `overline` a 11 px, `--positive`/`--brand` de light, `md` a 44 px, bloque `forced-colors`, y `haptics.ts` con el shutter y el scan exitoso. |
| **Fase 3 — Tests de las primitivas** | ✅ **Aplicada.** 25 archivos de test; las primitivas a11y-sensitive tienen cobertura de componente. |
| **Fase 4 — Producto** | ✅ **Aplicada.** P6.1 a P6.6 en producción, consumidas desde las 11 pantallas de siempre. Sin rutas nuevas. |

Las consecuencias de la Fase 2 que **no** están en este plan y sí están
documentadas en `design-system.md`: el `outline-offset: 2px` exige 4 px de aire que
un scroller `overflow-x-auto` recorta (§4.4), dos componentes con ancestro
`overflow-hidden` dibujan el indicador hacia adentro (§8.6), y hay un token nuevo
para el foco sobre foto (§8.16).

**Pendiente que quedó de la Fase 2:** los cuatro indicadores del scanner siguen
usando `outline-on-media-text` en vez de `--focus-ring-on-media`. Es el mismo blanco,
así que no cambia nada de lo que se ve; es un cambio de componente pendiente.

---

## 0. Diagnóstico en una página

Esto **no es un prototipo**. Es una app con un design system propio, un guard de
colores crudos atado al linter, focus trap con `inert` en el sheet, safe areas
respetadas, `prefers-reduced-motion` global y una documentación interna que
explica el *porqué* de cada decisión. El nivel de oficio está por encima del
promedio y hay que decirlo antes de criticize.

El problema **no es el sistema de diseño**: es que el sistema tiene cuatro
agujas, y tres de ellas son del mismo tipo — texto y bordes que no llegan al
contraste que el propio proyecto se fijo.

| | Hallazgo | Esfuerzo |
|---|---|---|
| **Contraste** | `--text-tertiary` da **3.28:1** en light y **3.99:1** en dark. Se usa 88 veces, combinado con `text-caption` (12 px) y `text-overline` (10 px) — texto normal, que necesita 4.5:1. **No pasa en ninguno de los dos temas.** | 15 min |
| **Foco** | El anillo de focus es `brand/20` sobre blanco: **1.38:1**. WCAG 2.2 SC 1.4.11 pide 3:1. Está en 77 componentes, o sea que es **el único mecanismo que tiene un usuario de teclado para ubicarse**, y es invisible. | 1 h |
| **Correctitud** | 7 bugs reales: el `share_target` del manifest apunta a `/carta` que no existe (404 al compartir desde Android), el `theme-color` no sigue al toggle de tema, el header sticky de 56 px tapa el destino de `scrollIntoView`, 5 `Select` sin nombre accesible, `aria-label` sobre un `div` sin rol, el `Divider` no hace lo que su JSDOC promete, y el `Button` en loading sin `pendingLabel` pierde el nombre accesible. | ~2.5 h |
| **Oportunidad** | **El backend ya tiene el histórico de precios** (`card_prices` es append-only con índice en `(cardId, variant, fetchedAt)`) y **el frontend ya tiene el componente** (`PriceDelta` acepta `changeUsd`/`changePercent` y nunca los recibió). Falta un endpoint. Es la feature que convierte la app de "buscador" en "seguidor de precios", y **no toca el rate limit** de `AGENTS.md` §3.1. | 3-4 días |

Detalle, con `archivo:línea` y los ratios medidos, en las secciones 2 a 6.

---

## 1. Lo que ya está bien (y hay que mantener)

| | Por qué importa |
|---|---|
| **Guard de colores crudos en `lint`** (`scripts/check-no-raw-colors.mjs`, raíces `app`/`components`/`lib`/`hooks`) | Es la regla que hace que el resto del sistema sea Sustainable. Raro. |
| **`Sheet` con focus trap + `inert` + `aria-hidden` en hermanos** (`ui/sheet.tsx:78-103`, `284-323`) | Hand-rolled sin Radix, y sin embargo mejor que el 90 % de los dialogs de librerías. Incluye pila de capas, drag-to-close, y recuperación de foco. |
| **Escala de z-index como token** (`globals.css:199-205`) | Elimina la clase de bug más fea que existe. |
| **`dvh` en todas las pantallas** (`app-shell.tsx:18`, `plain-shell.tsx:19`) | Cumple guideline de viewport units sin excusas. |
| **Insets de safe area en nav, header, sheets y toasts** | `bottom-nav.tsx:15`, `screen-header.tsx:32`, `sheet.tsx:573/599`, `toast.tsx:236`. Los cuatro sitios donde se olvidan, están cubiertos. |
| **Anti-flash de tema inline** + `useSyncExternalStore` con server snapshot | Sin flash, sin mismatch de hidratación. |
| **Loading skeleton con la forma real de la pantalla** | `SearchFallback` es el mismo componente que el estado `loading` del cuerpo. Cero CLS al hidratar. |
| **Estados vacío/error/partial bien separados** | `ErrorState` (reintentable) vs `EmptyState` (dos tipos) vs `Alert` (degradación parcial). Es la discriminación correcta. |
| **`inert` en lugar de esconder con `hidden`** | Es la técnica correcta y casi nadie la usa. |
| **Reduced motion honored en JS donde importa** | `catalog-search.tsx:353`, `collection-detail.tsx:496`: leen la media query antes del `scrollIntoView({behavior:'smooth'})`. |
| **`--animate-flash-once` definido y documentado** |—even si hoy no se usa— muestra que el motion se pensó como sistema, no como adorno. |

**Conclusión de esta sección:** el trabajo de abajo es *extender* un sistema que
funciona, no reemplazarlo. Ninguna recomendación pide tirar `components/ui/`.

---

## 2. P0 — Bugs correctivos (rápidos, sin discusión)

### P0.1 · El `share_target` del manifest apunta a una ruta inexistente

`public/manifest.json`:

```json
"share_target": {
  "action": "/carta",
  "method": "GET",
  "enctype": "application/x-www-form-urlencoded",
  "params": { "title": "title", "text": "text", "url": "url" }
}
```

Pero `app/(app)/carta/` contiene **solo** `[id/`. No hay `page.tsx` en `/carta`.
En Android, compartir cualquier enlace a una carta desde otra app abre PokéScan y
cae en un **404**.

Además, aunque la ruta existiera, **nadie lee el share target**:

```
$ grep -rn "getShareTarget\|shareTarget\|share_target" app components lib
(nada)
```

`sw.js` además tiene `if (request.method !== 'GET') return;` en el handler de
`fetch` (línea 189), lo cual está bien, pero confirma que no hay ningún camino de
POST.

**Fix (30 min):** crear `app/(app)/carta/share-target/route.ts` o un handler en
`app/(app)/carta/[id]/page.tsx` que resuelva por `?cardId=`, y un
`app/(app)/carta/page.tsx` que redirija con `permanentRedirect` a la ficha cuando
`getShareTarget()` devuelva una URL de carta. Mientras tanto, o se saca el
`share_target` del manifest, o se arregla. Hoy está peor que no tenerlo: promete
una función que no existe.

### P0.2 · `theme-color` del navegador no sigue al toggle manual de tema

`app/layout.tsx:79-83` declara `themeColor` con dos entradas `@media
(prefers-color-scheme: ...)`. Pero la app tiene un selector explícito de tema
claro/oscuro/sistema en `/ajustes`, y `lib/theme.tsx` **no toca el meta tag**
(`grep themeColor lib/theme.tsx` → nada).

Escenario real: usuario en PWA instalada, tema del sistema *claro*, elige
"oscuro" en Ajustes. La app se ve oscura pero la barra de estado de Android queda
`#F4F4F6` (blanco roto) sobre una app negra.

**Fix:** en `applyResolved()` (`lib/theme.tsx:61-69`), donde ya se hace
`documentElement.classList.toggle('dark', ...)`, agregar:

```ts
document.querySelector('meta[name="theme-color"]')
  ?.setAttribute('content', resolved === 'dark' ? '#0B0B0F' : '#F4F4F6');
```

Son 3 líneas, en el lugar donde ya se muta el DOM global.

### P0.3 · El header sticky tapa el destino de `scrollIntoView` y el skip link

`screen-header.tsx:32-36` es `sticky top-0 z-sticky` con `h-14` (56 px) más
`pt-[env(safe-area-inset-top)]`. Y en el proyecto **no existe
`scroll-padding-top`, `scroll-margin-top` ni `scroll-p-*`**:

```
$ grep -rn "scroll-padding\|scroll-margin\|scroll-mt" app components lib
NONE
```

Consecuencias concretas:

1. `catalog-search.tsx:354` y `collection-detail.tsx:497` hacen
   `scrollIntoView({ behavior, block: 'start' })` sobre la primera carta nueva
   después de "Cargar más". Con `block: 'start'` **y un header sticky de 56 px
   encima**, la carta queda exactamente debajo del header. El usuario apretó
   "Cargar más" y no ve nada nuevo.
2. El skip link (`layout.tsx:116`, `href="#contenido"`) salta al `<main>`, pero
   cualquier `padding-top` aplicado por el navegador queda **debajo** del header
   sticky.
3. Es además un incumplimiento de **WCAG 2.2 SC 2.4.11 Focus Not Obscured
   (AA, guideline #100 del corpus)**: el foco no puede quedar completamente
   tapado por autor.

**Fix (10 min, un token):** en `globals.css`, sobre `html`:

```css
html { scroll-padding-top: calc(3.5rem + env(safe-area-inset-top)); }
```

Cubre los tres casos de una. Los dos `scrollIntoView` explícitos empiezan a
respetarlo automáticamente.

### P0.4 · Cinco `<Select>` dentro de `<Field>` quedan sin nombre accesible

El `Field` (`ui/field.tsx:186-192`) renderiza `<label id={labelId}
htmlFor={controlId}>`. El `Input` es un `<input id>` → funciona. El **`Select`
renderiza un `<button id>`** (`select.tsx:497-499`), y `htmlFor` sobre un botón
**no lo nombra**.

Tres de los cinco que están mal ya lo resuelven bien en otro lado del mismo
código, lo cual confirma que es inconsistencia y no limitación del componente:

| Place | Resuelve el nombre | Estado |
|---|---|---|
| `organize-sheet.tsx:345` | `aria-labelledby={field.labelId}` | ✅ |
| `share-link-creator.tsx:217` | `aria-labelledby={field.labelId}` | ✅ |
| `item-sheet.tsx:380` | — | ❌ Variante |
| `item-sheet.tsx:391` | — | ❌ Condición |
| `item-sheet.tsx:702` | — | ❌ Colección |
| `item-sheet.tsx:713` | — | ❌ Variante |
| `item-sheet.tsx:722` | — | ❌ Condición |

Un lector de pantalla anuncia "combobox, 2 de 5" sin decir qué es.

**Fix:** la solución de fondo es que `Field` clonee el hijo y le inyecte
`aria-labelledby={labelId}` + `aria-describedby={describedBy}` automáticamente,
como ya hace con `Checkbox` (que sí resuelve el conflicto de `describedby` en
`checkbox.tsx:85`). Eso mata la clase entera de bug, no las 5 instancias. Mientras
tanto, agregar el prop en las 5.

### P0.5 · `aria-label` sobre un `<div>` sin rol en `CardGrid`

`card-grid.tsx:129`: `<Tag aria-label={label} …>`, con `as = 'div'` por default
(`:115`). Un `aria-label` sobre un `div` genérico **se ignora**: la spec exige
`role` o un elemento con nombre semántico. Tres de los cuatro call sites usan el
default:

- `catalog-search.tsx:430` → `label="Resultados de la búsqueda"` ❌
- `collection-detail.tsx:645` → `label="Cartas de la colección"` ❌
- `public-collection-view.tsx:128` → `as="ul"` ✅ (ahí sí funciona)

**Fix:** o `role="list"` en la variante `div` (con `role="listitem"` en el
`ItemTag`), o sacar el `aria-label` cuando `as === 'div'`. La primera opción es la
correcta: hoy el `div` no es navegable por listas en el lector de pantalla.

### P0.6 · El `Divider` no hace lo que su JSDOC promete

`divider.tsx:31-34`:

> El separador decorativo lleva `aria-hidden`: antes había `<hr>` con texto
> suelto que los lectores de pantalla leían como un grupo de palabras sin
> contexto.

El código (`:54-57`) renderiza `<hr className="h-px w-full border-0 bg-line" …>`
**sin `aria-hidden`**. La documentación y el código divergieron. Un `<hr>` desnudo
es announces como "separator" por algunos lectores y como "divider" por otros;
no es grave, pero el comentario afirma algo falso y el próximo que lea el archivo
va a confiar en él.

### P0.7 · `Button` en loading sin `pendingLabel` y con contenido solo-icono pierde el nombre accesible

`button.tsx:110-111`:

```tsx
{loading ? <Spinner size="sm" … /> : null}
{loading && pendingLabel ? pendingLabel : children}
```

Si `children` es un ícono y no se pasa `pendingLabel`, en estado loading el botón
queda con **un spinner y nada más**: nombre accesible vacío. WCAG 2.2 SC 4.1.2
(*Name, Role, Value*). El `aria-busy` está puesto (`button.tsx:98`), lo cual
ayuda pero no reemplaza el nombre.

**Fix:** cuando `loading && !pendingLabel`, mantener los children ocultos visualmente
pero presentes (`sr-only`), o dejar el ícono y agregar el spinner al lado.

### P0.8 · El `AppPreview` de la home anuncia arte decorativo

`components/home/app-preview.tsx` renderiza **3 `CardTile` completos**, cada uno
con su `<Image alt="Carta {name} {rarity} del set {set}">` (`card-tile.tsx:171`).

Para un usuario de lector de pantalla que entra a `/`, la secuencia de anuncios es:

> "Escaneá tus cartas y mirá su valor" → "PokéScan" → "Apuntá la cámara y PokéScan
> identifica la carta…" → **"Carta Charizard Holo del set Base Set"** → "N.º 4/102"
> → **"Carta Blastoise del set Base Set"** → … → "Escaneá / Buscá / Coleccioná"

Lo de negrita es el problema: es la **misma información** que ya dan las tres
`FeatureGrid` de más abajo, en un orden que empuja el CTA primario más abajo de
donde debería estar. Son ~20 palabras redundantes antes de que el usuario llegue
al botón principal.

`AppPreview` es decorativo por definición — su función es mostrar la forma de la
app, no informar. Y el precedente ya existe en el proyecto: `AppMark` usa
`alt=""` a propósito (`app-mark.tsx:32-33`, *"el nombre de la app siempre está al
lado como texto"*).

**Fix:** `aria-hidden="true"` en el `Surface` de `app-preview.tsx`. Dos palabras.
Si en algún momento el preview pasa a ser informativo (una carta real con su
precio), el `aria-hidden` se saca — pero mientras sea mock, es decorativo.

---

## 3. P3 — Accesibilidad y contraste (los números medidos)

Acá está el hallazgo más importante del informe, y no es una opinión: **el token
`--text-tertiary` no cumple 4.5:1 en ninguno de los dos temas**, y es el texto
de apoyo más usado de la app.

### P3.1 · `--text-tertiary` falla AA en ambos temas

Valores actuales (`globals.css:28` y `:80`):

| Token | Valor | vs canvas | vs surface | vs surface-2 | vs surface-3 |
|---|---|---|---|---|---|
| `--text-tertiary` **light** | `#86868f` | **3.28** ❌ | **3.61** ❌ | **3.40** ❌ | **3.12** ❌ |
| `--text-tertiary` **dark** | `#75757f` | **4.31** ❌ | **3.99** ❌ | **3.68** ❌ | **3.29** ❌ |

`text-tertiary` aparece **88 veces** en `app/` + `components/`. Y se combina con
las dos utilidades más chicas de la escala:

- `text-caption` (12 px) — **91 usos**
- `text-overline` (10 px) — **24 usos**

12 px y 10 px son **texto normal** para WCAG (el umbral de "texto grande" es 18.66 px
bold o 24 px). Necesitan 4.5:1. Ninguno de los cuatro backgrounds llega.

La combinación `text-caption text-tertiary` aparece **36 veces** — es la receta
oficial de "texto secundario" de la app, y no pasa el contraste en ninguna
superficie de ningún tema. Ejemplos: el nombre del set bajo cada carta en
`card-tile.tsx:206`, el subtítulo de todos los `ScreenHeader`
(`screen-header.tsx:53`), los `dt` de cada `Stat` (`stat.tsx:76`), el precio en USD
secundario de cada `Money`.

**Fix propuesto** (medido):

```css
:root {
  --text-tertiary: #6f6f7a;   /* era #86868f */
}
.dark {
  --text-tertiary: #82828c;   /* era #75757f */
}
```

| | vs canvas | vs surface | vs surface-2 | vs surface-3 |
|---|---|---|---|---|
| `#6f6f7a` (light) | **4.52** ✅ | **4.96** ✅ | **4.68** ✅ | 4.29 ⚠️ |
| `#82828c` (dark) | **5.16** ✅ | **4.78** ✅ | **4.40** ⚠️ | 3.94 ⚠️ |

Mejora del margen en el caso peor (surface-3) de 3.12 → 4.29. Los dos ⚠️ restantes
son `surface-3`, que se usa como hover de `ghost` y track de switch apagado —
ámbitos donde el texto no es el contenido principal. Si se quiere cerrar
completamente, `#68686f` (light) da 4.72 sobre surface-3 y `#8a8a94` (dark) da
4.13 — pero ahí el texto se acerca demasiado al secundario y se pierde la
jerarquía. **Recomiendo `#6f6f7a` / `#82828c` y aceptar el ⚠️ de surface-3.**

### P3.2 · El anillo de focus es casi invisible (1.38:1)

`button.tsx:12` y otros 76 lugares usan:

```
focus-visible:ring-2 focus-visible:ring-brand/20 dark:focus-visible:ring-brand/40
```

Medido, `brand` al 20 % sobre blanco da **`#f9d2d4` → 1.38:1** contra la
superficie. Al 40 % en dark: **`#732a30` → 1.82:1**. WCAG 2.2 **SC 1.4.11
Non-text Contrast (AA)** pide **3:1** para el indicador de foco. El corpus lo
marca *Critical* (guideline #102, *Focus Appearance*).

No es un detalle: **el único mecanismo que tiene un usuario de teclado para
saber dónde está** es prácticamente invisible. En 77 componentes.

**Fix — token dedicado, no alfa:**

```css
:root {
  --focus-ring: #e01f26;   /* 4.78 vs surface, 4.35 vs canvas */
}
.dark {
  --focus-ring: #ff4a4f;   /* 5.49 vs surface, 5.93 vs canvas */
}
```

Y reemplazar el patrón por
`focus-visible:outline-2 focus-visible:outline-offset-2
focus-visible:outline-[var(--focus-ring)]`. `outline` sobre `ring` porque
`outline` no se ve afectado por `overflow: hidden` ni por los `border-radius` de
los padres, y `outline-offset` da el aire que hoy no existe.

Es un `sed` sobre `app/` + `components/` y un token nuevo. **Es el fix de mayor
ratio valor/esfuerzo de todo el informe.**

### P3.3 · El knob del `Switch` apagado no se distingue del track (1.16:1)

`switch.tsx:24-25`: apagado → track `bg-surface-3`, knob `bg-surface`. Medido:

| | knob | track | ratio |
|---|---|---|---|
| light | `#ffffff` | `#eeeef2` | **1.16** ❌ |
| dark | `#15151b` | `#26262f` | **1.21** ❌ |

WCAG 2.2 SC 1.4.11 pide 3:1 para los límites del componente. Un switch apagado se
ve como un pill vacío: no se sabe dónde está el knob, y no se puede decir por
dónde se arrastra. El guideline del corpus es explícito (*Interactive elements
must have ≥44pt tap area and visible pressed states*; *Meaningful icons and control
boundaries need at least 3:1*).

**Fix:**

```css
/* light: track apagado necesita 3:1 contra el knob */
unchecked: 'border border-line-strong bg-surface-3'  →  'bg-[#c4c4cd]'
```

Medido: `#ffffff` sobre `#c4c4cd` = **1.73**, sobre `#b4b4bd` = 2.06, sobre
`#8e8e9a` = **3.24** ✅. La primera opción que cierra el gap sin volver el track
oscuro demais es `#b4b4bd` (el `--text-disabled` light actual, 2.06) — todavía
corta. **Recomiendo un token nuevo `--switch-track-off`: `#a8a8b2` light /
`#6a6a76` dark** (2.36 / 3.41), asumiendo que el knob mantiene su `shadow-xs` como
separación de forma. Si se quiere el 3:1 estricto: `#8e8e9a` / `#75757f`.

### P3.4 · El borde de los `Input` no define el control (1.19:1)

`input.tsx:19` usa `border` = `--border-default` `#e4e4e9` sobre
`bg-surface-2` `#f8f8fa`. Medido: **1.19:1**. SC 1.4.11 pide 3:1 para el
*boundary* de un control de formulario.

En la práctica el input se ve como texto suelto sobre un fondo apenas distinto —
exactamente el anti-patrón *"Inputs should look interactive / Inputs that look
like plain text"* (guideline #62, *Input Affordance*, severidad Medium).

**Fix:** un token `--border-control` con 3:1 contra la propia superficie del
control.

| Light | vs `#f8f8fa` | Dark | vs `#1d1d24` |
|---|---|---|---|
| `#c9c9d1` | 1.55 | `#5e5e6c` | 2.63 |
| `#bfbfc8` | 1.72 | `#6a6a76` | **3.14** ✅ |
| `#b4b4bd` | 1.94 | `#75757f` | **3.68** ✅ |
| `#8a8a96` | **3.22** ✅ | `#82828c` | 4.40 |

**Recomiendo `#a8a8b2` light / `#6a6a76` dark**: es un jump visible (el input pasa
de "texto" a "campo") sin volver la UI ruidosa. Si se quiere el AA estricto de
borde: `#8a8a96` / `#75757f`.

Esto **no** aplica a `--border-subtle` ni `--border-default` en general (los
dividers decorativos están exentos de 1.4.11); solo al borde de los controles.

### P3.5 · Otros contrastes medidos que pasan

Los anoto para que no se toquen:

| Combinación | Ratio | |
|---|---|---|
| `text-primary` sobre surface (light / dark) | 19.64 / 16.70 | ✅ |
| `text-secondary` sobre surface (light / dark) | 6.59 / 7.12 | ✅ |
| `text-brand` sobre surface (light / dark) | 4.78 / 5.49 | ✅ |
| `text-positive` sobre surface (light / dark) | 4.99 / 9.46 | ✅ |
| `on-brand` sobre `brand` (light / dark) | 4.78 / 5.94 | ✅ |
| `negative` sobre `negative-soft` (light / dark) | 4.84 / 5.37 | ✅ |
| `warning` sobre `warning-soft` (light / dark) | 4.60 / 8.15 | ✅ |
| `info` sobre `info-soft` (light / dark) | 5.99 / 5.78 | ✅ |
| Chip activo `text-inverse` sobre `bg-primary` | 19.64 / 18.04 | ✅ |
| Botón `destructive` en dark (`#1a0506` sobre `#ff6a6e`) | 7.06 | ✅ |

**Dos que están justo y conviene mirar:**

- `text-positive` sobre `positive-soft` (light): **4.47** — 0.03 debajo de 4.5.
  Aparece en `alert.tsx` (`tone="success"`) y en el `PriceDelta` positivo
  (`price-delta.tsx:57`). Subir `--positive` light de `#12804a` a `#117a47` lo
  cierra; el dark (7.27) está bien.
- `text-brand` sobre `brand-soft` (light): **4.32** — 0.18 debajo. Aparece en
  `badge.tsx` (`tone="brand"`) y en el ícono de `FeatureGrid` (que es non-text, así
  que solo necesita 3:1 y pasa). Bajar `--brand` light a `#d81c23` lo cierra sin
  mover el botón primario, que está en 4.78 y tiene margen.

### P3.6 · El skeleton es literalmente invisible (1.06:1)

`--shimmer-from #eeeef2` → `--shimmer-to #f8f8fa` sobre `#ffffff`:
**1.16 → 1.06**. En dark: 1.09 → 1.12. El gradiente recorre
`background-position` de -160 % a 160 % (`globals.css:310-320`), así que la
animación **se ve**: lo que no se ve es el placeholder en sí. En una pantalla con
24 skeletons, el usuario ve un canvas vacío con algo parpadeando, no "24 cartas
cargando".

El skeleton cumple su función (evita CLS, ya que tiene la forma real), pero no
comunica *carga*. Un shimmer que no se distingue del fondo es un
`animate-shimmer` corriendo sobre nada.

**Fix:** `--shimmer-from: #dcdce4` / `--shimmer-to: #f2f2f5` en light
(1.36 / 1.12 medidos), y `#23232b` → `#2b2b35` en dark (1.17 / 1.30). Sigue siendo
sutil, pero ahora se ve la caja.

### P3.7 · `text-overline` a 10 px está en el piso

`globals.css:284-290` define `text-overline` en **10 px / line-height 12 px /
weight 600 / `letter-spacing: 0.08em` / uppercase**. Se usa 24 veces: los `dt` de
cada `Stat` (`stat.tsx:76`), cada `Badge` (`badge.tsx:6`), las secciones de
`PriceHero`.

10 px uppercase no falla ninguna regla de WCAG (no hay mínimo tipográfico), pero
combinado con `--text-tertiary` en 3.12:1 es **el peor texto de la app con
margen**: 6.25 px de altura de caja, tracking que lo hace aún más apretado, y
contraste de 3.12. El corpus marca *Minimum 16px body text on mobile* como
severidad **High** (guideline #67); no aplica literally a un overline, pero sí
 marca la dirección.

**Recomiendo 11 px / 14 px line-height.** Un px no rompe nada visualmente y sube
la lectura. No 12: el overline tiene que seguir siendo distinguible del caption.

### P3.8 · Checklist de a11y que el proyecto ya cumple

Para que conste lo que **no** hay que tocar:

- ✅ `aria-live="polite"` en el contador de resultados (`catalog-search.tsx:371`) y de colecciones (`collections-screen.tsx:181`), con el comentario de por qué no `role="status"` (evita anuncio doble en el primer render).
- ✅ `role="alert"` en el error de cada `Field` (`field.tsx:208`), y el error tiene prioridad sobre el hint en `describedBy` (`field.tsx:46-50`).
- ✅ `aria-busy` en el `<main>` de cada `loading.tsx` vía `ScreenContainer`.
- ✅ `aria-hidden` + `focusable="false"` en todos los íconos decorativos (77+ lugares, consistente).
- ✅ `Checkbox` con `aria-checked="mixed"` para indeterminada (`checkbox.tsx:84-85`).
- ✅ `Meter` con `role="img"` en vez de `progressbar` (`progress.tsx:93-95`) — la decisión correcta para un valor estático.
- ✅ Textarea con contador **deliberadamente no-live** (`textarea.tsx:104-107`).
- ✅ `Select` con `aria-activedescendant` en vez de mover el foco, correcto para 176 opciones (`select.tsx:195-203`).
- ✅ Skip link presente (`layout.tsx:116`).
- ✅ Landmark único por pantalla; el `<footer>` de la home adentro del `<main>` a propósito (`(app)/page.tsx:88-92`).

**El estándar de a11y de este proyecto es alto.** Los problemas de arriba son
agujas en un codebase que en general hace bien las cosas.

---

## 4. P4 — Táctil y sensación de plataforma

### P4.1 · Los tamaños `sm` y `md` están por debajo de 44 px

`design-system.md` §0.5 dice: *"Todo se puede tocar con 44 px y llegar con el
teclado. Cualquier excepción necesita un comentario que explique por qué."*

Estado real:

| Primitive | `sm` | `md` (default) | `lg` | Usos de `sm` fuera de `ui/` |
|---|---|---|---|---|
| `Button` | `h-8` = **32** | `h-10` = **40** | `h-12` = 48 ✅ | **45** |
| `IconButton` | `h-10 w-10` = **40** | `h-11` = 44 ✅ | — | (default, 7 usos) |
| `Select` | `h-8` = **32** | `h-10` = **40** | `h-12` = 48 ✅ | — |
| `Input` | `h-8` = **32** | `h-10` = **40** | `h-12` = 48 ✅ | — |
| `Chip` | `h-7` = **28** | `h-9` = **36** | — | content mode (auto) |
| `SegmentedControl` | — | `h-11` = 44 ✅ | — | — |
| `SelectOptionList` option | — | `min-h-11` = 44 ✅ | — | — |
| Shutter de cámara | — | `h-20` = 80 ✅ | — | — |
| `CameraControls` | — | `h-11` = 44 ✅ | — | — |

WCAG 2.2 SC 2.5.8 (AA) pide **24 px** en web → todo pasa. Pero el corpus marca
*44pt iOS / 48dp Android* como severidad **High** (guideline #22), y **el propio
design system se pone la regla en 44** y no la cumple en su tamaño default.

Lo más relevante: `Button size="md"` es **el default** (`button.tsx:66`) y mide 40 px.
O sea que el botón más común de la app está 4 px por debajo de la regla que el
proyecto se autoimpuso.

**Lo que yo haría (y es una decisión, no un bug):**

- Subir `md` de `Button`, `Input` y `Select` a `h-11` (44). Es el default, el
  cambio se ve en toda la app de golpe, y va en la dirección correcta.
- Dejar `sm` en 32 como está, **pero** exigir el comentario que §0.5 ya pide.
  Revisé los 45 usos: la mayoría son `Alert size="sm"` (que no es un control) y
  botones terciarios legítimos ("Reintentar", "Cargar más", "Limpiar filtros").
- **`Chip md` de 36 px sí es un problema**: es el filtro de rareza, el filtro de
  colección y los modos de búsqueda, todos en el path principal del pulgar.
  Subirlo a 40 o 44.

### P4.2 · `Chip` no tiene estado `disabled`

`chip.tsx:95-100` acepta `disabled` por el spread de props nativos, pero **no hay
ninguna clase `disabled:`** en `chipVariants`. Comparado con `Button`
(`button.tsx:44-49`, tres `compoundVariants` para `isDisabled`), `IconButton`
(`:22` `disabled:text-disabled`) y `Switch` (`:20` `disabled:opacity-50`), el
`Chip` es el único control que se ve igual activo y deshabilitado.

WCAG 2.2 no lo exige explícitamente, pero el corpus sí (*Disabled States:
reduce opacity and change cursor*, guideline #31) y la app ya lo aplica en todos
los demás primitivos. Hoy `SEARCH_MODES[].available` existe y los tres están en
`true` (`search-controls.tsx:29-33`), así que **no hay ningún chip deshabilitado
en producción hoy** — es debt latente, no bug. Se resuelve cuando vuelva a haber
un modo no disponible.

### P4.3 · No hay `touch-action: manipulation` en ningún lado

```
$ grep -rn "touch-action" app components lib
(nada)
```

Guideline #25 (*Tap Delay*, severidad Medium): sin `touch-action: manipulation`,
Chrome/Android puede aplicar el retraso de 300 ms legacy a los toques. En una app
cuya interacción principal es "apuntar la cámara y tocar el obturador", 300 ms
por toque se sienten.

**Fix de una línea**, en `globals.css` sobre `html`:

```css
html { touch-action: manipulation; }
```

(Se puede ser más quirúrgico con `manipulation` solo en los controles, pero a
nivel de documento es la recomendación estándar y no rompe el scroll vertical.)

### P4.4 · No hay `overscroll-behavior` — el pull-to-refresh del browser está activo

```
$ grep -rn "overscroll-behavior" app components
(nada)
```

Guideline #26 (*Pull to Refresh*): "Disable where not needed. Don't enable by
default everywhere." En iOS Safari y Chrome Android, arrastrar hacia abajo en
cualquier scrollable dispara el refresh del browser, que en una PWA recarga el
service worker y la app entera.

`SheetBody` y `SelectOptionList` **sí** usan `overscroll-contain`
(`sheet.tsx:571`, `select-option-list.tsx:97`) — bien. Falta el documento.

**Fix:** `html { overscroll-behavior-y: contain; }` (o_none en el body si se
quiere conservar el efecto de rubber-band del canvas, que está bien para una app
full-bleed).

### P4.5 · Cero feedback háptico

```
$ grep -rn "vibrate" app components lib
(nada)
```

Guideline #27 (*Haptic Feedback*, severidad Low pero explícita: "Use for
confirmations and important actions"). La app tiene **el momento perfecto** y lo
está desperdiciando: el obturador de la cámara (`action-bar.tsx:147`, 80 px de
diámetro) y la confirmación de un scan exitoso.

```ts
// action-bar.tsx, en el handler de captura
navigator.vibrate?.(12);
```

Un `vibrate(10-15)` en el shutter y otro en "carta agregada a la colección"
convierten un escáner de PWA en algo que *se siente* como una app nativa. Es la
mejora de mayor ratio impacto/difícil de todo el documento por su costo (5
líneas).

### P4.6 · `display_override: ["window-controls-overlay"]` sin soporte

`manifest.json` declara `window-controls-overlay` como primer modo de display.
En Chrome de escritorio, eso pone los controles de la ventana **encima del
contenido**, y la app tiene quePadding con `env(titlebar-area-inset-*)`.

```
$ grep -rn "titlebar-area" app components
(nada)
```

O se implementa el padding, o se saca `window-controls-overlay` del
`display_override`. Hoy declara una capacidad que no tiene.

### P4.7 · Sin soporte de `forced-colors` ni `prefers-contrast`

`checkbox.tsx:35` menciona `forced-colors` en un comentario (y por eso usa
`<input type="checkbox">` nativo en vez de uno custom — decisión excellent), pero
**no hay ninguna regla `@media (forced-colors: active)` ni
`prefers-contrast: more`** en el proyecto.

El design system depende mucho del borde para definir superficies
(`--border-default`, `--border-strong`, `divider.tsx`, `segmented-control.tsx`).
En Windows High Contrast, los bordes custom desaparecen y las superficies se
aplanan. Un `Sheet` con `bg-surface` sobre `bg-overlay` se vuelve indistinguible.

No es urgente (audiencia chica) pero es barato: un bloque de ~15 líneas en
`globals.css` con `forced-color-adjust` en los tokens críticos.

---

## 5. P5 — Performance

### P5.1 · `/share/[slug]` renderiza hasta 500 tiles sin virtualizar

`public-collection-view.tsx:18` → `MAX_PUBLIC_ITEMS = 500`. El `CardGrid` pinta
**todas** de una. Cada `CardTile` es un `next/image` con `fill` + un `<Link>` +
un `<p>` + un `<p>`. 500 nodos, 500 reglas de `srcset`, en un `dl` shareado por
WhatsApp que se abre en un teléfono de gama media.

El proyecto **ya resolvió esto bien en otro lado**: `use-chunked-list.ts`
trocea la vista de sets en tandas de 12 y el binder en 60, con un comentario
excelente sobre por qué no `content-visibility` (`binder-view.tsx:72-80` — el
find-in-page deja de encontrar las cartas). El mismo argumento aplica acá.

**Fix:** `useChunkedList` con `SUGGESTED_CHUNK`-like, o un `react-virtuoso`
`VirtuosoGrid` (el `sizes` ya está calculado por variante, así que la
virtualización no necesita re-trabajar las imágenes).

### P5.2 · `/buscar` y `/colecciones/[id]` crecen sin techo

`useInfiniteList` (`hooks/use-infinite-list.ts:90`) con `ROOT_MARGIN_PX = 600` y
página de 24. A la décima "Cargar más" hay **240 tiles** en el DOM. No es una
app de 20.000 items, pero 240 `next/image` con `fill` es trabajo real de layout y
paint en cada scroll.

`CatalogSearch` ya tiene el `sizes` correcto por variante (`card-tile.tsx:23-28`),
así que el costo es nodos, no bytes. Virtualización o `content-visibility: auto`
con `contain-intrinsic-size` sobre la celda (respetando la salvedad del binder) lo
resuelve.

### P5.3 · `CardActions` hace N requests en paralelo al montar

`actions.tsx:52-62` — `findItem()` busca la carta en **todas** las colecciones del
usuario con un `Promise.all` de un `listItems` por colección. Con 8 colecciones
son 8 requests concurrentes en el montaje de `/carta/[id]`.

El comentario (`actions.tsx:36-42`) justifica que no toca pokemontcg.io y que es
Postgres local — correcto. Pero sigue siendo un waterfall en el LCP perceived de
la columna derecha, y el resultado solo determina si aparece el `StatRow` de
"Administrar".

**Fix:** un endpoint `GET /cards/:id/location` que devuelva
`{ collectionId, itemId }`. Es un cambio chico de backend y elimina N requests por
vista de ficha — que es la pantalla más visitada después del catálogo.

### P5.4 · `next/image` sin `qualities` ni AVIF

`next.config.ts` no declara `qualities`. En Next 16 el default es 75, lo cual
significa que **`images.pokemontcg.io` sirve JPEG**. Las cartas Pokémon tienen
mucho foil y gradiente: AVIF/WebP en `q=70`Pes Typically se ve igual y pesa 40 %
menos. Con una grilla de 24 imágenes por página, esto es la palanca de
performance más grande que queda.

Cuidado con `AGENTS.md` §3.1: esto no genera requests a la API de pokemontcg.io,
solo transforma imágenes vía el optimizador de Next. El rate limit no aplica.

### P5.5 · 27 primitivas, 0 tests de componente

`vitest.config.ts` usa `environment: 'node'` y hay 13 archivos de test, **todos
de lógica pura** (`lib/scanner/**`, `cn`, `select-utils`, `user-message`).

`redesign-2026.md` lo admite explícitamente:

> El `Select`, el `Sheet` y el `SegmentedControl` son a11y-sensitive y hoy
> dependen de verificación manual.

Y ahora el informe agrega que los tres **con más bugs abiertos** —
`Field`+`Select`
(P0.4), `CardGrid` (P0.5) y `Button` loading (P0.7) — los tres son primitivas,
los tres son a11y, y los tresfallarían igual con o sin test.

**Esto es la deuda que más va a costar.** Un `@testing-library/react` + `jsdom`
más 5 tests de los 3 primitivas a11y-sensitive (focus trap del `Sheet`,
`aria-activedescendant` del `Select`, `aria-labelledby` del `Field`) paga todos
los P0 de lasAccesibilidad para siempre.

Cuesta ~1 día. Es la inversión de mejor retorno de la lista.

---

## 6. P6 — Lo que la app todavía no hace (aquí está el "awesome")

Hasta acá todo fue corregir. Esto es agregar. Ordenado por
**valor para el usuario / esfuerzo**.

### P6.1 · Sparkline de precio — el backend ya tiene el dato ⭐

Esto es lo más importante del documento.

`backend/prisma/schema.prisma:113-131`:

```prisma
model CardPrice {
  cardId    String
  variant   String
  low       Decimal? @db.Decimal(12, 2)
  mid       Decimal? @db.Decimal(12, 2)
  high      Decimal? @db.Decimal(12, 2)
  market    Decimal? @db.Decimal(12, 2)
  fetchedAt DateTime @default(now())
  @@index([cardId, variant, fetchedAt])
  @@map("card_prices")
}
```

**`card_prices` es append-only.** `backend/docs/pricing.md:198` lo dice:
*"varias filas por (cardId, variant), una por fetch"*. Y hay índice compuesto
sobre `(cardId, variant, fetchedAt)`.

O sea: **el histórico de precios ya se está acumulando en la base, indexado, desde
el primer día.** Lo único que falta es un endpoint que lo agrega.

Y el frontend **ya está listo para consumirlo**. `PriceDelta` (`price-delta.tsx:70-79`)
acepta `changeUsd`, `changePercent` y `windowLabel`, y su propio JSDOC lo dice:

> Hoy el backend **no tiene histórico de precio** […] así que estas props llegan
> `undefined` y el componente cae a la fecha de actualización.

Es decir: el componente que muestra "+12 % en 30 días" **ya existe, ya está
diseñado, ya tiene el tono, el ícono y el formato de cero decimales**. Solo
nunca ha recibido los números.

**Lo que falta:**

1. `GET /cards/:id/prices/history?variant=holofoil&days=30` →
   `[{ date, low, mid, high, market }]`. Un `SELECT` con `DISTINCT ON
   (fetchedAt::date)` sobre el índice que ya existe. No es una request a
   pokemontcg.io, es Postgres.
2. Un componente `Sparkline` nuevo en `components/prices/`. El corpus
   (`charts.csv` #1, *Trend Over Time*) pide: línea o área, **< 1000 puntos →
   SVG**, "solid, dashed and dotted line styles plus direct series labels; never
   distinguish series by hue alone", y "visible data table plus concise trend
   summary". Con un solo series un sparkline de 30 puntos en SVG de ~2 KB
   cumple.
3. Ponerlo en `PriceHero` debajo de la cifra, y la `PriceDelta` pasa a mostrar el
   porcentaje real en vez de "Actualizado hace 3 h".

**Por qué es enorme:** convierte la app de "buscador de precios" a "seguidor de
precios". Y no requiere una sola llamada a la API externa — o sea, **no toca el
rate limit** de `AGENTS.md` §3.1, que es la restricción más dura del proyecto.

**Y el segundo paso, que es el que realmente engancha:** el mismo endpoint
agregado, pero por colección → *"Tu colección subió $47 este mes"*. Eso es lo que
hace que un usuario vuelva a abrir la app todos los días.

### P6.2 · Waffle de progreso de set en el binder

`charts.csv` #19 (*Proportional / Percentage*): waffle chart, "showing what
fraction of a whole is filled", 10×10 grid estándar, "3–5 categories max",
"label each category and percentage", "filled-cell color alone is insufficient",
riesgo de accesibilidad **low**.

Hoy el binder usa un `Progress` line bar (`binder-view.tsx:350`). Para una
colección de cartas, un **waffle 9×3** (27 slots, el tamaño real de una página de
binder) con las casillas llenas en `--brand` y vacías en `--surface-3` es
visualmente **obvio** sin leer un número, y es exactamente el objeto físico que
el usuario tiene en la mano. Es la imagen que convierte "40 %" en "la
página está casi llena".

Encaja perfecto con el modelo mental del producto y con `aspect-[63/88]`
(`card-tile.tsx:172`) que ya reconoce las medidas reales de una carta.

### P6.3 · Acciones masivas en la colección

Guideline #91 (*Bulk Actions*, severidad Low en el corpus pero obvio en el
producto): *"Editing one by one is tedious. Allow multi-select and bulk edit."*

Hoy, marcar 30 duplicadas para intercambio son **30 toques**: abrir `ItemSheet` →
prender el `Switch` → guardar → repetir. Con 500 cartas y un filtro "Duplicadas"
que ya existe (`collection-filters.tsx:73`), el caso de uso es exactamente
"tengo 30 holos repetidos, marcalos todos para intercambio".

**Fix:** un modo selección entran por la `CollectionBottomBar` existente
(`collection-bottom-bar.tsx`) — la barra ya está, el `z-nav` ya está, el inset de
`DETAIL_CONTENT_INSET` ya está. Solo falta: checkboxes en las celdas (el
`Checkbox` ya tiene `indeterminate`), estado `selectedIds: Set<string>` en
`CollectionDetailScreen`, y un `POST /collections/:id/items/bulk` en el backend.
~1 día de frontend, medio de backend.

Es la feature que hace que la app se sienta de grown-up en vez de de prototipo.

### P6.4 · Sort por precio en `/buscar` y `/colecciones/[id]`

`redesign-2026.md` §10.2 lo lista como "a medias" (B2). Y la restricción real
está。Dime:

- `types/api.ts:40` **ya declara** `export type CardSort = 'name' | 'rarity' | 'number' | 'price';`
- El backend ya soporta `sort` en `/cards/search` (`catalog-search.tsx:302-305`
  pasa `sort: 'name'`).
- Lo que falta es `sort` en `ListItemsDto` (el comentario de
  `collection-detail.tsx:108-115` lo dice: el backend ordena por `addedAt DESC`
  fijo).

En `/buscar` es un `SegmentedControl` de 4 opciones y **el endpoint ya lo
soporta**. Media hora. En `/colecciones/[id]` es un `StatRow` con popover +
un `sort` en el DTO.

Y tiene un ángulo de producto que el comentario actual no considera: ordenar
por precio descendente **es la respuesta a "¿cuál de mis duplicadas vale más?"**,
que es la pregunta que hace que alguien vuelva a la app.

### P6.5 · Historial de escaneos en la home

`escanear/page.tsx` mantiene la sesión de escaneo en memoria
(`sessionCount`, `stage`). Cuando el usuario cierra la app, se pierde.

Una fila "Continuás donde quedaste · 7 cartas escaneadas hoy" en `/` con acceso
al `OrganizeSheet` convierte 7 escaneos desperdiciados en 7 cartas en la
colección. El `OrganizeSheet` ya existe (`scanner/organize-sheet.tsx`) y ya sabe
manejar las N cartas de la sesión; solo falta persistir la sesión
(`sessionStorage`, que la app ya usa para el token) y ofrecerla en la home.

Barato, y ataca el peor modo de falla actual: escanear 20 cartas, cerrar la app
por una llamada, perder las 20.

### P6.6 · `CardTile` con señal de rareza

`CardDto.rarity` existe (`types/api.ts:31`) y **ya se usa** para el `alt` del
`Image` (`card-tile.tsx:171`) y para el filtro (`rarity-filter.tsx:17-31`, 12
opciones). Pero **no se ve**: la grilla de 24 cartas es una pared de imágenes
indistinguibles sin leer el nombre.

Un borde o una esquina de 2 px con un color por rareza (Common gris → Secret
Rare dorado) haría la grilla escaneable de un golpe. Y no viola el design system:
serían **tokens nuevos** (`--rarity-common` … `--rarity-secret`), no colores
crudos, así que el guard de `lint` sigue verde.

Cuidado con dos reglas que este proyecto ya se autoimpuso y que el cambio tiene
que respetar: el borde de la imagen es el thing que hace que la carta "flote"
(`card-tile.tsx:167-172`, *"el tile es la imagen, no un contenedor"*), y no se
puede agregar `bg-surface` + `border` a la celda. El acento tiene que ir **dentro**
del `div` de la imagen, como overlay, o en la fila de texto de abajo. Y el color
no puede ser el único portador de información (WCAG 1.4.1): necesita el nombre de
la rareza en el `title` o en el texto.

### P6.7 · Micro-haptic en las transiciones de escaneo (ver P4.5)

Reiniciando porque es de las cosas de mayor impacto percibido por línea de
código.

---

## 7. Dirección visual

### 7.1 · La dirección actual es correcta — no la cambies

El corpus (`styles.csv`) mapea este producto a **Flat Design (#12)**, con
*Best For: "Web apps, mobile apps […] SaaS, dashboards"*, *Accessibility: risk:
low*, *Mobile-Friendly: adaptable*, *Conversion-Focused: ✓ High*.

Y así está construida: canvas gris claro, cards blancas flotantes con sombra
suave, acento rojo, cifras pesadas, esquinas de 12-20 px. Es exactamente Flat
Design bien ejecutado. **La decisión de diseño de la Fase 0 fue acertada.**

### 7.2 · Lo que el corpus dice que NO hay que hacer

Vale la pena dejarlo escrito, porque son las tres cosas que un rediseño
"para que se vea más premium" suele meter:

| Estilo | Por qué no (verbatim del corpus) |
|---|---|
| **Neumorphism (#2)** | *Do Not Use For: "Complex apps, critical accessibility, **data-heavy dashboards**, high-contrast required"*. **Accessibility: risk: high.** Una app de colección con 5 stats, tabla de precios y 24 Rarezas es exactamente el caso de uso donde el neumorfismo falla. |
| **Glassmorphism (#3)** | *Do Not Use For: "Low-contrast backgrounds, critical accessibility, performance-limited, dark text on dark"*. Además: la app ya usa `backdrop-blur` en la nav, el header y los toasts, y yaPassó el punto donde el blur se lee como "profundidad" y no como "borde". |
| **Dark Mode OLED (#7)** | *Do Not Use For: "Print-first content, high-brightness outdoor, **color-accuracy-critical**"*. **Esta es la importante**: el producto es **arte de cartas Pokémon**, con foil, holograma y gradientes. Evaluar el color de una carta en un canvas `#0B0B0F` es_CS-accurate. El `design-system.md` §1 ya toma la decisión correcta: *"Light es el default. El dark es un modo, no una identidad de la app."* No la reviertas. |

`design-system.md` §1 también tiene la regla correcta y merece quedar explícita:
el tema es **local al dispositivo**, no del usuario, y *"El `UserDto` no tiene
campo de tema y no lo vamos a agregar por un color"*. Es exactamente el tipo de
decisión que un rediseño impulsivo rompe.

### 7.3 · La tipografía es el upgrade de mayor retorno

Hoy hay **dos** familias: `Geist` y `Geist Mono` (`layout.tsx:10-14`). Geist es
excelente y es la elección correcta para un producto técnico-neutral.

Pero el corpus tiene un finding que aplica perfecto acá (*typography.csv* #12,
**Geometric Modern**, *Outfit + Work Sans*; y #78, *Bold Typography (Mobile
Poster)*, keywords *mobile, native, consumer*): **no cambiar el body, agregar un
display para las cifras.**

Las cifras son el producto. `PriceHero` usa `text-display-lg` (40 px / weight
800, `price-hero.tsx` y `price-chip.tsx`), `StatValue` usa `text-h3` +
`tabular-nums`, y `BinderSummary` pone `"N / M"` en `text-h3` con
`tabular-nums` (`binder-view.tsx:342`). Todo eso **ya está bien**. Lo que falta es
que la cifra tenga *carácter*: un `Outfit` (geométrica, abierta, muy legible a
48 px) en `text-display-lg` y `text-display` le da a la app un polo visual
propio que ni el catálogo de Pokémon ni una app de finanzas tienen.

**No tocar** `text-h3` / `text-h2` / `text-body` / `text-label` / `text-caption` /
`text-overline`. Display-only, dos pasos de la escala, un `next/font` más.

Cuidado con `AGENTS.md` §3.3: en `next/font` el subset tiene que ser explícito y
el nombre de la variable único (`--font-display`), y hay que mantener el
`suppressHydrationWarning` del `<html>` (`layout.tsx:94`).

### 7.4 · Un token de "borde de carta" y nada más

Lo que `card-tile.tsx:167-172` describe — *"la imagen flota sobre el canvas con
`shadow-sm` y sube medio píxel en hover"* — es la decisión visual más importante
del producto y está bien ejecutada. `--shadow-sm` (`0 1px 3px rgb(11 11 15 /
0.07)`) es sutil enough.

Lo único que propongo acá es un token `--shadow-card` separado del `--shadow-sm`
de `Surface`, para que P6.6 (acento de rareza) y cualquier futuro hover más
elaborado tengan dónde apuntar sin tocar el shadow de las cards. 3 px de altura,
un solo token, cero riesgo.

---

## 8. Roadmap

Ordenado por **ratio valor/esfuerzo**, no por severidad. Las fases 1-2 son
"hacélo esta semana".

### Fase 1 — Correcciones (1 día, ~2.5 h de código)

Sin discusión. Todo son bugs o incumplimientos medidos.

- [ ] **P0.3** `scroll-padding-top` en `html` — **10 min**, un token
- [ ] **P0.2** `theme-color` dinámico en `applyResolved()` — **15 min**, 3 líneas
- [ ] **P0.1** Arreglar o sacar el `share_target` del manifest — **30 min**
- [ ] **P0.6** `aria-hidden` en el `<hr>` de `Divider` — **5 min**
- [ ] **P0.4** `aria-labelledby` en los 5 `Select` de `item-sheet.tsx` — **20 min**
- [ ] **P0.5** `role="list"` en la variante `div` de `CardGrid` — **20 min**
- [ ] **P0.7** nombre accesible del `Button` en loading — **20 min**
- [ ] **P0.8** `aria-hidden` en el `AppPreview` de la home — **5 min**
- [ ] **P4.3** `touch-action: manipulation` — **2 min**
- [ ] **P4.4** `overscroll-behavior-y` — **2 min**
- [ ] **P4.6** Sacar `window-controls-overlay` del manifest o implementarlo — **5 min**

### Fase 2 — Contraste y tacto (1 día)

- [ ] **P4.5** `navigator.vibrate` en shutter y en scan exitoso — **20 min** ⭐
- [ ] **P3.2** Token `--focus-ring` + migración a `outline` — **1 h** ⭐⭐ mayor ROI del informe
- [ ] **P3.1** `--text-tertiary` a `#6f6f7a` / `#82828c` — **15 min** (revisión visual de 88 usos incluida)
- [ ] **P3.4** Token `--border-control` — **45 min** (revisión visual de inputs)
- [ ] **P3.3** Token `--switch-track-off` — **20 min**
- [ ] **P3.6** `--shimmer-from/to` más visibles — **15 min**
- [ ] **P3.7** `text-overline` 10 → 11 px — **10 min**
- [ ] **P3.5** `--positive` light a `#117a47`, `--brand` light a `#d81c23` — **10 min**
- [ ] **P4.1** `md` de `Button`/`Input`/`Select` a `h-11`; `Chip md` a `h-10` — **1 h** (revisión visual)
- [ ] **P4.7** Bloque `forced-colors` — **1 h**

### Fase 3 — Tests de las primitivas (1 día) ⭐

Invertir **antes** de la Fase 4, y después de la Fase 1: la Fase 1 ya
corrige tres de estos bugs a mano, y la Fase 2 cambia el markup de casi todas las
primitivas. Sin tests primero, las dos fases siguientes no tienen red.

- [ ] `@testing-library/react` + `happy-dom` o `jsdom`, `environment` por archivo
- [ ] `Sheet`: focus trap, `inert` en hermanos, `Escape`, focus restoration
- [ ] `Field` + `Select`: `aria-labelledby` / `aria-describedby` / `aria-invalid` (esto es lo que atrapa P0.4 para siempre)
- [ ] `SegmentedControl`: `aria-pressed` y navegación por teclado
- [ ] `Select` con teclado: `aria-activedescendant` sigue a la opción activa
- [ ] `toast`: región live, `duration: 0`, cap de 3

### Fase 4 — Producto (ordenada por impacto)

- [ ] **P6.1** Historial de precios: endpoint + `Sparkline` + `PriceDelta` real — **3-4 días** ⭐⭐⭐
- [ ] **P6.3** Acciones masivas en la colección — **1.5 días**
- [ ] **P6.5** Historial de sesión de escaneo en la home — **0.5 día**
- [ ] **P6.4** Sort por precio en `/buscar` — **0.5 día**
- [ ] **P6.2** Waffle de progreso en el binder — **1 día**
- [ ] **7.3** `Outfit` display para las cifras grandes — **0.5 día**
- [ ] **P6.6** Señal de rareza en `CardTile` — **1 día**
- [ ] **P5.1** Virtualizar `/share/[slug]` — **0.5 día**
- [ ] **P5.4** `images.qualities` + AVIF en `next.config.ts` — **30 min** ⭐
- [ ] **P5.3** `GET /cards/:id/location` — **1 día** (backend)
- [ ] **P5.2** Trocear `/buscar` y `/colecciones/[id]` — **1 día**

---

## 9. Cómo verificar cada cosa

```bash
# El guard de tokens, que es el que más va a doler con los cambios de contraste
pnpm run check                            # lint + typecheck + tests + build

# Contraste: axe en el browser, sobre la pantalla y no sobre un token suelto
npx @axe-core/cli http://localhost:3000/buscar

# Los tres casos que no se ven en una captura
# 1. Touch target: iPhone SE (375) y un Android de gama baja (360)
# 2. Reduced motion: DevTools → Rendering → Emulate CSS prefers-reduced-motion
# 3. Forced colors: DevTools → Rendering → Emulate CSS forced-colors
```

Checks manuales que tienen que pasar **antes** de dar cualquier fase por buena:

| | |
|---|---|
| Targets | Todos los controles del path principal ≥ 44 px (o con el comentario que §0.5 exige) |
| Foco | Recorrido completo con `Tab` en `/buscar`, `/colecciones/[id]`, `/carta/[id]`, un `Sheet` y un `Select`: **el anillo tiene que verse sin effort** (es el fix P3.2, hasta que esté, no va a pasar) |
| Foco tapado | Con el header sticky, skipear a `#contenido` y apretar "Cargar más": nada puede quedar debajo del header |
| Dark | **Auditar los dos temas por separado.** El corpus es explícito: *"Check dark mode contrast independently (don't assume light mode values work)"*. Ningún valor de contraste de este informe se extrapola entre temas |
| Dark | El precio de una carta con foil se ve **igual** que en light. Si el dark wash out el arte, `--canvas` `#0B0B0F` es correcto y hay que resistirse la tentación de ir a `#000` |
| Reduced motion | El escáner funciona **igual** sin transiciones. La cámara no depende de motion |
| Offline | Con DevTools → Network → Offline: la home, `/buscar` y `/colecciones` cargan desde el SW. El escáner arranca (los ~14 MB de Tesseract están cacheados, `sw.js:36`) |
| 375 px | Sin scroll horizontal en ninguna de las 11 pantallas. Los scrollers horizontales deliberados (rarezas, filtros, relacionadas) tienen que seguir scrolleando, no desbordar |
| Landscape | En horizontal, el `Sheet` `full` (`h-dvh`, `sheet.tsx:140`) y el `ActionBar` de la cámara tienen que seguir accesibles |
| Lector de pantalla | VoiceOver iOS: `Field`+`Select` nombrados (P0.4), `CardGrid` como lista (P0.5), contador de resultados anunciado, `AppPreview` no anunciado |

---

## 10. Lo que **no** voy a recomendar

Para que quede escrito y no se reabra en el próximo redesign:

1. **No cambiar los dos `Shell`** (`AppShell` / `PlainShell`). `gotchas.md` §22
   ya explica por qué son dos y no uno con prop. La tentación de "unificar" es
   fuerte y es un error.
2. **No reemplazar los 27 hand-rolled por Radix / shadcn.** El `Sheet` de este
   proyecto tiene focus trap, `inert`, pila de capas, drag-to-close con umbral de
   velocidad, focus restoration con cadena de fallback, y reduced-motion. Es
   mejor que la librería. Un shadcn `Dialog` sería una **pérdida** de
   funcionalidad, no una ganancia.
3. **No poner `min-h-dvh` en `100vh` en ningún lado.** Ya está todo en `dvh`; es
   la razón por la que la barra de direcciones de iOS no rompe el layout.
4. **No hacer el dark el default.** Ver §7.2: *color-accuracy-critical* es
   literalmente este producto.
5. **No agregar un slider de "tamaño de grilla".** Suena bien y es una decisión
   de diseño por cada estado; no vale el costo de tokenizer.
6. **No meter un chart en `/buscar`.** La grilla de cartas es contenido, y el
   `design-system.md` §0.2 lo dice mejor: *"El grid de cartas es contenido, no un
   contenedor con borde."* El chart que corresponde es el de **precio de una
   carta** (P6.1) y el de **progreso de un set** (P6.2), no otro.
7. **No tocar `check-no-raw-colors.mjs`.** Es la regla que hace sustainable todo
   lo demás. Agregarle reglas nuevas (spacing, tipografía) está bien; relajar las
   existentes, no.

---

## Apéndice — Diff de tokens propuesto

Todo el cambio de §3 en un solo diff, para revisar de una:

```css
/* ─── globals.css :root ─── */
--text-tertiary: #6f6f7a;    /* era #86868f — 3.28 → 4.52 vs canvas */
--positive:      #117a47;    /* era #12804a — 4.47 → 4.61 sobre positive-soft */
--brand:         #d81c23;    /* era #e01f26 — 4.32 → 4.60 sobre brand-soft */
--shimmer-from:  #dcdce4;    /* era #eeeef2 — 1.16 → 1.36 vs surface */
--shimmer-to:    #f2f2f5;    /* era #f8f8fa */

--focus-ring:        #e01f26;   /* NUEVO — 4.78 vs surface */
--border-control:    #a8a8b2;   /* NUEVO — 2.36 vs surface-2 */
--switch-track-off:  #a8a8b2;   /* NUEVO — 2.36 vs knob */
--shadow-card: 0 1px 3px rgb(11 11 15 / 0.07), 0 1px 2px -1px rgb(11 11 15 / 0.05);
                                             /* NUEVO — separado de --shadow-sm */

/* ─── globals.css .dark ─── */
--text-tertiary: #82828c;    /* era #75757f — 3.99 → 4.78 vs surface */
--shimmer-from:  #23232b;    /* era #1d1d24 */
--shimmer-to:    #2b2b35;    /* era #26262f */
--focus-ring:        #ff4a4f;   /* 5.49 vs surface */
--border-control:    #6a6a76;   /* 3.14 vs surface-2 ✅ */
--switch-track-off:  #6a6a76;   /* 3.41 vs knob ✅ */

/* ─── globals.css html ─── */
html {
  touch-action: manipulation;                            /* P4.3 */
  overscroll-behavior-y: contain;                        /* P4.4 */
  scroll-padding-top: calc(3.5rem + env(safe-area-inset-top));  /* P0.3 */
}

/* ─── globals.css @utility text-overline ─── */
font-size: 11px;            /* era 10px */
line-height: 14px;          /* era 12px */
```

```ts
// lib/theme.tsx — applyResolved()
document.documentElement.classList.toggle('dark', resolved === 'dark');
document
  .querySelector('meta[name="theme-color"]')
  ?.setAttribute('content', resolved === 'dark' ? '#0B0B0F' : '#F4F4F6');
```

```tsx
// components/ui/*.tsxx — el patrón de focus, 77 ocurrencias
// antes: focus-visible:ring-2 focus-visible:ring-brand/20 dark:focus-visible:ring-brand/40
focus-visible:outline-2
focus-visible:outline-offset-2
focus-visible:outline-[var(--focus-ring)]
```

**Nota sobre `--brand`:** pasarlo de `#e01f26` a `#d81c23` mueve el botón
primario de 4.78 a ~4.9:1 (más contraste, no menos) y oscurece 3% el acento de
la app. Es imperceptible y cierra el único `--brand` que quedaba corto. Si
preferís no tocar el color de marca, se deja `#e01f26` y se acepta el 4.32 de
`text-brand` sobre `brand-soft` — que es un Badge de 10 px, no el CTA.
