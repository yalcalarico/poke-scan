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
5. **Todo se puede tocar con 44 px y llegar con el teclado.** El tamaño **default**
   de todo control interactivo —el que sale de `size="md"`— es de 44 px, porque
   el default es el que decide si la regla se cumple o no. Cualquier excepción
   necesita un comentario que explique por qué, y hay dos documentadas: el
   `Switch` de 26 px (§8.3) y el chip de contenido de 28 px (§8.4), en los dos
   casos porque el objetivo real del toque es otro elemento más grande.
   Y el foco no es decorativo: se ve, llega a 3:1 de contraste, y **nadie lo
   recorta** (ver §4.4).

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

### Cuatro tokens sin utilidad

`--focus-ring`, `--focus-ring-on-media`, `--border-control` y `--switch-track-off`
**no** están mapeados en `@theme inline`, a propósito. No existen `outline-focus`,
`border-control` ni `switch-track-off` como clases, y eso es lo correcto:

- `--focus-ring` y `--focus-ring-on-media` se consumen con sintaxis de valor
  arbitrario: `outline-[color:var(--focus-ring)]`. Mapeados a `--color-*` habrían
  producido `outline-focus` y `bg-focus`, que son las dos cosas que el design
  system no quiere: el anillo de foco no es un color de relleno y no se le pone
  a un `background`.
- `--border-control` y `--switch-track-off` sí se usan como `border` y `bg`, pero
  con valor arbitrario (`border-[color:var(--border-control)]`) porque la
  distinción con `--border-default` es **de rol**, no de tono: el primero es "el
  límite de un control" y el segundo "una separación decorativa", y una utilidad
  que no dice cuál es cuál se presta para equivocarse.

Cuando agregues un token nuevo, la pregunta es si pertenece al mapa de
utilidades o al consumo por `var()`. Los colores de superficie, texto, borde
decorativo y marca pertenecen al mapa; los tres de "estado" de un control, no.

---

## 2. Color

### 2.1 Tokens

Definidos en `app/globals.css`. Los **semánticos** viven fuera de `@theme` (porque
cambian con el tema) y se re-exponen adentro con `@theme inline`, que es el mecanismo
de Tailwind 4 para eso.

Este bloque es una **copia de los valores**, no del texto: los comentarios con el
porqué de cada decisión viven en `globals.css`, junto al token, y son la fuente.
Lo que está acá y no en el CSS: los tokens que no se mapean a utilidad (§1, "Cuatro
tokens sin utilidad"), y las tres capas de `@theme` que no son color.

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
  --text-tertiary: #6f6f7a;
  --text-disabled: #b4b4bd;
  --text-inverse: #ffffff;

  /* Bordes */
  --border-subtle: #eeeef2;
  --border-default: #e4e4e9;
  --border-strong: #d0d0d8;

  /* Solo el límite de los controles de formulario, no los separadores. */
  --border-control: #a8a8b2;

  /* Indicador de foco. A color pleno: `ring-brand/20` medía 1.38:1. */
  --focus-ring: #e01f26;

  /* Indicador de foco sobre el velo del scanner: blanco, no el rojo de marca
     (`#e01f26` mide 1.91:1 contra ese scrim, `#ff4a4f` 2.57:1). */
  --focus-ring-on-media: #ffffff;

  /* Riel de un `Switch` apagado: el knob medía 1.16:1 contra `--surface-3`. */
  --switch-track-off: #a8a8b2;

  /* Marca: rojo. Es el acento de navegación y de acción primaria. */
  --brand: #d81c23;
  --brand-hover: #c2161c;
  --brand-press: #9e1217;
  --brand-soft: #fff0f0;
  --brand-border: #ffc9c9;
  --on-brand: #ffffff;

  /* Semánticos */
  --positive: #117a47;          /* valor, dinero, éxito, precio subiendo */
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

  /* Paradas del degradado del `Skeleton` (token del sistema, no del componente) */
  --shimmer-from: #dcdce4;
  --shimmer-to: #f2f2f5;
}

.dark {
  --canvas: #0b0b0f;
  --surface: #15151b;
  --surface-2: #1d1d24;
  --surface-3: #26262f;
  --overlay: rgb(0 0 0 / 0.7);

  --text-primary: #f5f5f7;
  --text-secondary: #a1a1ae;
  --text-tertiary: #82828c;
  --text-disabled: #4a4a54;
  --text-inverse: #0b0b0f;

  --border-subtle: #1d1d24;
  --border-default: #2a2a33;
  --border-strong: #3c3c48;

  --border-control: #6a6a76;
  --focus-ring: #ff4a4f;
  --focus-ring-on-media: #ffffff;
  --switch-track-off: #6a6a76;

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

  --shimmer-from: #23232b;
  --shimmer-to: #2b2b35;
}

@theme inline {
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);

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

  --color-shimmer-from: var(--shimmer-from);
  --color-shimmer-to: var(--shimmer-to);

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

  /* El namespace de duración de Tailwind 4 es `--transition-duration-*`, así que
     estos alias son los que hacen existir `duration-fast`, `duration-base`, etc.
     Sin ellos habría que escribir `duration-[240ms]`, que §3.1 prohíbe. */
  --transition-duration-instant: var(--duration-instant);
  --transition-duration-fast: var(--duration-fast);
  --transition-duration-base: var(--duration-base);
  --transition-duration-slow: var(--duration-slow);

  /* §6. Ojo: el namespace de z-index también cambia, es `--z-index-*`. */
  --z-index-base: 0;
  --z-index-sticky: 40;
  --z-index-nav: 50;
  --z-index-overlay: 60;
  --z-index-sheet: 70;
  --z-index-media: 90;
  --z-index-offline: 100;

  /* §5.1. Cada animación es un token, no una clase con la duración escrita a mano. */
  --animate-fade-in: fade-in var(--duration-base) var(--ease-standard) both;
  --animate-sheet-up: sheet-up var(--duration-base) var(--ease-emphasis) both;
  --animate-pop-in: pop-in var(--duration-base) var(--ease-emphasis) both;
  --animate-shimmer: shimmer 1.6s linear infinite;
  --animate-flash-once: flash-once var(--duration-slow) var(--ease-standard) both;
}
```

`.dark` **no** redefine sombras. En dark la separación la hacen el borde y la
diferencia de superficie; las sombras de `@theme` sirven igual porque son
semi-transparentes y se leen como "oscuridad hacia abajo", que es lo correcto.

Y `.dark` **tampoco** redefine `--shimmer-*` por el motivo inverso: el shimmer es un
placeholder y tiene que leerse contra la superficie, así que en dark sube de valor
igual que en light.

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
| Indicador de foco | `outline-[color:var(--focus-ring)]` | **Todo** elemento enfocable (§8.3, §11) |
| Indicador de foco sobre foto | `outline-[color:var(--focus-ring-on-media)]` | Los 4 indicadores del scanner (§8.16) |
| Límite de un control | `border-[color:var(--border-control)]` | `Input`, `Textarea`, disparador del `Select` (no el `Switch`) |
| Riel apagado de un `Switch` | `bg-[color:var(--switch-track-off)]` | `Switch` en posición OFF |

### 2.3 Dos reglas semánticas que no se rompen

**`warning` nunca es un error.** Es "esto está viejo, o no estamos seguros del
resultado": precio desactualizado, cotización vieja, coincidencia visual débil, cartas
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
- Indicador de foco y borde de control: ≥ 3:1 (SC 1.4.11, *Non-text Contrast*).

Todos los ratios de esta tabla están **medidos** con la fórmula de WCAG 2.x contra los
tokens de §2.1, no estimados. Cuando se cambia un token, se vuelve a medir la fila
que lo usa: es la única forma de que el documento siga siendo cierto.

| Token | Contra | Ratio | |
|---|---|---|---|
| `--focus-ring` | `--surface` | **4.78:1** | era **1.38:1** con `ring-brand/20` |
| `--focus-ring` | `--surface` (dark) | **5.49:1** | |
| `--focus-ring-on-media` | velo `--on-media` | **7–9:1** | el peor caso es la foto más clara |
| `--brand` (light) | `--brand-soft` | **4.62:1** | era 4.32:1 |
| `--positive` (light) | `--positive-soft` | **4.83:1** | era 4.47:1 |
| `--on-brand` | `--brand` (light) | **5.11:1** | texto del botón primario |
| `--text-tertiary` | `--canvas` | **4.52:1** | era **3.28:1**: no pasaba |
| `--text-tertiary` | `--surface` | **4.96:1** | |
| `--text-tertiary` | `--surface-2` | **4.68:1** | |
| `--text-tertiary` | `--surface-3` | 4.29:1 | **no llega**: no usarlo sobre un hover |
| `--text-tertiary` | `--surface` (dark) | **4.78:1** | era **3.99:1** |
| `--text-tertiary` | `--surface-2` (dark) | 4.40:1 | **no llega** |
| `--text-tertiary` | `--surface-3` (dark) | 3.94:1 | **no llega** |
| `--shimmer-from` | `--surface` | 1.36:1 | era 1.16:1 |

**`text-tertiary` sigue siendo terciario de verdad.** Los tokens ya pasan 4.5:1
contra canvas y superficie, así que `--text-tertiary` puede llevar metadata; lo que
no puede es ser el único texto de una pantalla (§11). Ojo con las tres filas que
no llegan: un `text-tertiary` **sobre `--surface-3`** (un hover) queda bajo 4.5 en los
dos temas, así que una fila de hover no puede tener su único texto en terciario.

### 2.4.1 Un incumplimiento que sigue abierto

`--border-control` **en light** mide **2.22:1** contra el `--surface-2` del propio
campo (y 2.36:1 contra `--surface`), o sea que no llega al 3:1 de SC 1.4.11. En dark
sí pasa: 3.14:1 contra `--surface-2`. Lo mismo para `--switch-track-off`, que comparte
el valor de claro.

No se corrige acá a propósito, por dos razones: (1) el límite de un campo de texto no
es la única pista de que es un campo —tiene su propio fondo, su label y su icono— y
SC 1.4.11 exige 3:1 solo para la información **necesaria** para identificar el
componente; (2) oscurecerlo más rompe el look, que es el otro objetivo del sistema.
Pero es una excepción consciente y no un overlook: **si alguna vez un control se
identifica solo por su borde, hay que subir `--border-control` en light**, y la vía
es el bloque `prefers-contrast: more` de §5.5, que ya lo lleva a `#5c5c68` (6.21:1)
para quien lo pide explícitamente.

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

Diez pasos. **Nada fuera de esta tabla.** Se implementan como `@utility` de Tailwind
—que las mete en la capa `utilities`, así que ganan contra cualquier clase de
componente y se pueden pisar con variantes (`sm:text-h1`)—, no como clases de
`@layer components`. No se escriben `text-[13px]`.

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
| `overline` | **11 / 14** | 600 | 0.08em, `uppercase` | El "VALUE" de la card resumen, labels de stat |

El `overline` **subió de 10/12 a 11/14**. No es un capricio de diseño: a 10 px no se
distingue de `caption` salvo por el uppercase, y el tracking de 0.08em sobre diez
caracteres dejaba el `VALUE` de la card resumen ilegible en pantallas de baja
densidad. 11 px con el mismo peso y el mismo tracking sigue siendo un overline y
sigue llamándose `overline`: el nombre del token no cambia cuando el valor cambia.

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
| Padding de un control | `px-4 py-2.5` (md), `px-3.5 py-1` (sm), `px-5 py-3` (lg) — en un `h-*` fijo el `py` se **deriva** del alto, no es nominal (§8.3) |
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

### 4.4 Los 4 px de aire del indicador de foco — no se borran

> `outline-offset: 2px` + `outline-width: 2px` = **4 px de aire** en cada lado del
> indicador de foco. Es el número que hace que un `outline` sea un indicador y no
> una línea pegada al borde del control.

Ese aire **necesita espacio en el layout, y el que lo recorta es el `overflow` del
padre**. La trampa concreta:

- Un scroller horizontal con `overflow-x-auto` **y sin padding vertical recorta el
  `outline` de los hijos**. Lo peor es que parece un scroller "solo horizontal":
  **`overflow-x: auto` fuerza el `overflow-y` computado a `auto`**
  (CSS Overflow 3), así que también recorta en vertical. Un `overflow-x-auto` sin
  `py-*` es un recorte en las dos direcciones.
- Por eso los scrollers de chips y filtros que tienen elementos enfocables llevan
  **`py-1`**, aunque a simple vista parezca padding de más: no lo es. Ya está en
  `carta/[id]/actions.tsx`, `carta/[id]/page.tsx`, `collection-filters.tsx`,
  `rarity-filter.tsx` y `set-progress/binder-view.tsx`.

Y el caso inverso, cuando el aire hacia afuera no existe porque un ancestro tiene
`overflow-hidden`: el indicador **se dibuja hacia adentro**, con
`-outline-offset-2` (queda 0 px de aire y 2 px de grosor dentro de la caja). Hoy está
en `collection-card.tsx` y `price-hero.tsx`, los dos dentro de una `Surface`
`overflow-hidden`. El criterio para elegir: si el ancestro recorta, va adentro; si no,
afuera. Nunca se deja sin indicador.

**Si tocás un `overflow-hidden` o un scroller, revisá si el foco le queda visible.**

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

Ojo con una cosa: este bloque **no** apaga el indicador de foco. Si alguna vez
alguien lo agrega al `outline`, se está rompiendo WCAG 2.4.7 y el objetivo de §5.4
al mismo tiempo.

### 5.4 `forced-colors: active` — obligatorio

Windows High Contrast, y el equivalente en iOS. El UA reemplaza los colores del autor
por su paleta, y como el chrome de la app se apoya en superficie + borde
(`bg-surface` + `border-line` + `shadow-sm`), los bordes se funden con el fondo y los
paneles quedan planos. Va en `globals.css` desde la Fase 0.

Lo primero y más importante es lo que **no** se hace: **nunca**
`forced-color-adjust: none`. Eso apagaría el modo entero, y el `Checkbox` es un
`<input type="checkbox">` nativo *a propósito* justamente porque dibuja bien acá. Lo
que se hace es la inversa: sobreescribir los tokens con palabras clave del sistema,
así la app sigue las reglas del sistema en vez de pelearlas.

```css
@media (forced-colors: active) {
  :root, .dark {
    --canvas: Canvas;   --surface: Canvas;    --surface-2: Canvas;  --surface-3: Canvas;
    --border-subtle: ButtonBorder;  --border-default: ButtonBorder;
    --border-strong: ButtonText;    --border-control: ButtonBorder;
    --focus-ring: Highlight;        --focus-ring-on-media: Highlight;
    --switch-track-off: ButtonBorder;
    --text-secondary: CanvasText;   --text-tertiary: GrayText;  --text-disabled: GrayText;
  }

  /* El mecanismo PRIMARIO de foco en forced colors, no un fallback (§4.4, §8.3) */
  :focus-visible {
    outline: 2px solid Highlight;
    outline-offset: 2px;
  }
}
```

`.dark` entra también: en high contrast el tema del sistema manda, y el mismo
conjunto de palabras clave funciona para los dos.

Y `:focus-visible { outline: … }` **no es un parche**: el indicador de foco del
sistema es un `outline`, y el `outline` es de lo único que sobrevive acá (el `ring`
—`box-shadow`— lo fuerza el UA a `none`). Por eso `--focus-ring` se sobreescribe con
`Highlight` y no con el rojo de marca: si el anillo no llegara a 3:1 contra su fondo,
el del sistema tampoco, y no hay forma de arreglarlo desde la paleta del autor. Ver
el comentario largo en `globals.css`.

### 5.5 `prefers-contrast: more` — obligatorio

No cambia el tema ni los colores semánticos: **sube el piso** de separación de los
bordes y de la metadata, que es lo primero que se aplana cuando la fuente del sistema
achica el contraste. Los valores no son nuevos: cada uno es el de otro token que ya
está en el archivo (el tertiary se pega al secondary, el borde de control sube al gris
de texto). Es un piso más alto con la misma paleta, no una paleta nueva.

| Token | Normal (light) | `prefers-contrast: more` |
|---|---|---|
| `--text-tertiary` | `#6f6f7a` (4.52:1) | `#5c5c68` (6.00:1) |
| `--border-default` | `#e4e4e9` | `#a8a8b2` (2.15:1) |
| `--border-control` | `#a8a8b2` (2.22:1) | `#5c5c68` (6.21:1) |
| `--switch-track-off` | `#a8a8b2` (2.22:1) | `#5c5c68` |

En dark pasa lo mismo con los equivalentes: `--text-tertiary` de `#82828c` a
`#a1a1ae`, `--border-default` de `#2a2a33` a `#6a6a76`, `--border-control` y
`--switch-track-off` de `#6a6a76` a `#a1a1ae`. Es la vía por la que se resuelve
 conscientiousemente el incumplimiento de §2.4.1.

### 5.6 Reglas a nivel documento

Tres reglas de `<html>` que no son de ningún componente y por eso no viven en uno,
con su porqué en `globals.css`:

| Regla | Por qué |
|---|---|
| `touch-action: manipulation` | Saca el delay de 300 ms del tap en Chrome y Android. `user-scalable` no es la respuesta: el zoom se permite hasta 5× y lo que se quiere es que un toque responda ya, no que la página no se pueda zoomear. |
| `overscroll-behavior-y: contain` | Evita el pull-to-refresh. En una PWA eso no recarga la página: dispara la navegación del service worker y deja la app en un estado raro a mitad de uso. |
| `scroll-padding-top: calc(3.5rem + env(safe-area-inset-top))` | Arregla un bug real: el `ScreenHeader` es `sticky top-0` con `h-14` + el safe area, y sin scroll padding los `scrollIntoView({ block: 'start' })` dejaban la carta destino debajo del header y el skip link aterrizaba tapado. Cierra SC 2.4.11 (Focus Not Obscured). |

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

- Alturas: `sm` **32**, `md` **44**, `lg` **48**, `icon` **44×44**.
  `md` **subió de 40 a 44** y es el cambio de una línea que hace que §0.5 sea
  cierta: `md` es el tamaño **default**, o sea el de todos los botones de la app, y
  el default es el que decide si la regla se cumple o no. `sm` sigue en 32 y esta
  misma tabla lo reserva para acciones terciarias dentro de una fila densa; es la
  excepción, y está escrita abajo en el `Button` con su motivo.
- El padding vertical **no** se escribe en un botón: el alto fijo `h-*` manda y el
  texto se centra con `items-center`. (En `Input` es al revés, y por un motivo
  distinto: ver §8.3.)
- `loading`: muestra `Spinner` + cambia a `pendingLabel` + `aria-busy` + `disabled`.
  **Nunca** un spinner suelto al lado del texto: el botón entero cambia. Sin
  `pendingLabel` los `children` van a un `sr-only`, así que el nombre accesible no se
  pierde (SC 4.1.2) —el `pendingLabel` aporta el texto **visible** del estado
  ocupado, que es una decisión de copy, no de accesibilidad.
- `pressed` usa `active:scale-[0.98]` con `--duration-instant` + `--ease-standard`.
- `fullWidth` para los botones de pantalla completa y los de auth.
- Indicador de foco: el bloque de `outline` de §8.3, no un `ring`.

### 8.2 `IconButton`

Ícono + `aria-label` obligatorio. `sm` y `md` **44×44**, con `md` por defecto:
el tamaño compacto conserva el objetivo táctil. `tooltip` opcional (solo desktop, se oculta en
touch). Indicador de foco: el bloque `outline` de §8.3.

### 8.3 El indicador de foco — obligatorio

> **Este bloque es normativo.** El patrón que estaba antes acá
> (`focus:ring-2 focus:ring-brand/20`) **fallaba** y no se vuelve a escribir. Lee
> §8.3.1 antes de tocar cualquier componente.

El indicador de foco del design system es un **`outline` a color pleno**:

```tsx
// Botones, chips, icon buttons, switch: no es un control de texto, así que el
// disparador es `:focus-visible` y no `:focus`.
'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]'

// Controles de texto: el disparador es `:focus`.
'focus:outline-2 focus:outline-offset-2 focus:outline-[color:var(--focus-ring)]'
```

En los controles de texto además va `focus:border-brand`, porque ahí el color del
borde sí aporta: en `aria-[invalid=true]` el borde **y** el indicador pasan a
`--negative` a color pleno.

El disparador es `focus:` y no `focus-visible:` en un campo de texto por un motivo
concreto: **un campo de texto tiene que avisar que está activo también cuando lo
enfocás con el click**, que en mobile es como lo enfocás el 100 % de las veces. En un
`<button>` el click no cambia el foco, así que `focus-visible:` es lo correcto.

#### 8.3.1 Por qué `outline` y no `ring`, y por qué a color pleno

Dos razones independientes, y las dos hay que respetarlas:

1. **Contraste.** El patrón viejo era `ring-brand/20`: un 20 % de alfa del rojo de
   marca sobre una superficie clara medía **1.38:1**. WCAG 2.2 SC 1.4.11 pide
   **3:1** para el indicador de foco, y este es el único mecanismo que tiene una
   persona que navega con teclado para saber dónde está. Por eso `--focus-ring` va a
   color pleno: **nunca** a un alfa del token de marca. Hoy mide 4.78:1 contra
   `--surface`.
2. **`outline` sobrevive a `forced-colors`, `ring` no.** `ring-*` de Tailwind es un
   `box-shadow`, y en Windows High Contrast el UA fuerza `box-shadow: none`: el
   indicador desaparece justo en el modo donde más se lo necesita (ver §5.4).

Y `outline-offset: 2px` no es decoración: es el aire de §4.4, sin el cual el
indicador queda pegado al borde del control y no se lee como indicador.

**Consecuencias que hay que respetar al tocar un componente** (detalle en §4.4):

- Un scroller `overflow-x-auto` sin `py-*` **recorta** el indicador. Los scrollers de
  chips llevan `py-1` por eso, no porque quede más prolijo.
- Un ancestro `overflow-hidden` obliga a `-outline-offset-2` (indicador hacia
  adentro): hoy en `collection-card.tsx` y `price-hero.tsx`.
- Sobre el velo del scanner, `--focus-ring` **no sirve** (1.91:1 / 2.57:1 contra el
  scrim): ahí va `--focus-ring-on-media`. Ver §8.16.

Cero `focus:outline-none` sin alternativa, en cualquier elemento.

#### 8.3.2 El resto de `Field`, `Input`, `Textarea`, `Select`, `Checkbox`, `Switch`

**`Field` es obligatorio** para todo campo de formulario. Reemplaza el `FormField`
suelto de v1 y todos los `<label>` + input reimplementados a mano.

```tsx
<Field label="Cantidad" hint="Máximo 999" error={errors.quantity}>
  <Input name="quantity" type="number" inputMode="numeric" defaultValue={1} />
</Field>
```

- `Field` provee `<label htmlFor>`, hint, error, `aria-describedby` y `aria-invalid`.
  El `id` sale de `useId()`.
- `Input` / `Textarea`: `bg-surface-2 rounded-control px-4 py-2.5 text-body
  placeholder:text-disabled` + el bloque `outline` de arriba. El borde es
  **`border-[color:var(--border-control)]`**, no `border-line`: contra el
  `bg-surface-2` propio del control, `--border-default` mide 1.19:1 y el campo deja
  de leerse como campo (ver §2.4.1 para el matiz del 3:1).
- Alturas: `sm` **32**, `md` **44**, `lg` **48**. `md` subió de 40 a 44 por lo mismo
  que `Button`. El `py-*` de un control de texto **sí** se escribe, pero derivado del
  alto y no nominal: `44 − 2 de borde − 22 de interlineado = 20`, o sea 10 de cada
  lado. Con un `h-*` fijo y el `py-2.5` de §4.1 quedaban 18 px de caja para 22 px de
  interlineado y el texto se recortaba.
- **`Select` es un listbox propio, no un `<select>`.** Motivo: hay 8 selects nativos en
  la app y el de set tiene 176 opciones; en iOS el dropdown del sistema rompe la
  sensación de producto. Implementación: `role="listbox"` + `role="option"` +
  `aria-expanded` + `aria-activedescendant`, navegado con ↑ ↓ Enter Esc, con
  `aria-label` en el botón. Tipo/retro/input de texto, `Portal` a `document.body`,
  `max-h-72 overflow-y-auto`, y **búsqueda interna** obligatoria cuando hay más de 12
  opciones. Foco atrapado dentro del listbox mientras está abierto. Alturas `sm` 32,
  `md` **44**, `lg` 48. El borde del popover del listbox usa `focus-within:` con
  `-outline-offset-2`, porque el popover recorta por `overflow-hidden` (§4.4).
- `Checkbox` y `Switch`: `Checkbox` 20×20 nativo con `accent-brand` —a propósito, es
  lo único que dibuja bien en high contrast (§5.4)— y `Switch` de **44×26** con knob
  animado y el riel apagado en `--switch-track-off`. Ambos con `<label htmlFor>`
  real, no label envolviendo.

**Excepciones a §0.5, y por qué se justifican.** El track del `Switch` mide 26 px,
menos de los 44: la fila completa es tappable (el label es el target del click y del
foco) y por encima del switch hay padding de la fila, así que el objetivo real es de
44 px sin inflar el control visual. `Checkbox` en 20×20 es el mismo argumento y además
el control nativo. Ninguna de las dos se arregla subiendo el control.

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
- Alturas: **`md` 44 (filtro o acción)**, `sm` **28 (contenido)**. El `mode` decide el tamaño
  por defecto: `filter` → `md` (44), `content` → `sm` (28). Las acciones de ficha
  usan `md` explícito para conservar un objetivo táctil de 44 px.
- **El chip de contenido se queda en 28 a propósito**, y es la excepción que §0.5
  pide justificar. El chip de contenido vive **adentro** de una card, al lado de un
  precio o de un contador: subirlo a 40 no lo haría más accesible —el objetivo real
  sigue siendo la fila de la card— y desarmaría la retícula de `/carta/[id]`. Los dos
  tamaños siguen siendo públicos (`size` explícito) para el consumidor que sí quiera
  un chip de contenido grande.
- El foco del `Chip` es el bloque `outline` de §8.3, y por eso las filas con scroll
  horizontal necesitan `py-1` (§4.4).
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

**`Surface` es `overflow-hidden`, y eso tiene una consecuencia con el foco.** El
indicador hacia afuera de un elemento que llena la `Surface` entera se recorta contra
su propio borde. Cuando el elemento enfocable es **la `Surface` misma** (una card
clickeable), el offset va **negativo**: `-outline-offset-2`, dibujado 2 px adentro del
borde de la tarjeta. Hoy está en `collection-card.tsx` y `price-hero.tsx`. Cuando el
elemento enfocable está **adentro** de la `Surface` y con padding alrededor, el
`outline-2 outline-offset-2` de §8.3 va bien. Ver §4.4.

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

`PriceHero` vive en una `Surface` `overflow-hidden`, así que su indicador de foco va
`-outline-offset-2` (§8.6, §4.4).

### 8.16 El foco sobre foto: `--focus-ring-on-media`

El scanner es la **única** parte de la app donde el indicador de foco va sobre una
superficie que no es un token de superficie: el velo `--on-media` sobre el `<video>`.
Y ahí `--focus-ring` **no se puede usar**:

| Indicador | Contra el velo | | |
|---|---|---|---|
| `--focus-ring` light `#e01f26` | **1.91:1** | no llega | |
| `--focus-ring` dark `#ff4a4f` | **2.57:1** | no llega | |
| `--focus-ring-on-media` (blanco) | **7–9:1** | pasa | el peor caso es la foto más clara |

El rojo de marca es la marca, no un color de foco sobre negro: sobre una superficie
oscura desaparece. `--focus-ring-on-media` sale de la semántica de `--on-media-text` y
es **blanco en los dos temas** (el velo es oscuro en los dos), y en `forced-colors`
mapea a `Highlight` como el otro, porque en ese modo manda la paleta del sistema.

```tsx
// scanner: el bloque de outline de §8.3 pero con el token del medio
'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring-on-media)]'
```

**Estado actual, a tener en cuenta:** los cuatro indicadores del scanner
(`action-bar.tsx` —el shutter y el botón de estado—, `camera-controls.tsx` y
`camera-view.tsx`) **siguen usando `outline-on-media-text`**, que es el mismo blanco
con el mismo resultado visual. El token `--focus-ring-on-media` existe y está
correctamente valuado, pero **migrar esos cuatro call sites es un cambio de
componente, no de token**: se puede hacer en cualquier momento y no cambia ni un
pixel de lo que se ve. Lo que no se puede hacer es volver a `--focus-ring` ahí.

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
- **Foco visible obligatorio**: el bloque `outline` a color pleno de §8.3
  (`focus-visible:outline-2 focus-visible:outline-offset-2
  focus-visible:outline-[color:var(--focus-ring)]`, y con `focus:` en vez de
  `focus-visible:` en los controles de texto). Cero `focus:outline-none` sin
  alternativa. **Nunca** `ring-brand/20` ni ningún alfa del token de marca: medía
  **1.38:1** contra la superficie y la norma pide 3:1 (SC 1.4.11) — es el único
  mecanismo que tiene una persona que navega con teclado para ubicarse. Sobre foto
  va `--focus-ring-on-media` (§8.16), y el aire de `outline-offset` no puede quedar
  recortado por ningún `overflow` (§4.4).
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
| `focus:outline-none` sin el `outline` de §8.3 | WCAG 2.4.7, y el patrón viejo `ring-brand/20` daba 1.38:1 |
| `ring-brand/20`, o cualquier alfa del token de marca para el foco | 1.38:1 contra superficie. El foco va a color pleno (SC 1.4.11). Ver §8.3.1 |
| `focus-ring`/`border-control`/`switch-track-off` mapeados en `@theme inline` | Son tokens de **estado**, no de superficie: se consumen por `var()` (§1) |
| Sacar el `py-1` de un scroller con elementos enfocables | Es el aire del `outline`; sin eso el foco se recorta (§4.4) |
| Tocar el alto de `md` de un control | 44 px es §0.5, no una preferencia (ver §8.1, §8.3, §8.4) |
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
- [ ] Foco visible en todo elemento interactivo, verificado con Tab — y **visible**
      dentro de cualquier `overflow` que hayas tocado (`py-1` en los scrollers,
      `-outline-offset-2` si el ancestro recorta). Ver §4.4.
- [ ] Alturas de `md` en 44 si tocaste un control (§0.5), con la excepción
      justificada en un comentario si no llegaste.
- [ ] Probado a 390 px en **los dos temas** y con `prefers-reduced-motion: reduce`.
- [ ] Probado con `forced-colors: active` (DevTools → Rendering → Emulate CSS) si
      tocaste superficies, bordes o el indicador de foco. Ver §5.4.
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
`NetworkFirst`, imágenes `CacheFirst` 150, API pública
`NetworkFirst` 50, nunca cachea requests autenticadas, registro solo en producción),
la proporción `aspect-[63/88]` (63 × 88 mm reales, no una aproximación), el idioma
`lang="es-AR"`, y la política Server Component / Client Component.
