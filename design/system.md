# Sistema visual de PokéScan

Captura del sistema existente; no es una propuesta de reemplazo. Fuente de valores: `frontend/app/globals.css`. El CSS vigente prevalece sobre tablas históricas de documentación.

## Colores

39 tokens semánticos, con 39 valores de tema oscuro.

| Token | Claro | Oscuro | Uso | Fuente |
|---|---|---|---|---|
| `--canvas` | `#f4f4f6` | `#0b0b0f` | Superficie | `frontend/app/globals.css` |
| `--surface` | `#ffffff` | `#15151b` | Superficie | `frontend/app/globals.css` |
| `--surface-2` | `#f8f8fa` | `#1d1d24` | Superficie | `frontend/app/globals.css` |
| `--surface-3` | `#eeeef2` | `#26262f` | Superficie | `frontend/app/globals.css` |
| `--overlay` | `rgb(11 11 15 / 0.55)` | `rgb(0 0 0 / 0.7)` | Superficie | `frontend/app/globals.css` |
| `--text-primary` | `#0b0b0f` | `#f5f5f7` | Texto | `frontend/app/globals.css` |
| `--text-secondary` | `#5c5c68` | `#a1a1ae` | Texto | `frontend/app/globals.css` |
| `--text-tertiary` | `#6f6f7a` | `#8a8a95` | Texto | `frontend/app/globals.css` |
| `--text-disabled` | `#b4b4bd` | `#4a4a54` | Texto | `frontend/app/globals.css` |
| `--text-inverse` | `#ffffff` | `#0b0b0f` | Texto | `frontend/app/globals.css` |
| `--border-subtle` | `#eeeef2` | `#1d1d24` | Borde o control | `frontend/app/globals.css` |
| `--border-default` | `#e4e4e9` | `#2a2a33` | Borde o control | `frontend/app/globals.css` |
| `--border-strong` | `#d0d0d8` | `#3c3c48` | Borde o control | `frontend/app/globals.css` |
| `--border-control` | `#8a8a96` | `#6a6a76` | Borde o control | `frontend/app/globals.css` |
| `--focus-ring` | `#e01f26` | `#ff4a4f` | Borde o control | `frontend/app/globals.css` |
| `--focus-ring-on-media` | `#ffffff` | `#ffffff` | Borde o control | `frontend/app/globals.css` |
| `--switch-track-off` | `#8e8e9a` | `#6a6a76` | Borde o control | `frontend/app/globals.css` |
| `--brand` | `#d81c23` | `#ff4a4f` | Acento de marca | `frontend/app/globals.css` |
| `--brand-hover` | `#c2161c` | `#ff6a6e` | Acento de marca | `frontend/app/globals.css` |
| `--brand-press` | `#9e1217` | `#e01f26` | Acento de marca | `frontend/app/globals.css` |
| `--brand-soft` | `#fff0f0` | `rgb(255 74 79 / 0.14)` | Acento de marca | `frontend/app/globals.css` |
| `--brand-border` | `#ffc9c9` | `rgb(255 74 79 / 0.32)` | Borde o control | `frontend/app/globals.css` |
| `--on-brand` | `#ffffff` | `#1a0506` | Acento de marca | `frontend/app/globals.css` |
| `--positive` | `#117a47` | `#34d399` | Estado semántico o medio | `frontend/app/globals.css` |
| `--positive-soft` | `#e7f6ee` | `rgb(52 211 153 / 0.14)` | Estado semántico o medio | `frontend/app/globals.css` |
| `--positive-border` | `#b7e3cb` | `rgb(52 211 153 / 0.3)` | Borde o control | `frontend/app/globals.css` |
| `--negative` | `#d01a21` | `#ff6a6e` | Estado semántico o medio | `frontend/app/globals.css` |
| `--negative-soft` | `#fdeeee` | `rgb(255 106 110 / 0.14)` | Estado semántico o medio | `frontend/app/globals.css` |
| `--negative-border` | `#f5c2c2` | `rgb(255 106 110 / 0.3)` | Borde o control | `frontend/app/globals.css` |
| `--warning` | `#b45309` | `#fbbf24` | Estado semántico o medio | `frontend/app/globals.css` |
| `--warning-soft` | `#fdf4e3` | `rgb(251 191 36 / 0.14)` | Estado semántico o medio | `frontend/app/globals.css` |
| `--warning-border` | `#f0d9ae` | `rgb(251 191 36 / 0.3)` | Borde o control | `frontend/app/globals.css` |
| `--info` | `#1d4ed8` | `#7ba1ff` | Estado semántico o medio | `frontend/app/globals.css` |
| `--info-soft` | `#eef2fe` | `rgb(123 161 255 / 0.14)` | Estado semántico o medio | `frontend/app/globals.css` |
| `--info-border` | `#c9d5fa` | `rgb(123 161 255 / 0.3)` | Borde o control | `frontend/app/globals.css` |
| `--on-media` | `rgb(11 11 15 / 0.72)` | `rgb(0 0 0 / 0.66)` | Estado semántico o medio | `frontend/app/globals.css` |
| `--on-media-text` | `#ffffff` | `#ffffff` | Texto | `frontend/app/globals.css` |
| `--shimmer-from` | `#dcdce4` | `#23232b` | Estado semántico o medio | `frontend/app/globals.css` |
| `--shimmer-to` | `#f2f2f5` | `#2b2b35` | Estado semántico o medio | `frontend/app/globals.css` |

## Tipografía

La app declara Geist y Geist Mono en `frontend/app/layout.tsx`, expuestos por `frontend/app/globals.css`. Los artboards usan exclusivamente el fallback permitido `system-ui, sans-serif` y `ui-monospace, monospace`; no descargan Geist ni otras fuentes.

| Escala | Reglas | Fuente |
|---|---|---|
| `display-lg` | `font-size: 40px; line-height: 42px; font-weight: 800; letter-spacing: -0.03em;` | `frontend/app/globals.css` |
| `display` | `font-size: 32px; line-height: 34px; font-weight: 800; letter-spacing: -0.025em;` | `frontend/app/globals.css` |
| `h1` | `font-size: 26px; line-height: 30px; font-weight: 700; letter-spacing: -0.02em;` | `frontend/app/globals.css` |
| `h2` | `font-size: 20px; line-height: 26px; font-weight: 700; letter-spacing: -0.015em;` | `frontend/app/globals.css` |
| `h3` | `font-size: 17px; line-height: 22px; font-weight: 600; letter-spacing: -0.01em;` | `frontend/app/globals.css` |
| `body` | `font-size: 15px; line-height: 22px; font-weight: 400;` | `frontend/app/globals.css` |
| `body-strong` | `font-size: 15px; line-height: 22px; font-weight: 600;` | `frontend/app/globals.css` |
| `label` | `font-size: 13px; line-height: 18px; font-weight: 500;` | `frontend/app/globals.css` |
| `caption` | `font-size: 12px; line-height: 16px; font-weight: 400;` | `frontend/app/globals.css` |
| `overline` | `font-size: 11px; line-height: 14px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;` | `frontend/app/globals.css` |

## Espaciado

Escala de 4 px. Ocho medidas de composición observadas: 4, 8, 12, 16, 20, 24, 32 y 40 px. Padding de pantalla: 16 / 24 px; superficies: 16 / 20 px; gap entre bloques: 24 / 32 px. Fuente: `frontend/docs/design-system.md`, §4.1; `frontend/components/ui/surface.tsx`; `frontend/components/ui/button.tsx`. No se presentan como variables CSS existentes.

## Radios y sombras

| Token | Valor | Fuente |
|---|---|---|
| `--radius-control` | `12px` | `frontend/app/globals.css` |
| `--radius-surface` | `16px` | `frontend/app/globals.css` |
| `--radius-panel` | `20px` | `frontend/app/globals.css` |
| `--radius-sheet` | `28px` | `frontend/app/globals.css` |
| `--shadow-xs` | `0 1px 2px rgb(11 11 15 / 0.05)` | `frontend/app/globals.css` |
| `--shadow-sm` | `0 1px 3px rgb(11 11 15 / 0.07), 0 1px 2px -1px rgb(11 11 15 / 0.05)` | `frontend/app/globals.css` |
| `--shadow-md` | `0 4px 12px -2px rgb(11 11 15 / 0.09), 0 2px 4px -2px rgb(11 11 15 / 0.05)` | `frontend/app/globals.css` |
| `--shadow-lg` | `0 14px 32px -10px rgb(11 11 15 / 0.16), 0 4px 10px -4px rgb(11 11 15 / 0.06)` | `frontend/app/globals.css` |
| `--shadow-xl` | `0 28px 60px -20px rgb(11 11 15 / 0.22)` | `frontend/app/globals.css` |

## Componentes y composición

- Button: primario marca/on-brand; secundario surface/text-primary. Alto estándar 44 px, grande 48 px, radio control. Fuente: `frontend/components/ui/button.tsx`.
- Surface: surface, borde default, radio surface, sombra sm, padding 16 px o 20 px. Fuente: `frontend/components/ui/surface.tsx`.
- Chip: activo text-primary/text-inverse, inactivo surface/text-secondary; 44 px interactivo. Fuente: `frontend/components/ui/chip.tsx`.
- Foco: outline 2 px, offset 2 px, focus-ring; sobre medios focus-ring-on-media. Fuente: `frontend/app/globals.css` y `frontend/components/ui/button.tsx`.
- Carta: proporción 63/88; búsqueda con 2 columnas mobile. Fuente: `frontend/docs/design-system.md`, §7 y §14.
- Navegación: cinco destinos, inferior hasta lg y superior desde 1024 px. Fuente: `frontend/components/layout/bottom-nav.tsx`.
- Una sola acción primaria por pantalla. Dinero en positive; ausencia de precio con texto, nunca cero. Fuente: `frontend/docs/design-system.md`.
- Movimiento: 100, 160, 240 y 400 ms, con reduced-motion. Fuente: `frontend/app/globals.css`.
- Todos los controles del prototipo tienen 44 px mínimos; no se usan chips de contenido como botones pequeños.

## Límites de la captura

No se modificó código de producto. El logo raster existente usa colores propios: los artboards lo sustituyen por un monograma tipográfico para no introducir colores fuera de tokens. Las ilustraciones editoriales SVG no son imágenes de cartas ni evidencia de reconocimiento. No se inventan cotizaciones, observaciones históricas, usuarios ni permisos. Deseadas, objetivos y modo encuentro se rotulan como propuestas, no como funciones disponibles.

## Autochequeo de artboards

Colores de UI e ilustración: sólo var() de la tabla anterior; sin colores crudos nuevos. Fuentes: system-ui/sans-serif y ui-monospace/monospace. No usar text-tertiary sobre surface-3 ni positive sobre positive-soft en texto pequeño; conservar text-secondary para cuerpo sobre superficies suaves. Sin recursos externos. Verificar 390, 768 y 1440 px, ambos temas, teclado y movimiento reducido. Los prototipos no persisten datos ni abren cámara.
