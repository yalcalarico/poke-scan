# Design system — PokéScan v2

> **Este documento reemplaza la v1** (la que vivía como convenciones Tailwind sobre
> `slate-950`). Todo lo que estaba en v1 y sigue siendo válido — Accesibilidad,
> Moneda, Fechas y números, `public/sw.js` — se conserva textualmente abajo, en las
> secciones marcadas. Lo que cambió: **ahora hay tema claro (default) y oscuro**, y
> **todo valor visual sale de un token**. Si algo no está en este documento, no se
> escribe con una clase suelta.
>
> Plan de migración por fases: [`redesign-2026.md`](redesign-2026.md).

---

## 0. Principios

Cinco reglas que resuelven el 90 % de las decisiones. En orden de prioridad.

1. **Mobile-first, 390 px de referencia.** Si algo no se entiende en 390 × 844, no
   existe. Desktop es la adaptación, nunca el original.
2. **La carta es la protagonista.** El grid de cartas es *contenido*, no un contenedor
   con borde. La imagen flota sobre el canvas con una sombra suave; el chrome de la UI
   nunca compite con ella.
3. **Tokens, no clases sueltas.** Si un valor no viene de un token, es un bug. No hay
   `slate-900/40` ni `text-[13px]` ni `rounded-lg` "porque queda bien".
4. **Un componente, una decisión.** Variantes por prop (`variant`, `size`, `tone`), no
   por clase condicional en el call site. Si necesitás una tercera forma, se agrega una
   variante nueva al componente, no una copia.
5. **Todo se puede tocar con 44 px y llegar con el teclado.** Cualquier excepción
   necesita un comentario que explique por qué.

---

## 1. Temas

Dos temas: **claro (default)** y **oscuro**. El tema se resuelve en el `<html>` con la
clase `dark` y la preferencia se persiste en `localStorage` bajo `pokescan.theme`
(`light` | `dark` | `system`).

- **Light es el default.** Si no hay nada guardado y el sistema no dice otra cosa, es
  claro. El dark es un modo, no una identidad de la app.
- La preferencia es **local al dispositivo**, no del usuario. No se manda al backend
  (el `UserDto` no tiene campo de tema y no lo vamos a agregar por un color).
- El script anti-flash va **inline en `<head>`**, antes de cualquier stylesheet, para
  que no haya un frame blanco en un usuario en dark.

```tsx
// app/layout.tsx
const themeScript = `(function(){try{var t=localStorage.getItem('pokescan.theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()`;
```

Y el `<meta>` del navegador:

```tsx
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F4F4F6' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0B0F' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};
```

`manifest.json` lleva `theme_color: "#F4F4F6"` y `background_color: "#F4F4F6"`: el
splash screen de iOS es **siempre claro** y no se puede expresar por preferencia.

### Regla dura

**Nunca** se escribe `slate-950`, `text-white`, `bg-black` ni ninguna clase de la
paleta default de Tailwind. Los colores salen de tokens semánticos:

```
bg-canvas  bg-surface  bg-surface-2  bg-surface-3  bg-overlay
text-primary  text-secondary  text-tertiary  text-disabled  text-inverse
border-default  border-strong  border-subtle
text-brand  bg-brand  bg-brand-soft  border-brand
text-positive / bg-positive-soft / text-negative / bg-negative-soft
text-warning / bg-warning-soft / text-info / bg-info-soft
```

`slate`, `zinc`, `neutral`, `gray`, `stone`, `red`, `rose`, `emerald`, `amber`, `sky`,
`blue`, `green` quedan **prohibidos** en JSX. Un linter de grep en `pnpm run check`
debería fallar si aparecen (`scripts/check-no-raw-colors.mjs`, ver plan Fase 0).

---

## 2. Color

### 2.1 Tokens

Definidos en `app/globals.css`. Los **semánticos** viven fuera de `@theme` (porque
cambian con el tema) y se re-exponen adentro con `@theme inline`, que es el mecanismo
de Tailwind 4 para eso.

```css
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

:root {
  /* Superficies — de menos a más elevado */
  --canvas: #f4f4f6;
  --surface: #ffffff;
  --surface-2: #f8f8fa;
  --surface-3: #eeeef2;
  --overlay: rgb(11 11 15 / 0.55);

  /* Texto */
  --text-primary: #0b0b0f;
  --text-secondary: #5c5c68;
  --text-tertiary: #86868f;
  --text-disabled: #b4b4bd;
  --text-inverse: #ffffff;

  /* Bordes */
  --border-subtle: #eeeef2;
  --border-default: #e4e4e9;
  --border-strong: #d0d0d8;

  /* Marca: rojo. Es el acento de navegación y de acción primaria. */
  --brand: #e01f26;
  --brand-hover: #c2161c;
  --brand-press: #9e1217;
  --brand-soft: #fff0f0;
  --brand-border: #ffc9c9;
  --on-brand: #ffffff;

  /* Semánticos */
  --positive: #12804a;          /* valor, dinero, éxito, precio subiendo */
  --positive-soft: #e7f6ee;
  --positive-border: #b7e3cb;
  --negative: #d01a21;          /* precio bajando, error de acción */
  --negative-soft: #fdeeee;
  --negative-border: #f5c2c2;
  --warning: #b45309;           /* "algo está viejo o no seguro". NUNCA error. */
  --warning-soft: #fdf4e3;
  --warning-border: #f0d9ae;
  --info: #1d4ed8;
  --info-soft: #eef2fe;
  --info-border: #c9d5fa;

  /* El scanner siempre vuela sobre la foto: superficies oscuras fijas. */
  --on-media: rgb(11 11 15 / 0.72);
  --on-media-text: #ffffff;
}

.dark {
  --canvas: #0b0b0f;
  --surface: #15151b;
  --surface-2: #1d1d24;
  --surface-3: #26262f;
  --overlay: rgb(0 0 0 / 0.7);

  --text-primary: #f5f5f7;
  --text-secondary: #a1a1ae;
  --text-tertiary: #75757f;
  --text-disabled: #4a4a54;
  --text-inverse: #0b0b0f;

  --border-subtle: #1d1d24;
  --border-default: #2a2a33;
  --border-strong: #3c3c48;

  --brand: #ff4a4f;             /* más saturado para tener contraste sobre #15151b */
  --brand-hover: #ff6a6e;
  --brand-press: #e01f26;
  --brand-soft: rgb(255 74 79 / 0.14);
  --brand-border: rgb(255 74 79 / 0.32);
  --on-brand: #1a0506;

  --positive: #34d399;
  --positive-soft: rgb(52 211 153 / 0.14);
  --positive-border: rgb(52 211 153 / 0.3);
  --negative: #ff6a6e;
  --negative-soft: rgb(255 106 110 / 0.14);
  --negative-border: rgb(255 106 110 / 0.3);
  --warning: #fbbf24;
  --warning-soft: rgb(251 191 36 / 0.14);
  --warning-border: rgb(251 191 36 / 0.3);
  --info: #7ba1ff;
  --info-soft: rgb(123 161 255 / 0.14);
  --info-border: rgb(123 161 255 / 0.3);

  --on-media: rgb(0 0 0 / 0.66);
  --on-media-text: #ffffff;
}

@theme inline {
  --color-canvas: var(--canvas);
  --color-surface: var(--surface);
  --color-surface-2: var(--surface-2);
  --color-surface-3: var(--surface-3);
  --color-overlay: var(--overlay);

  --color-primary: var(--text-primary);
  --color-secondary: var(--text-secondary);
  --color-tertiary: var(--text-tertiary);
  --color-disabled: var(--text-disabled);
  --color-inverse: var(--text-inverse);

  --color-line: var(--border-default);
  --color-line-strong: var(--border-strong);
  --color-line-subtle: var(--border-subtle);

  --color-brand: var(--brand);
  --color-brand-hover: var(--brand-hover);
  --color-brand-press: var(--brand-press);
  --color-brand-soft: var(--brand-soft);
  --color-brand-border: var(--brand-border);
  --color-on-brand: var(--on-brand);

  --color-positive: var(--positive);
  --color-positive-soft: var(--positive-soft);
  --color-positive-border: var(--positive-border);
  --color-negative: var(--negative);
  --color-negative-soft: var(--negative-soft);
  --color-negative-border: var(--negative-border);
  --color-warning: var(--warning);
  --color-warning-soft: var(--warning-soft);
  --color-warning-border: var(--warning-border);
  --color-info: var(--info);
  --color-info-soft: var(--info-soft);
  --color-info-border: var(--info-border);

  --color-on-media: var(--on-media);
  --color-on-media-text: var(--on-media-text);

  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);

  --radius-control: 12px;
  --radius-surface: 16px;
  --radius-panel: 20px;
  --radius-sheet: 28px;

  --shadow-xs: 0 1px 2px rgb(11 11 15 / 0.05);
  --shadow-sm: 0 1px 3px rgb(11 11 15 / 0.07), 0 1px 2px -1px rgb(11 11 15 / 0.05);
  --shadow-md: 0 4px 12px -2px rgb(11 11 15 / 0.09), 0 2px 4px -2px rgb(11 11 15 / 0.05);
  --shadow-lg: 0 14px 32px -10px rgb(11 11 15 / 0.16), 0 4px 10px -4px rgb(11 11 15 / 0.06);
  --shadow-xl: 0 28px 60px -20px rgb(11 11 15 / 0.22);

  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --ease-emphasis: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-exit: cubic-bezier(0.4, 0, 1, 1);

  --duration-instant: 100ms;
  --duration-fast: 160ms;
  --duration-base: 240ms;
  --duration-slow: 400ms;
}
```

`.dark` **no** redefine sombras. En dark la separación la hacen el borde y la
diferencia de superficie; las sombras de `@theme` sirven igual porque son
semi-transparentes y se leen como "oscuridad hacia abajo", que es lo correcto.

### 2.2 Mapa de roles

| Rol | Token | Dónde |
|---|---|---|
| Fondo de página | `bg-canvas` | `<body>`, todas las pantallas |
| Tarjeta, panel, sheet | `bg-surface` + `border-line` + `shadow-sm` | Todo lo que flota |
| Superficie interior | `bg-surface-2` | Celdas de stat, filas de `dl`, zona hundida de un input group |
| Hover / pressed | `bg-surface-3` | Filas, tiles, chips inactivos |
| Sheet overlay | `bg-overlay` + `backdrop-blur-sm` | Debajo de cualquier overlay |
| Texto principal | `text-primary` | Títulos, valores, nombres de carta |
| Texto secundario | `text-secondary` | Descripciones, subtítulos, nombres de set |
| Texto terciario | `text-tertiary` | Labels de stat, placeholders, `BottomNav` inactiva |
| Texto deshabilitado | `text-disabled` | Botón apagado, separadores, íconos inactivos |
| Marca (acento) | `text-brand` / `bg-brand` + `text-on-brand` | Acción primaria, tab activa, precio, link |
| Marca suave | `bg-brand-soft` + `text-brand` | Chips seleccionados, badges |
| Positivo | `text-positive` / `bg-positive-soft` | **Valor de dinero**, éxito, precio subiendo, progreso |
| Negativo | `text-negative` / `bg-negative-soft` | **Precio bajando**, error de acción, borrado |
| Warning | `text-warning` / `bg-warning-soft` | "Datos viejos", "no estamos seguros", "te faltan cartas" |
| Info / lectura | `text-info` / `bg-info-soft` | Vista pública de solo lectura, avisos neutros |
| Sobre foto | `bg-on-media` + `text-on-media-text` | Todo el chrome del scanner |

### 2.3 Dos reglas semánticas que no se rompen

**`warning` nunca es un error.** Es "esto está viejo, o no estamos seguros del
resultado": precio desactualizado, cotización vieja, confianza baja del OCR, cartas
sin precio. El error es `negative`. Si dudás entre los dos, pensá *"¿el usuario puede
igual hacer la acción que quiere?"* → sí → warning.

**`positive` es el color del dinero.** El valor total de la colección, el precio de una
carta, el número grande del scanner: siempre `text-positive`. No es "success", es
"plata". La acción de éxito ("Carta añadida") usa el mismo verde, y está bien.

**Colisión deliberada:** `--brand` (rojo) y `--negative` (rojo) son el mismo tono.
Es intencional y está en la referencia de diseño: la app es roja, y una caída de
precio se lee en rojo. Lo que separa los dos contextos es el **tono del texto**, no
el matiz: `text-brand` para navegación, `text-negative` para variación de precio. Si
en una misma línea aparece un delta de precio y un link, el link va `text-brand` y el
delta `text-negative`, y no se confunden porque tienen formas distintas (pill vs
texto underlined).

### 2.4 Contraste

Objetivo **WCAG 2.2 AA**.

- Texto normal: ≥ 4.5:1 contra su superficie. Texto ≥ 24 px o ≥ 19 px bold: ≥ 3:1.
- Componentes y bordes de control: ≥ 3:1 (`--border-strong` cumple; `--border-default`
  no se usa para el límite de un control, solo para separación decorativa).
- **`text-tertiary` es terciario de verdad**: no se usa para el único texto que hay en
  pantalla. En la v1 `text-slate-500` sobre `slate-900/40` daba 4.0:1 y fallaba. Los
  tokens nuevos dan 4.6:1 en claro y 4.5:1 en dark, así que `--text-tertiary` sí
  puede llevar metadata, pero nunca el mensaje principal.

---

## 3. Tipografía

`next/font/google` con **Geist** y **Geist Mono**, como variables CSS
(`--font-geist-sans`, `--font-geist-mono`), expuestas como `--font-sans` /
`--font-mono`.

**No se agrega una tipografía display.** Las referencias usan un grotesque muy pesado
en los números grandes; Geist variable llega a 900 y con `tracking-tight` cubre el
mismo efecto sin sumar una request de fuente. La muestra de la app tiene el look de
una sola familia, y eso es correcto.

### 3.1 Escala

Nueve pasos. **Nada fuera de esta tabla.** Se implementan como utilities de
`@theme` o como clases en `@layer components`; no se escriben `text-[13px]`.

| Nombre | Tamaño / interlineado | Peso | Tracking | Uso |
|---|---|---|---|---|
| `display-lg` | 40 / 42 | 800 | -0.03em | Cifra del scanner, total de colección en `/share` |
| `display` | 32 / 34 | 800 | -0.025em | `PriceHero`, valor total de una colección, h1 de `/` |
| `h1` | 26 / 30 | 700 | -0.02em | Título de pantalla |
| `h2` | 20 / 26 | 700 | -0.015em | Título de sección, `Sheet` |
| `h3` | 17 / 22 | 600 | -0.01em | Subtítulo de bloque, nombre de item |
| `body` | 15 / 22 | 400 | normal | **Cuerpo por defecto** |
| `body-strong` | 15 / 22 | 600 | normal | Cuerpo que necesita emphasis |
| `label` | 13 / 18 | 500 | normal | Labels de campo, botones medianos, chips |
| `caption` | 12 / 16 | 400 | normal | Metadatos, subtítulos de set, help text |
| `overline` | 10 / 12 | 600 | 0.08em, `uppercase` | El "VALUE" de la card resumen, labels de stat |

En mobile el `display` baja a `display-lg` solo si es la cifra hero de la pantalla
(el total de la colección, el precio de la carta). `h1` baja a 24 px en `sm:`.

### 3.2 Cifras

**Todo número que se compara con otro lleva `tabular-nums`**: precios, cantidades,
totales, `4 / 102`, porcentajes de confianza, y todos los `display`/`h1`. Sin
`tabular-nums` las cifras bailan cuando el precio se revalida y se ve como un bug.

La cifra grande (`display`, `display-lg`) **siempre** es `tabular-nums` +
`tracking-tight` + el color que corresponde al tipo de dato:

```tsx
<dd className="text-display text-positive tabular-nums">$29.850</dd>
```

### 3.3 Truncado

- Nombres de carta: `truncate` con `title` para el hover de escritorio. En mobile el
  `title` no existe, así que **el nombre se corta a 2 líneas** con
  `line-clamp-2` cuando el tile es vertical, y a 1 línea cuando es horizontal.
- Números de carta: nunca se truncan, siempre `whitespace-nowrap`.
- Slugs y URLs: `font-mono`, `break-all`.

---

## 4. Espaciado, radios, sombras

### 4.1 Espaciado

Escala Tailwind de 4 px, sin excepción. Lo que se **documenta** es el ritmo:

| Contexto | Valor |
|---|---|
| Padding de pantalla (horizontal) | `px-4` (16) en mobile, `sm:px-6` (24) |
| Padding de pantalla (vertical) | `py-4` en mobile, `sm:py-6` |
| Gap entre tarjetas del grid | `gap-3` (12) en mobile, `sm:gap-4` |
| Gap entre bloques de una pantalla | `gap-6` (24) → `sm:gap-8` |
| Padding de una `Surface` | `p-4` estándar, `p-5` si tiene un título, `p-3` en un `Stat` |
| Padding de un control | `px-4 py-2.5` (md), `px-3.5 py-2` (sm), `px-5 py-3` (lg) |
| Separación label → valor | `mt-1` |
| Separación label → control | `mb-1.5` |
| Alto del `ScreenHeader` | `h-14` + `pt-[env(safe-area-inset-top)]` |
| Alto de la `BottomNav` | `h-16` + `pb-[env(safe-area-inset-bottom)]` |
| Insumo de contenido | `pb-[calc(5rem+env(safe-area-inset-bottom))]` |

Vertical se usa siempre `gap-*` en un contenedor flex/grid, o `mt-*` entre hermanos.
**Nunca** `space-y-*` (se mezcla mal con `gap-*` y produce saltos de layout).

### 4.2 Radios

| Token | Valor | Qué |
|---|---|---|
| `--radius-control` | 12px | Input, select, botón, chip de filtro, badge |
| `--radius-surface` | 16px | Tarjeta, panel, `EmptyState`, tile de carta |
| `--radius-panel` | 20px | Contenedor grande: auth, resumen de colección, scanner idle |
| `--radius-sheet` | 28px | Solo las esquinas superiores del bottom sheet |
| `rounded-full` | — | Píldoras, avatar, badges, obtaineur, barra de progreso, frame de cámara |

Y **solo** para la cámara: las 4 esquinas del frame de detección usan
`rounded-xl` sobre un wrapper `rounded-2xl` (clip), nunca esquinas sueltas.

### 4.3 Sombras

En v1 había **2 sombras en toda la app**. Ahora la elevación es explícita:

| Nivel | Dónde |
|---|---|
| `shadow-xs` | Hairline de un control, separador elevado |
| `shadow-sm` | **El default.** `Surface`, `CardTile`, chip suelto |
| `shadow-md` | Elemento elevado sobre la superficie: FAB, chip flotante del scanner, barra fija |
| `shadow-lg` | `Sheet`, menú de `Select`, popover |
| `shadow-xl` | Overlay de confirmación, toast, el chip de precio del scanner |

**Regla:** el borde (`border-line`) y la sombra van **siempre juntos** en una
superficie clara. En dark la sombra casi no se ve y el borde hace el trabajo; se
mantiene la misma clase en ambos temas para no tener dos ramas de JSX.

---

## 5. Motion

Sistema **CSS-first**: no hay librería de animación (ver la decisión en el plan). Todo
sale de los tokens `--duration-*` y `--ease-*`, y de 4 keyframes.

### 5.1 Curvas y duraciones

| Token | Uso |
|---|---|
| `--duration-instant` (100 ms) | Feedback de pressed,Appearance de un chip |
| `--duration-fast` (160 ms) | Hover, focus ring, cambio de color |
| `--duration-base` (240 ms) | Entrada de sheet, toast, expansion de un panel |
| `--duration-slow` (400 ms) | Solo entrada de pantalla completa |
| `--ease-standard` | Cambios de estado, hover |
| `--ease-emphasis` | Entrada de algo que el usuario acaba de pedir (sheet, toast) |
| `--ease-exit` | Salida (rápido, 160 ms con `--ease-exit`) |

**Regla de salida:** toda salida dura `--duration-fast` con `--ease-exit`. Una
animación de entrada de 240 ms con una salida de 240 ms se siente lenta; 240/160 se
siente bien.

### 5.2 Keyframes

```css
@keyframes fade-in       { from { opacity: 0 } to { opacity: 1 } }
@keyframes sheet-up      { from { opacity: 0; transform: translateY(16px) }
                          to   { opacity: 1; transform: translateY(0) } }
@keyframes pop-in        { from { opacity: 0; transform: scale(0.94) }
                          to   { opacity: 1; transform: scale(1) } }
@keyframes shimmer       { from { background-position: -160% 0 }
                          to   { background-position: 160% 0 } }
@keyframes flash-once    { 0% { background-color: var(--positive-soft) }
                          100% { background-color: transparent } }
```

- `sheet-up` en mobile, `pop-in` en `sm:`.
- `shimmer` reemplaza al `animate-pulse` de los skeletons (se ve menos "hospital").
- `flash-once` para marcar una cifra que **cambió** de valor (un precio que se
  revalida y subió). Se dispara solo, nunca en loop, y es el único uso de color
  animado de la app.

### 5.3 `prefers-reduced-motion` — obligatorio

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
    scroll-behavior: auto !important;
  }
}
```

En v1 el `animate-pulse` de los skeletons corría sin mirar esta preferencia. Este
bloque es **parte del sistema**, no un extra: va en `globals.css` desde la Fase 0.

---

## 6. Z-index y capas

Escala fija. **Ningún `z-[100]` suelto.**

| Capa | Valor | Qué |
|---|---|---|
| `z-base` | 0 | Contenido |
| `z-sticky` | 40 | `ScreenHeader` sticky, barra de filtros de `/buscar` |
| `z-nav` | 50 | `BottomNav` |
| `z-overlay` | 60 | Backdrop de un sheet o menú |
| `z-sheet` | 70 | Sheet, `Select` abierto, toast |
| `z-media` | 90 | Chrome del scanner (siempre arriba de todo) |
| `z-offline` | 100 | Banda offline, único elemento que puede pisar el scanner |

**El scanner es `z-media` y la `BottomNav` es `z-nav`.** En v1 la cámara (`z-40`)
quedaba **debajo** de la nav (`z-50`) en browser. Con la nueva escala eso no puede
volver a pasar, y además el scanner oculta la nav explícitamente.

---

## 7. Layout y grillas

### 7.1 Breakpoints

| Prefijo | Ancho | Qué cambia |
|---|---|---|
| (base) | 0–639 | 2 col en grids de carta, 1 col en general |
| `sm:` | ≥640 | 3 col en grids de carta, sheet centrado, `h1` más grande |
| `md:` | ≥768 | 4 col, `/carta/[id]` pasa a 2 columnas, stats a 3 |
| `lg:` | ≥1024 | 5 col en búsqueda, 3 col en colecciones, máximo `max-w-6xl` |
| `xl:` | ≥1280 | 6 col en búsqueda |

### 7.2 Grilla de cartas

El patrón más repetido. **Es un grid, no una lista de cards con borde.**

```tsx
// catálogo / búsqueda
"grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
// colección (más densa, sin etiquetas de set)
"grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8"
```

3 columnas a 390 px para la colección, porque el tile de colección es **solo la
imagen**: sin nombre ni set, el nombre va en la sheet de detalle. 2 columnas para
búsqueda, donde el tile sí lleva nombre y set.

### 7.3 Contenedores

| Clase | Dónde |
|---|---|
| `mx-auto w-full max-w-6xl px-4 sm:px-6` | Todas las pantallas de `(app)` y `/share` |
| `mx-auto w-full max-w-md px-4 sm:px-6` | `(auth)` |
| `mx-auto w-full max-w-lg` | `BottomNav` (el `max-w-lg` evita 4 iconos tirados en 1920) |
| `max-w-full` | Pantallas full-bleed: scanner, landing |

### 7.4 Altura

**`min-h-dvh`, nunca `min-h-screen`.** `100vh` en Safari iOS con barra colapsable
produce el salto clásico de contenido. Everywhere: `min-h-dvh`.

### 7.5 Chrome de pantalla: `ScreenHeader`

**No hay `TopBar` global.** Se reemplaza por un header por pantalla, que es lo que
muestran todas las referencias:

```tsx
<ScreenHeader
  title="Buscar"                    // centrado, `h3`
  back={{ href: '/colecciones' }}   // chevron a la izquierda, opcional
  action={<IconButton icon={X} />}  // a la derecha, opcional
/>
```

- `sticky top-0 z-sticky`, `bg-surface/85 backdrop-blur-md`,
  `pt-[env(safe-area-inset-top)]`, `h-14` de contenido.
- Título **centrado y truncado** en ambos lados, con espacios iguales, así el
  chevron de la izquierda y la acción de la derecha no lo descentran.
- Sin borde inferior: la sombra y el blur separan.
- La `BottomNav` es la única navegación global. Va **siempre visible**, también en
  standalone (esto arregla el gap más grave de v1, ver plan Fase 1).

### 7.6 Safe area

`viewportFit: "cover"` + `env(safe-area-inset-*)` en 4 lugares, y **siempre** los
cuatro:

| Lugar | Clase |
|---|---|
| `ScreenHeader` | `pt-[env(safe-area-inset-top)]` |
| `BottomNav` | `pb-[env(safe-area-inset-bottom)]` |
| Contenido de `(app)` | `pb-[calc(5rem+env(safe-area-inset-bottom))]` |
| Chrome del scanner | `pt-[env(safe-area-inset-top)]` y `pb-[env(safe-area-inset-bottom)]` |

**Se eliminan** las clases `.pwa-hide-in-standalone` y `.pwa-content-inset` de v1: con
la nav siempre visible ya no hacen falta, y eran la causa del bug de navegación en
PWA instalada.

La banda offline deja de ser un `position: fixed` que empuja el layout. Pasa a ser un
`Toast` en la esquina superior, con el `OfflineBanner` reducido a un guard que escribe
`document.documentElement.dataset.offline` y un `<div className="sr-only" role="status">`
para lectores de pantalla. **El chrome del scanner no se ve afectado nunca.**

---

## 8. Componentes

Todos en `components/ui/`. Regla general: **la API es por props, no por `className`
para cambiar la forma**. `className` solo existe para *ubicación* (`className` para
mergear con `cn()`), nunca para *variante*.

Base de todos: `cn()` de `lib/cn.ts`, con `clsx` + `tailwind-merge`. **Nunca**
template literals para clases.

```ts
// lib/cn.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
```

### 8.1 `Button`

```tsx
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'inverse';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';
<Button variant="primary" size="lg" loading pendingLabel="Escaneando…">Escanear carta</Button>
```

| Variante | Light | Dark | Cuándo |
|---|---|---|---|
| `primary` | `bg-brand text-on-brand` | idem | **Una sola acción primaria por pantalla.** |
| `secondary` | `bg-surface border-line text-primary shadow-xs hover:bg-surface-2` | `bg-surface-2` | Acción de apoyo, siempre junto a la primaria |
| `ghost` | `text-secondary hover:bg-surface-3 hover:text-primary` | idem | Acción terciaria, inline en un `Sheet` |
| `destructive` | `bg-negative text-on-brand` | idem | Borrar, revocar. **Nunca** para el CTA de un form |
| `inverse` | `bg-surface text-primary` | idem | Sobre `bg-brand` o sobre foto |

- Alturas: `sm` 32, `md` 40, `lg` 48, `icon` 40×40. **Nunca menos de 40** para un
  botón con label; `sm` solo para acciones terciarias dentro de una fila densa.
- `loading`: muestra `Spinner` + cambia a `pendingLabel` + `aria-busy` + `disabled`.
  **Nunca** un spinner suelto al lado del texto: el botón entero cambia.
- `pressed` usa `active:scale-[0.98]` con `--duration-instant` + `--ease-standard`.
- `fullWidth` para los botones de pantalla completa y los de auth.

### 8.2 `IconButton`

Ícono + `aria-label` obligatorio. 40×40 mínimo, 44×44 en `ScreenHeader` y `Sheet`.
`tooltip` opcional (solo desktop, se oculta en touch).

### 8.3 `Field`, `Input`, `Textarea`, `Select`, `Checkbox`, `Switch`

**`Field` es obligatorio** para todo campo de formulario. Reemplaza el `FormField`
suelto de v1 y todos los `<label>` + input reimplementados a mano.

```tsx
<Field label="Cantidad" hint="Máximo 999" error={errors.quantity}>
  <Input name="quantity" type="number" inputMode="numeric" defaultValue={1} />
</Field>
```

- `Field` provee `<label htmlFor>`, hint, error, `aria-describedby` y `aria-invalid`.
  El `id` sale de `useId()`.
- `Input` / `Textarea`: `bg-surface-2 border-line rounded-control px-4 py-2.5 text-body
  placeholder:text-disabled focus:border-brand focus:ring-2 focus:ring-brand/20`.
  **El anillo de foco es obligatorio** — v1 tenía 17 elementos con `focus:outline-none`
  y sin alternativa.
- **`Select` es un listbox propio, no un `<select>`.** Motivo: hay 8 selects nativos en
  la app y el de set tiene 176 opciones; en iOS el dropdown del sistema rompe la
  sensación de producto. Implementación: `role="listbox"` + `role="option"` +
  `aria-expanded` + `aria-activedescendant`, navegado con ↑ ↓ Enter Esc, con
  `aria-label` en el botón. Tipo/retro/input de texto, `Portal` a `document.body`,
  `max-h-72 overflow-y-auto`, y **búsqueda interna** obligatoria cuando hay más de 12
  opciones. Foco atrapado dentro del listbox mientras está abierto.
- `Checkbox` y `Switch`: 20×20, `accent-brand` para checkbox, switch de 44×26 con
  knob animado. Ambos con `<label htmlFor>` real, no label envolviendo.

### 8.4 `Chip`

El control de filtro. Es la pieza central del look nuevo (pills claros, activo
invertido). Un componente, dos densidades.

```tsx
<Chip active onClick={...}><Icon />Nombre</Chip>
<Chip size="sm" tone="positive">+12</Chip>
```

- **Filtro / tab**: inactivo = `bg-surface border-line text-secondary`; activo =
  `bg-primary text-inverse` (negro, no rojo: el rojo se reserva para precio y CTA).
  Esto es lo que hacen las referencias: el chip activo es negro.
- **Contenido**: `bg-surface-2 text-secondary` o con `tone` para `positive` /
  `negative` / `warning` / `brand` (`-soft` + `-border` + color de texto).
- Alturas: 36 (filtro), 28 (contenido), 20 (inline con `text-overline`).
- Recarga: transición de color con `--duration-fast`; sin animación de posición.

### 8.5 `Badge`

Chip no interactivo de tamaño fijo, 20 px, `text-overline`. Para rareza, nº de carta,
supertype, estado de un enlace. Tonos: `neutral` (default), `brand`, `positive`,
`negative`, `warning`, `info`.

### 8.6 `Surface` y `Card`

```tsx
<Surface>…</Surface>            // bg-surface border-line rounded-surface shadow-sm p-4
<Surface as="section" padded={false}>…</Surface>
```

Un solo componente. Lo que en v1 eran `rounded-xl border border-slate-800 bg-slate-900/40
p-4` en 15 archivos con 4 radios y 5 paddings distintos, ahora es `<Surface>`.
`Card` (colecciones) y `EmptyState` se construyen **encima** de `Surface`.

### 8.7 `Stat` y `StatRow`

Dos primitivas distintas, que en v1 eran 5 implementaciones del mismo concepto:

- **`Stat`** — grid de métricas. `<dt>` `overline text-tertiary`, `<dd>` `h3
  tabular-nums`, opcional `tone`. Semántica `dl/dt/dd` real.
- **`StatRow`** — fila de acción label-izquierda / valor-derecha / chevron. Es el
  patrón `Administrar  1/4 >` de la referencia. Clickeable, `role="button"` o
  envuelto en `Link`.

**Regla de grilla de stats:** nunca 5 stats en `grid-cols-2` (deja un huérfano). Los
conjuntos de 5 se parten en `2 + 3`: `grid-cols-2` con el primero ocupando 2 columnas
full-width, o se usan 4 + el valor total aparte como `StatRow`. Lo simple: **el
conteo de métricas nunca es impar en un grid de 2 columnas.**

### 8.8 `Alert`

Cinco tonos, dos tamaños, un solo componente. Reemplaza las 9 variantes de la v1.

```tsx
<Alert tone="warning" title="Precio desactualizado">Última actualización hace 3 días.</Alert>
<Alert tone="error" title="No pudimos cargar los precios" action={<Button size="sm" variant="secondary">Reintentar</Button>} />
```

| `tone` | Fondo | Borde | Texto | Icono |
|---|---|---|---|---|
| `info` | `bg-info-soft` | `border-info-border` | `text-info` | `Info` |
| `success` | `bg-positive-soft` | `border-positive-border` | `text-positive` | `Check` |
| `warning` | `bg-warning-soft` | `border-warning-border` | `text-warning` | `AlertTriangle` |
| `error` | `bg-negative-soft` | `border-negative-border` | `text-negative` | `AlertCircle` |
| `neutral` | `bg-surface-2` | `border-line` | `text-secondary` | — |

- `role="alert"` solo en `error`. Los otros son `role="status"` + `aria-live="polite"`.
- El botón de reintentar es siempre `<Button size="sm" variant="secondary">`, nunca
  texto plano, nunca un primario.

### 8.9 `Sheet`

Sucesor de `ModalShell`. Bottom sheet en mobile (`rounded-t-sheet`, `pop-in` desde
abajo con `--duration-base` + `--ease-emphasis`), dialogo centrado en `sm:`
(`rounded-panel`, `pop-in` centrado, `max-h-[85dvh] overflow-y-auto`).

- Se monta con `createPortal` a `document.body` (v1 lo renderizaba inline, dejando el
  fondo enfocable con el tabulador).
- `inert` en el resto del documento mientras está abierto.
- Focus trap, `Escape` cierra, scroll lock en `body`, y **devuelve el foco** al
  elemento que lo abrió, con guarda por si ese elemento ya se desmontó.
- Header propio: `title` (`h2`), `subtitle` opcional, `IconButton` de cerrar. Se
  acaba con las 3 copias del header con el mismo SVG inline.
- API: `<Sheet open onClose title subtitle footer>{children}</Sheet>`. **No** hay
  `titleId`: el título lo pone el componente, no el hijo.
- Gesto de cerrar arrastrando hacia abajo en mobile, con `--duration-fast` al soltar.
- Solo **un** sheet abierto a la vez: abrir uno cierra al anterior.

### 8.10 `Toast`

Nuevo. Reemplaza los `<p role="status" aria-live>` con autocierre dispersos por 4
archivos.

```tsx
const toast = useToast();
toast.success('Carta añadida a Mi colección');
```

- Se apila arriba a la derecha (abajo a la izquierda en mobile, sobre la nav).
- `role="status"` para success/info, `role="alert"` para error.
- 4 s de vida, se cierra con `X` o con un tap, pausa el timer en hover/focus.
- Máximo 3 visibles. El nuevo entra con `pop-in`; el que se descarta sale con
  `--duration-fast`.
- **Debajo de la nav** (`z-sheet` con offset), nunca tapando la `BottomNav`.

### 8.11 `EmptyState` y `ErrorState`

`EmptyState` distingue dos cosas que v1 mezclaba con el mismo chrome:

- `kind="first-use"` — nunca usaste lafeature. Icono grande, copy que explica el
  valor, un CTA primario.
- `kind="no-results"` — la query no devolvió nada. Copy corto que **repite el
  criterio** ("Sin resultados para «gengar ex»") y una acción de limpiar filtros.

`ErrorState` es aparte, con `Alert tone="error"`, el mensaje del backend si lo hay, y
`RetryButton`. **Nunca** se usa `EmptyState` para un error.

### 8.12 `Skeleton` y `Spinner`

- `Skeleton` con variantes: `text` (una línea), `avatar`, `card` (una carta de
  `CardGrid`), `stat`, `sheet`. Usa `shimmer`, no `animate-pulse`. Siempre
  `aria-hidden`, y el contenedor lleva `role="status"` + label.
- Un solo `Spinner` en la app (3 estilos distintos en v1). Tamaños `sm` 16, `md` 24,
  `lg` 32. `aria-hidden` siempre; el texto de carga lo pone quien lo muestra.
- Regla: un `Skeleton` para *estructura conocida*, un `Spinner` para *contenido
  desconocido*. Nunca los dos juntos.

### 8.13 `Pagination` → scroll infinito

En mobile, un botón "Cargar más" al final del grid es mejor que "Anterior / Siguiente":
mantiene la posición y no interrumpe el scroll. Se mantiene la **URL como fuente de
verdad** (`?page=`), y el botón hace scroll a la primera carta nueva.

`Pagination` numérica se conserva **solo** en `/share/[slug]`, que es una vista
pública que se abre por link y donde el scroll infinito no aplica.

### 8.14 Iconos

`lucide-react`. **Se elimina `components/scanner/icons.tsx`** (7 iconos a mano) y
todos los SVG inline sueltos (15, con 4 duplicados exactos).

- Todos con `aria-hidden` por default; el `aria-label` va en el `IconButton`.
- `strokeWidth={1.75}` global en el provider de iconos, para que sean todos iguales.
- Tamaño por contexto, no por icono: `h-5` en botón, `h-6` en tab, `h-8` en
  `ScreenHeader` action, `h-10` en `EmptyState`.
- Un icono **nunca** es la única fuente de información: siempre hay texto o
  `aria-label`.

### 8.15 `Money` y `PriceDelta`

`Money` se mantiene, se le sube el color por prop `tone` (`default` | `positive` |
`negative` | `brand`) y se le saca la clase hardcodeada.

`PriceDelta` es nuevo y es el componente de la referencia de precio:

```tsx
<PriceDelta value={-2839.31} percent={-73} currency="USD" window="últimos 30 días" />
```

Píldora `bg-negative-soft text-negative` (o `positive` si sube), `tabular-nums`,
con `TrendingDown` / `TrendingUp` de lucide. **Cero decimales en el porcentaje, dos
en el monto.**

---

## 9. Reglas de datos en pantalla

### 9.1 Estados de carga y error (patrón único)

Toda vista con datos remotos tiene **exactamente** estos cinco estados, en este orden
de código, y ninguno se saltea:

```
1. loading    → Skeleton con la forma real del contenido
2. error      → ErrorState con el mensaje del backend + Reintentar
3. empty      → EmptyState con kind="no-results" y el criterio repetido
4. partial    → el contenido + un Alert de warning arriba ("3 cartas sin precio")
5. ready      → el contenido
```

El patrón de "inline status + `reloadToken`" de v1 (6 pantallas lo usan) se
encapsula en un hook, no se reimplementa:

```ts
type AsyncState<T> = { status: 'loading' | 'ready' | 'error'; data: T | null; error: string | null };
function useAsync<T>(fn: (signal: AbortSignal) => Promise<T>, deps: unknown[]): AsyncState<T> & { reload: () => void };
```

### 9.2 Contenido que espera

Mientras un dato llega, **no se muestra un placeholder con forma de dato**. Se
muestra la estructura con `Skeleton`. Si un valor puede faltar de verdad (precio de
una carta rara), se muestra `—` en `text-tertiary` con `aria-label="Sin precio"`, no
`$0.00` ni un espacio.

### 9.3 Formato de moneda

*(de v1, sin cambios)*

| Moneda | Formato | Ejemplos |
|---|---|---|
| **USD** | `en-US`, 2 decimales fijos | `$12.50`, `$1,234.56` |
| **ARS** | `es-AR`, 0 decimales, `$` delante | `$1.473.000`, `$0` |

Toda cifra de dinero pasa por `lib/format.ts` o por `useCurrency().formatMoney`.
Nunca `toLocaleString` suelto en un componente. El valor crudo **siempre es USD**;
`formatMoney` convierte en el cliente. Sin cotización disponible, `useCurrency` fuerza
USD: es el feature flag `CURRENCY_ARS_ENABLED` del backend, no un error.

### 9.4 Fechas y números

*(de v1, sin cambios)*

| Función | Formato | Ejemplo |
|---|---|---|
| `formatDate(iso)` | `es-AR`, día + mes corto + año | `5 de oct. de 1999` |
| `formatRelativeTime(iso)` | rioplatense a mano | `hace instantes` / `hace 3 min` / `hace 12 días` |
| `formatCardNumber(n, total)` | `n / total`, o solo `n` | `4 / 102` |
| `pluralize(count, sing, plur)` | | `1 coincidencia` / `3 coincidencias` |

### 9.5 Labels de variante y condición — fuente única

En v1 había tres tablas de labels de variante que no coincidían ("Holo" vs
"Holofoil" vs "1st Edition Normal"). Ahora hay **un solo lugar**:
`lib/variants.ts`, que exporta `VARIANT_OPTIONS`, `CONDITION_OPTIONS`,
`variantLabel()`, `variantShort()`, `conditionLabel()`, `conditionShort()`.

`price-display.tsx`, `collection-options.ts` y `item-actions.tsx` importan de ahí. No
se permite una tabla de labels en un componente.

---

## 10. Copy

*(de v1, con las correcciones de abajo)*

- Español **rioplatense**: "Escaneá", "Sumá", "Consultá", "Arrancá".
- **Tildes y `…` siempre.** En v1 convivían "Entrando..." con "…", y "Las contrasenas
  no coinciden" sin tilde. Es un bug de calidad, no una preferencia.
- **Voseo**, no "usted".
- Voz activa, primera persona del plural para lo que hace la app: "Escaneamos tu
  carta", no "Tu carta fue escaneada".

### 10.1 Longitud

| Contexto | Máximo |
|---|---|
| `Button` | 3 palabras |
| `Chip` de filtro | 2 palabras |
| `Sheet` title | 4 palabras |
| Título de pantalla (`h1`) | 4 palabras |
| `Alert` title | 5 palabras |
| `Alert` body | 2 líneas (~140 caracteres) |
| `EmptyState` description | 2 líneas |

### 10.2 Estados vacíos y de error

- Vacío con query: repetí el criterio. *"Sin resultados para «gengar ex»."*
- Vacío sin query: explicá el valor. *"Escaneá tu primera carta y armá tu colección."*
- Error: **qué pasó + qué hacer**. *"No pudimos cargar los precios. Revisá tu conexión
  y reintentá."* Nunca *"Error desconocido"* ni *"Algo salió mal"*.
- En Scan: el copy ya vive en `CAMERA_ERROR_COPY` y está bien escrito. Se mantiene.

### 10.3 Números en el copy

Los números en texto libre usan `Intl.NumberFormat('es-AR')` vía `pluralize` /
`formatCardNumber`, nunca interpolación directa: `` `${n} cartas` `` está prohibido
(cuando `n === 1` hay que decir "1 carta").

---

## 11. Accesibilidad

*(de v1, más lo que faltaba)*

- **Todo ícono es `aria-hidden`.** El `aria-label` va en el control que lo contiene.
- **Skeletons** `aria-hidden`, con el contenedor en `role="status"` + label. `aria-busy`
  en el `<main>` de los `loading.tsx`.
- **Barra de progreso**: `role="progressbar"` con `aria-valuemin/max/now`. La barra de
  confianza de un candidato es `role="img"` con `aria-label="Coincidencia 84 por
  ciento"`.
- **Mensajes**: `role="alert"` solo para error; `role="status"` + `aria-live="polite"`
  para lo que cambia solo.
- **Inputs**: `<label htmlFor>` siempre; `sr-only` si es visualmente redundante;
  `aria-invalid` + `aria-describedby` en `Field`; `inputMode` correcto.
- **Foco visible obligatorio**: `focus:ring-2 focus:ring-brand/20` en todo control.
  Cero `focus:outline-none` sin alternativa. En el dark el anillo es
  `focus:ring-brand/40`.
- **Skip link**: `<a href="#contenido" className="sr-only focus:not-sr-only …">Saltar
  al contenido</a>` como primer elemento del `<body>`. Con `BottomNav` fija y 20
  cartas en grilla, el teclado no puede tener que atravesar 10+ elementos.
- **`<main id="contenido">`** único y consistente en todas las pantallas.
- **`prefers-reduced-motion`** respetado (ver §5.3).
- **Contraste AA** en todo texto (ver §2.4).
- **Tabs**: si se usa `role="tablist"`, entonces `role="tabpanel"`, `aria-controls`,
  `tabindex` roving y flechas ← →. **O no se usa tabs y son `Chip` con
  `aria-pressed`.** La v1 usaba un tablist a medio hacer, que es peor que no usarlo.
  El criterio: si el contenido cambia pero la pantalla no, es un `Chip` con
  `aria-pressed`; si cambia la URL, es un `Link` con `aria-current`.

---

## 12. Anti-patrones

Lista corta y vinculante. Si algo de acá aparece en un PR, el PR no entra.

| Anti-patrón | Por qué está prohibido |
|---|---|
| `text-white`, `bg-black`, `bg-slate-950`, `bg-sky-500` | Colores crudos. Van tokens. |
| `text-[13px]`, `text-[11px]`, `text-[10px]` | Tamaño fuera de la escala de §3.1. |
| `rounded-md`, `rounded-2xl` sin motivo | Radios sin token son tokens rotos. |
| `space-y-*` | Se mezcla mal con `gap-*`; produce salto de layout. |
| `focus:outline-none` sin `focus:ring-*` | WCAG 2.4.7. |
| `transition` sin duración | 150 ms default implícito, no es una decisión. |
| `animate-pulse` | Reemplazado por el `shimmer` de `Skeleton`. |
| `className={`template string`}` | Sin `cn()`, no se resuelven conflictos. |
| Copiar un componente y cambiarle el color | Se agrega una variante. |
| `dangerouslySetInnerHTML` / `<style>` inline salvo el script anti-flash de tema | Uno de los dos es el tema del `<head>`, y va en un archivo. |
| `toLocaleString` en un componente | Va por `lib/format.ts`. |
| `''` como placeholder de un valor | Va `—` con `text-tertiary`. |
| Tocar el `width`/`height` de un `<img>` sin `next/image` | Toda imagen pasa por `next/image`. La única excepción es el preview de `ScanProgress`, que muestra un `blob:` local y ya está justificada con un `eslint-disable`. |
| Un `5` en un `grid-cols-2` de stats | Deja un huérfano. Ver §8.7. |
| Un `Select` nativo con más de 12 opciones | Ver §8.3. |
| Un `z-[nnn]` | Ver §6. |

---

## 13. Checklist de PR (frontend)

Antes de pedir revisión:

- [ ] `pnpm run check` en verde desde la raíz.
- [ ] Ningún color crudo ni tamaño fuera de escala (grep del anti-patrón de arriba).
- [ ] Todo componente nuevo sale de `components/ui/` o es **de verdad** específico de
      la pantalla; si es el segundo caso, no lleva `bg-` hardcodeado.
- [ ] Estados de carga, error y vacío del §9.1 implementados, con sus labels ARIA.
- [ ] Foco visible en todo elemento interactivo, verificado con Tab.
- [ ] Probado a 390 px en **los dos temas** y con `prefers-reduced-motion: reduce`.
- [ ] Probado en la PWA instalada (no solo en browser): nav, safe areas, cámara.
- [ ] Copy con tildes y `…`, y con voseo.
- [ ] `Number` de cifras con `tabular-nums` si se compara con otro.
- [ ] Si tocaste el contrato: el otro lado (`types/api.ts` ↔ DTO del backend) está en
      el mismo commit.
- [ ] Docs actualizadas: `design-system.md`, `components.md`, `routes.md`.

---

## 14. Lo que quedó de v1 y sigue igual

Estas reglas ya estaban bien y no cambian: Accesibilidad (salvo lo nuevo de arriba),
Moneda, Fechas y números, el Service Worker y sus 4 cachés (navegaciones
`NetworkFirst`, imágenes `CacheFirst` 150, `/tesseract/*` `CacheFirst`, API pública
`NetworkFirst` 50, nunca cachea requests autenticadas, registro solo en producción),
la proporción `aspect-[63/88]` (63 × 88 mm reales, no una aproximación), el idioma
`lang="es-AR"`, y la política Server Component / Client Component.
