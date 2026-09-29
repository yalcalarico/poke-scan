/**
 * La señal de rareza del `CardTile` (P6.6).
 *
 * ## El problema que resuelve
 *
 * `CardDto.rarity` ya se usaba para el `alt` de la imagen y para el filtro, pero
 * **no se veía**: una grilla de 24 cartas es una pared de imágenes indistinguibles
 * hasta que leés el nombre de cada una. Y el nombre no es el dato que uno busca
 * cuando mira un binder: el dato es *cuál de estas es la que vale*.
 *
 * ## Por qué tres niveles y no doce colores
 *
 * El `rarity` de la fuente trae doce valores distintos (`RARITY_OPTIONS` en
 * `rarity-filter.tsx:17`). Ponerle un color a cada uno sería el arcoíris que
 * §0.2 prohíbe: en una grilla densa, doce matices contiguos no se leen, se
 * ensucian, y la rareza —que es un dato de la carta— pasa a ser el dueño de la
 * pantalla.
 *
 * Lo que el ojo necesita no es identificar la rareza exacta sino **separar las
 * que se buscan de las que no**. Con dos acentos se resuelve, y coincide con el
 * orden de valor que ya maneja la fuente:
 *
 * | nivel    | rarezas                                                          |
 * |----------|-----------------------------------------------------------------|
 * | `base`   | Common, Uncommon, Trainer, Energy, Promo                         |
 * | `rare`   | Rare, Rare Holo, Amazing Rare, Shiny Rare                         |
 * | `chase`  | Ultra Rare, Secret Rare, Special Illustration Rare               |
 *
 * `base` **no dibuja nada**. La ausencia de la franja es la señal: la gran
 * mayoría de una colección real es `base`, y ponerle un acento a cada carta
 * común sería pintar el 80 % de la pantalla para no decir nada.
 *
 * ## ─── Los tokens: provisionales, y hay que promoverlos ───
 *
 * Los dos acentos usan `--info` (azul) y `--warning` (ámbar) **prestados**.
 * El ámbar es el color real de una carta de pursuit en el TCG, así que la
 * lectura es correcta aunque el token no haya nacido para esto; el azul es el
 * escalón intermedio.
 *
 * Falta lo correcto: `--rarity-rare` y `--rarity-chase` en `app/globals.css`, con
 * su entrada en `@theme inline` para los dos temas. `card-tile.tsx` **no** puede
 * escribir ese archivo, así que elapaleta vive acá y el consumidor la recibe como
 * `className` (la misma forma que usa `rarity-filter` con las cadenas crudas).
 *
 * El día que se promovan los tokens, el cambio es de este archivo y de ningún
 * otro: se reemplazan las dos clases de `TIER_ACCENT`/`TIER_TEXT` por
 * `bg-[color:var(--rarity-rare)]` / `text-[color:var(--rarity-rare)]`. Nada de
 * `CardGrid`, `CardTile` ni de las pantallas.
 *
 * ## Consistencia con `rarity-filter.tsx`
 *
 * Esto **no** filtra, así que no comparte contrato con `rarity-filter.tsx`: allá
 * el valor viaja crudo al backend como igualdad contra la columna
 * (`backend/docs/api.md`), y la ficha lo muestra tal cual
 * (`DataRow label="Rareza"` en `carta/[id]`). Acá el valor se normaliza
 * (minúsculas, sin espacios, guiones ni guiones bajos) **solo para decidir el
 * nivel**, y eso es deliberado: la columna mezcla dos vocabularios de dos
 * fuentes y un filtro tiene que ser literal, un acento no.
 *
 * Una rareza que no matchee ningún patrón —una carta de un set nuevo, un valor
 * que la fuente agrega— cae en `base` y no dibuja. Es el default correcto: es el
 * nivel más bajo, y una función que tirara ante una rareza desconocida rompería
 * la pantalla entera por un dato nuevo.
 */

export type RarityTier = 'base' | 'rare' | 'chase';

/**
 * Los tres niveles, decididos por **patrón** y no por una lista cerrada.
 *
 * La primera versión de esto era un `Record` con las 12 rarezas de
 * `RARITY_OPTIONS`, y verificarla contra la base de datos mostró que el
 * catálogo tiene **41** valores distintos. Peor: la columna mezcla dos
 * vocabularios, porque el espejo viene de dos fuentes —
 *
 *   - pokemontcg.io, con espacios: `Rare Holo`, `Special Illustration Rare`
 *   - scrydex, en camelCase:     `RareHolo`, `RareUltra`, `HyperRare`,
 *                                `RadiantRare`, `ShinyUltraRare`, `ACESPECRare`
 *
 * Un `Record` por igualdad only resolvía los del primer vocabulario, así que
 * `RareHolo` (1621 cartas), `RareUltra` (799), `IllustrationRare` (511),
 * `HyperRare` y compañía caían todas en `base` y no dibujaban nada: dos tercios
 * de las cartas rares de la base no tenían acento, y la grilla seguía siendo
 * una pared de imágenes indistinguibles.
 *
 * Por eso la clave es una **forma normalizada** (minúsculas, sin espacios, sin
 * guiones bajos ni guiones) y el nivel sale de si la rareza *menciona* algo.
 * Las dos fuentes caen en el mismo lado sin mantener dos listas, y una rareza
 * nueva que aparezca mañana (`MegaHyperRare`, `RadiantRare`) ya sale bien sin
 * tocar nada.
 */
function rarityTier(raw: string): RarityTier {
  const key = raw.trim().toLowerCase().replace(/[\s_-]+/g, '');

  if (!key) return 'base';

  /*
   * El orden importa: se busca primero lo *más raro*. `shinyultrarare` contiene
   * "ultra" y "rare", y tiene que ser `chase` y no `rare`; `radiantrare` no
   * tiene nada de `ultra` ni `secret` pero sí es una rareza de vitrine.
   */
  if (/ultra|secret|hyper|radiant|illustration/.test(key)) return 'chase';
  if (/rare|holo|amazing|shiny/.test(key)) return 'rare';

  return 'base';
}

/**
 * La franja de acento que va **adentro** del contenedor de la imagen.
 *
 * `base` es cadena vacía y no una clase neutra a propósito: el consumidor decide
 * si la pinta con `accent.bar` o no, y no pintar es más barato (y más silencioso)
 * que pintar un gris.
 */
const TIER_ACCENT: Record<RarityTier, string> = {
  base: '',
  rare: 'bg-info',
  chase: 'bg-warning',
};

/** El color del texto de la rareza, para el modo `catalog`. */
const TIER_TEXT: Record<RarityTier, string> = {
  base: 'text-tertiary',
  rare: 'text-info',
  chase: 'text-warning',
};

export interface RarityAccent {
  tier: RarityTier;
  /** Clase de la franja de color. `''` si la rareza no lleva acento. */
  bar: string;
  /** Clase del texto de la rareza. */
  text: string;
}

/**
 * Resuelve la rareza cruda a su nivel y a sus dos clases.
 *
 * `null`, `undefined` y `''` son `base`: `CardDto.rarity` es `string | null` y
 * hay cartas del catálogo sin el dato. Una carta sin rareza no es una carta
 * rara, así que no se inventa un nivel para ella.
 */
export function rarityAccent(rarity: string | null | undefined): RarityAccent {
  const tier = rarity ? rarityTier(rarity) : 'base';
  return { tier, bar: TIER_ACCENT[tier], text: TIER_TEXT[tier] };
}
