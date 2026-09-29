/**
 * Guard de contraste de los tokens de `app/globals.css`.
 *
 * No es un snapshot y no testea markup: parsea los dos bloques de token
 * (`:root` y `.dark`), calcula la razón de contraste WCAG 2.x de cada par que
 * importa, y falla nombrando el token, el tema, el par y los dos números.
 *
 * ## Por qué esto y no un chequeo de classes
 *
 * El modo de falla que esto previene es invisible: nadie va a notar que
 * `--text-tertiary` bajó a 3.28:1, y `--text-tertiary` se usa 88 veces, casi
 * siempre a 12 px. Un 12 px a 3.28:1 no se ve mal, **se lee mal**, y el síntoma
 * (una fila de metadata que no se entiende) se atribuye a la pantalla y no al
 * token. Lo mismo con `--focus-ring` a 1.38:1: el indicador de foco existe, está
 * donde corresponde, y simplemente no se ve contra una superficie clara.
 *
 * ElSnapshot no ayuda acá porque un snapshot de un hex registra el valor pero no
 * el umbral: bajarlo de `#6f6f7a` a `#8b8b95` cambia el snapshot y no rompe
 * nada. El umbral es lo que hay que defender, y un umbral no se puede escribir
 * como snapshot.
 *
 * ## La fórmula
 *
 * WCAG 2.x, fórmula de contraste relativo:
 *
 * ```
 * L = 0.2126·R + 0.7152·G + 0.0722·B        (canal lineal)
 * ratio = (L_claro + 0.05) / (L_oscuro + 0.05)
 * ```
 *
 * Los canales van linealizados primero con el piecewise de la spec
 * (`c/12.92` para `c <= 0.03928`, si no `((c + 0.055)/1.055)^2.4`). Saltarse esa
 * linealización da números de cabeza: para un gris medio como `#6f6f7a` la
 * diferencia es de más de un punto de ratio.
 *
 * ## Qué NO se chequea acá
 *
 * Los umbrales de 3:1 (`--border-control`, `--focus-ring`, `--switch-track-off`)
 * son de **SC 1.4.11, Non-text Contrast**, que aplica a los bordes de los
 * controles y a los indicadores de foco. Los de 4.5:1 son de **SC 1.4.3,
 * Contrast (Minimum)**, que aplica a texto normal, y 12 px es texto normal (el
 * umbral de "texto grande" son 18.66 px bold o 24 px).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const GLOBALS_CSS = fileURLToPath(new URL('../globals.css', import.meta.url));

/** SC 1.4.3: texto normal (12 px entra acá, no es "texto grande"). */
const MIN_TEXT = 4.5;
/** SC 1.4.11: borde de control, indicador de foco, estado de un control. */
const MIN_NON_TEXT = 3;

/** SC 1.4.11 exime a los componentes deshabilitados. `--text-disabled` queda fuera a propósito. */

/** Los dos bloques de token, parseados por separado. */
type ThemeName = 'light' | 'dark';

type Tokens = Record<string, string>;

const css = readFileSync(GLOBALS_CSS, 'utf8');

/**
 * Saca el cuerpo de un bloque `{ ... }` que empieza en `selector`.
 *
 * `selector` es una **regex anclada a principio de línea**, no un string. Hace
 * falta por dos motivos que no son Spike:
 *
 * 1. Hay que contar llaves y no usar un regex de bloque: los comentarios de
 *    `globals.css` traen llaves de ejemplo adentro, y un regex no jurídico las
 *    confunde.
 * 2. Anclar a línea es lo que separa el bloque de tokens de las **menciones** al
 *    selector. `@custom-variant dark (&:where(.dark, .dark *));` aparece en la
 *    línea 9, **antes** de `:root`: con un `indexOf('.dark')` se matcheaba esa
 *    línea y el parser terminaba devuelriendo los tokens de `:root` para los
 *    dos temas. Todos los tests de contraste pasaban igual —los valores claros
 *    cumplen en los dos temas—, o sea que era un verde mentiroso.
 */
function blockBody(selector: RegExp): string {
  const match = selector.exec(css);
  if (!match) throw new Error(`No se encontró el bloque ${selector} en globals.css.`);

  const open = css.indexOf('{', match.index);
  if (open === -1) throw new Error(`El bloque ${selector} no abre llave.`);

  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`El bloque ${selector} no cierra llave.`);
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Los tokens de un bloque: `--nombre: #hex;`.
 *
 * Solo se aceptan hex de 3 o 6 dígitos. `rgb(255 74 79 / 0.14)` y compañía se
 * ignoran a propósito: son colores con alfa, y el ratio WCAG de un color
 * translúcido depende del fondo compuesto, que acá no se puede resolver sin
 * implementar composición. Los pares que importan para contraste de texto y de
 * borde son todos opacos, así que el filtro no dejaholes por cubrir.
 */
function parseTokens(selector: RegExp): Tokens {
  const body = stripComments(blockBody(selector));
  const tokens: Tokens = {};

  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    const [, name, value] = match;
    if (name && value) tokens[name] = value;
  }

  return tokens;
}

/**
 * Los dos bloques de token, parseados **por separado**.
 *
 * Los selectores van anclados a principio de línea: `.dark` aparece también en
 * `@custom-variant dark (&:where(.dark, .dark *))`, que está antes de `:root`.
 */
const THEMES: Record<ThemeName, Tokens> = {
  light: parseTokens(/^:root\s*\{/m),
  dark: parseTokens(/^\.dark\s*\{/m),
};

function themeLabel(theme: ThemeName): string {
  return theme === 'light' ? ':root (claro)' : '.dark (oscuro)';
}

function require_(theme: ThemeName, token: string): string {
  const value = THEMES[theme][token];
  if (value === undefined) {
    throw new Error(
      `El token \`${token}\` no existe en \`${themeLabel(theme)}\`. ` +
        'Si se renombró, actualizá la lista de este test: es exactamente el momento en que hay que decidir de nuevo si el par sigue siendo un par que importe.',
    );
  }
  return value;
}

/** `#abc` → `[170, 187, 204]`. */
function toRgb(hex: string): [number, number, number] {
  let normalized = hex.slice(1);
  if (normalized.length === 3 || normalized.length === 4) {
    normalized = normalized
      .slice(0, 3)
      .split('')
      .map((char) => char + char)
      .join('');
  }
  if (normalized.length < 6) {
    throw new Error(`\`${hex}\` no es un hex de 3 o 6 dígitos.`);
  }
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

/** El piecewise de la spec, no `c/255` directo. */
function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** Razón de contraste WCAG, simétrica y >= 1. */
export function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

interface Pair {
  /** Texto, o el token cuyo color se está midiendo. */
  fg: string;
  /** Superficie contra la que se lee. */
  bg: string;
  /** Mínimo de la WCAG para este par. */
  min: number;
  /** Por qué importa. Aparece en el mensaje de fallo. */
  why: string;
  /**
   * El par se sabe por debajo del umbral, en un tema concreto, y es un bug
   * abierto.
   *
   * Un par así se asserta con `it.fails` **solo en el tema que falla**: la suite
   * sigue verde, el par no se pierde de vista, y el día que alguien lo arregle el
   * test se pone rojo solo diciendo que hay que sacarle el `.fails`. Es lo
   * contrario de un "expected failure" silencioso, que es donde viven los bugs
   * que nadie vuelve a mirar.
   *
   * Va por tema y no por par porque el defecto es de un solo tema: si se
   * declarara a nivel de par, el `it.fails` de `:root` fallaría porque `:root`
   * **sí** cumple, que es el mismo problema de medir dos veces lo mismo.
   */
  knownDefectIn?: Partial<Record<ThemeName, string>>;
}

/**
 * Las superficies contra las que se mide todo texto.
 *
 * Los tres niveles de §2.1, y no menos: un token que llega en `--surface` y no
 * en `--surface-2` es legible en una card e ilegible adentro de un control, que
 * es el caso del bug que este test hunté (`--text-tertiary` en dark).
 */
const SURFACES = ['--canvas', '--surface', '--surface-2'] as const;

/** Los tokens de texto que tienen que medirse contra las tres superficies. */
const TEXT_TOKENS = ['--text-primary', '--text-secondary', '--text-tertiary'] as const;

/**
 * Los pares, en una tabla.
 *
 * Se assertan **por token y por tema**, y no con un `for` que se le escape a
 * quien lo lea: el nombre del par tiene que estar en el mensaje de fallo para
 * que quien lo vea sepa qué abrir. Por eso el nombre del `it` se arma con
 * `pairTitle`, y no con un índice.
 */
const PAIRS: readonly Pair[] = [
  /*
   * `--text-tertiary` es el token que más se usa y el que más se rompió. Se usa
   * 88 veces, casi siempre a 12 px, y el valor viejo daba 3.28:1 contra el
   * canvas. Un 12 px a 3.28:1 no se ve mal: se lee mal, y el síntoma se
   * atribuye a la pantalla.
   *
   * `--surface-3` queda **afuera** a propósito, y no por convenience: en claro
   * mide 4.29:1 y en dark 3.94:1, o sea que no llega. Está anotado en el propio
   * `globals.css`, y la regla que de ahí sale es que `text-tertiary` no se use
   * para el único texto de una fila sobre un hover.
   */
  { fg: '--text-tertiary', bg: '--canvas', min: MIN_TEXT, why: 'metadata a 12 px sobre el fondo de la app' },
  { fg: '--text-tertiary', bg: '--surface', min: MIN_TEXT, why: 'metadata a 12 px sobre una card' },
  {
    fg: '--text-tertiary',
    bg: '--surface-2',
    min: MIN_TEXT,
    why: 'metadata a 12 px sobre un control o una fila',
    /**
     * Este par ya tuvo un bug abierto y por eso sigue en la suite.
     *
     * `Select` pinta su trigger con `bg-surface-2` y el placeholder del trigger
     * con `text-tertiary`, así que **un `Select` sin valor elegido, en dark,
     * mostraba el texto que dice qué elegir por debajo de AA**. No era teórico:
     * hay 8 selects en la app y el de set tiene 176 opciones, así que ese es el
     * primer estado que ve cualquiera que abra un filtro.
     *
     * El arreglo fue subir `.dark --text-tertiary` de `#82828c` (4.40:1) a
     * `#8a8a95` (4.91:1). La alternativa que se evaluó y se descartó era cambiar
     * el placeholder del `Select` a `--text-secondary`: funcionaba, pero dejaba
     * al token en 4.40:1 y el problema iba a reaparecer en el próximo texto de
     * 12 px que se pinte sobre una superficie de control.
     *
     * Queda acá como par común, sin `knownDefectIn`: si alguien vuelve a
     * oscurecer `--text-tertiary` sin revisar `--surface-2`, este test se pone
     * rojo solo.
     */
  },
  { fg: '--text-secondary', bg: '--canvas', min: MIN_TEXT, why: 'texto de apoyo sobre el fondo de la app' },
  { fg: '--text-secondary', bg: '--surface', min: MIN_TEXT, why: 'texto de apoyo sobre una card' },
  { fg: '--text-secondary', bg: '--surface-2', min: MIN_TEXT, why: 'texto de apoyo dentro de un control' },
  { fg: '--text-primary', bg: '--canvas', min: MIN_TEXT, why: 'cuerpo de texto sobre el fondo de la app' },
  { fg: '--text-primary', bg: '--surface', min: MIN_TEXT, why: 'cuerpo de texto sobre una card' },
  { fg: '--text-primary', bg: '--surface-2', min: MIN_TEXT, why: 'cuerpo de texto dentro de un control' },

  /*
   * El anillo de foco es lo único que le dice a una persona que navega con
   * teclado dónde está. El viejo era `ring-brand/20` y medía 1.38:1: un 20% de
   * alfa no llega ni de cerca. Y como `ring` es un `box-shadow`, el UA lo fuerza
   * a `none` en high contrast, justo donde más se lo necesita. Por eso los
   * componentes usan `outline`, y por eso esto se mide.
   */
  { fg: '--focus-ring', bg: '--canvas', min: MIN_NON_TEXT, why: 'el indicador de foco tiene que verse sobre el fondo de la app' },
  { fg: '--focus-ring', bg: '--surface', min: MIN_NON_TEXT, why: 'el indicador de foco tiene que verse sobre una card' },
  { fg: '--focus-ring', bg: '--surface-2', min: MIN_NON_TEXT, why: 'el indicador de foco tiene que verse sobre un input' },

  /*
   * `--border-control` es el borde de los controles de formulario, y solo de
   * ellos: `--border-default` se queda porque además dibuja separadores
   * decorativos, exentos de SC 1.4.11. Este se acaba de corregir: el valor
   * anterior daba 2.22:1, o sea que un input con el borde por debajo del
   * mínimo seguía siendo indistinguible de texto suelto. Con `3:1` el input se
   * lee como control.
   */
  { fg: '--border-control', bg: '--surface-2', min: MIN_NON_TEXT, why: 'sin esto el input no se distingue de texto suelto' },
  { fg: '--border-control', bg: '--surface', min: MIN_NON_TEXT, why: 'el borde del control sobre una card' },

  /*
   * El riel de un `Switch` apagado. El knob va en `--surface` y el par que hay
   * que leer es **riel contra knob**: sin ese par no se sabe si el switch está
   * encendido. El valor viejo se leía en 1.16:1 —se veía el switch, pero no en
   * qué posición estaba—.
   */
  { fg: '--switch-track-off', bg: '--surface', min: MIN_NON_TEXT, why: 'sin este par no se lee en qué posición está el switch apagado' },
];

/** Token al que se le pone la lista de pares en el nombre del test. */
function pairTitle(pair: Pair): string {
  return `${pair.fg} sobre ${pair.bg} (mín ${pair.min}:1)`;
}

/** Los tokens que algún par de la tabla mide. */
function measuredTokens(): string[] {
  return [...new Set(PAIRS.flatMap((pair) => [pair.fg, pair.bg]))];
}

/**
 * El mensaje de fallo.
 *
 * Tiene que nombrar las cinco cosas: el token, el tema, el par, los dos valores
 * medidos y por qué importa. Un "expected 4.40 to be greater than or equal to
 * 4.5" pelado obliga a ir a buscar qué token era, y para entonces el que lo
 * rompió ya se fue.
 */
function failureMessage(pair: Pair, theme: ThemeName, fg: string, bg: string, measured: number): string {
  const sc = pair.min === MIN_TEXT ? '1.4.3' : '1.4.11';
  const knownDefect = pair.knownDefectIn?.[theme];
  return [
    `Contraste insuficiente en ${themeLabel(theme)}.`,
    ``,
    `  token:      ${pair.fg} = ${fg}`,
    `  superficie: ${pair.bg} = ${bg}`,
    `  medido:     ${measured.toFixed(2)}:1`,
    `  requerido:  ${pair.min}:1 (SC ${sc})`,
    `  por qué:    ${pair.why}`,
    ...(knownDefect ? [``, `  BUG ABIERTO: ${knownDefect}.`] : []),
    ``,
    ...(pair.min === MIN_TEXT
      ? [
          'Si el valor nuevo es el correcto, subí el token y actualizá el',
          'comentario de arriba de la definición. Si el que está mal es el de la',
          'superficie, el arreglo impacta visualmente a toda la app: pensalo',
          'antes de tocarlo.',
        ]
      : [
          'SC 1.4.11 es Non-text Contrast. El valor viejo de este token ya pasó',
          'por debajo del umbral y pasó inadvertido, porque el defecto no se ve:',
          'se ve igual, solo que sin función.',
        ]),
  ].join('\n');
}

describe('globals.css: contraste de los tokens de texto', () => {
  for (const pair of PAIRS) {
    if (pair.min !== MIN_TEXT) continue;

    for (const theme of ['light', 'dark'] as const) {
      const body = () => {
        const fg = require_(theme, pair.fg);
        const bg = require_(theme, pair.bg);
        const measured = contrast(fg, bg);

        expect(measured, failureMessage(pair, theme, fg, bg, measured)).toBeGreaterThanOrEqual(
          pair.min,
        );
      };

      const title = `${themeLabel(theme)} — ${pairTitle(pair)}`;

      /*
       * Un par con `knownDefectIn[theme]` va con `it.fails`: la suite queda
       * verde, el par no se pierde de vista, y el día que alguien lo arregle el
       * test se pone rojo solo diciendo que hay que sacarle el `.fails`. Es lo
       * contrario de un "expected failure" silencioso, que es donde viven los
       * bugs que nadie vuelve a mirar.
       */
      if (pair.knownDefectIn?.[theme]) {
        it.fails(title, body);
      } else {
        it(title, body);
      }
    }
  }
});

describe('globals.css: contraste de los tokens sin texto', () => {
  for (const pair of PAIRS) {
    if (pair.min !== MIN_NON_TEXT) continue;

    for (const theme of ['light', 'dark'] as const) {
      it(`${themeLabel(theme)} — ${pairTitle(pair)}`, () => {
        const fg = require_(theme, pair.fg);
        const bg = require_(theme, pair.bg);
        const measured = contrast(fg, bg);

        expect(measured, failureMessage(pair, theme, fg, bg, measured)).toBeGreaterThanOrEqual(
          pair.min,
        );
      });
    }
  }
});

describe('globals.css: el parser', () => {
  it('lee los dos bloques y no los confunde', () => {
    // Si el parser se rompiera, todos los tests de arriba pasarían con los
    // valores del tema equivocado, que es peor que no medir. Ya pasó una vez
    // durante la escritura de este archivo: `.dark` matcheaba la línea del
    // `@custom-variant`, y los 30 tests de contraste daba verde con los
    // valores claros para los dos temas.
    expect(Object.keys(THEMES.light).length).toBeGreaterThan(20);
    expect(Object.keys(THEMES.dark).length).toBeGreaterThan(20);
    expect(THEMES.light['--canvas']).toBe('#f4f4f6');
    expect(THEMES.dark['--canvas']).toBe('#0b0b0f');
  });

  it('cada token medido tiene un valor por tema, y ninguno se cuelga', () => {
    // Un token que existe en `:root` y no en `.dark` es un hole silencioso: el
    // test de dark mediría el valor de `:root` con el nombre del token de dark.
    // Por eso `require_` tira con el nombre del token en vez de devolver
    // `undefined` y medir NaN, que comparado con `>= 4.5` es `false` y el
    // mensaje de fallo no dice nada útil.
    for (const token of measuredTokens()) {
      expect(THEMES.light[token], `falta ${token} en :root`).toMatch(/^#[0-9a-fA-F]{3,6}$/);
      expect(THEMES.dark[token], `falta ${token} en .dark`).toMatch(/^#[0-9a-fA-F]{3,6}$/);
    }
  });

  it('los dos temas definen los mismos tokens de texto y de borde', () => {
    // El subconjunto que importa para contraste, no todos: `.dark` define
    // `--brand-soft` como `rgb(...)` y el parser solo toma hex, así que comparar
    // el set completo daría un falso positivo.
    const opaquePrefixes = ['--text-', '--border-', '--surface-', '--focus-', '--switch-'];
    const inScope = (tokens: Tokens) =>
      Object.keys(tokens)
        .filter((name) => opaquePrefixes.some((prefix) => name.startsWith(prefix)))
        .sort();

    // `--canvas` y `--surface` family están en los dos; si `.dark` dejara de
    // definir uno, el test de dark de ese par empezaría a medir el de `:root`.
    expect(inScope(THEMES.dark)).toEqual(inScope(THEMES.light));
  });

  it('la tabla cubre los 9 pares de texto × los 3 temas × las 2 superficies', () => {
    // Una tabla de pares escrita a mano se le puede borrar una fila sin que
    // nadie se entere, y la suite sigue verde con un hole. Este test cuenta.
    const textPairs = PAIRS.filter((pair) => pair.min === MIN_TEXT);
    const expected = TEXT_TOKENS.length * SURFACES.length;

    expect(textPairs).toHaveLength(expected);
    for (const token of TEXT_TOKENS) {
      for (const surface of SURFACES) {
        const found = textPairs.some((pair) => pair.fg === token && pair.bg === surface);
        expect(found, `falta el par ${token} sobre ${surface} en la tabla`).toBe(true);
      }
    }
  });

  it('los tokens sin texto también están todos', () => {
    // SC 1.4.11: el borde del control, el anillo de foco y el riel del switch.
    // Los tres son la diferencia entre "se ve" y "se ve y además funciona".
    const nonTextPairs = PAIRS.filter((pair) => pair.min === MIN_NON_TEXT);
    const required = ['--focus-ring', '--border-control', '--switch-track-off'];

    for (const token of required) {
      expect(
        nonTextPairs.some((pair) => pair.fg === token),
        `falta ${token} en los pares de SC 1.4.11`,
      ).toBe(true);
    }
  });

  it('los tokens con alfa no entran al cálculo, y hay una lista explícita de eso', () => {
    // El ratio de un color translúcido depende del fondo compuesto, que este
    // test no resuelve. Los pares que importan son opacos, pero el filtro tiene
    // que ser consciente: si mañana alguien define `--text-tertiary` como
    // `rgb(0 0 0 / 0.6)`, el token desaparece del mapa y el `require_` lo
    // señala por nombre en vez de devolver `undefined` y medir NaN.
    const translucent = Object.entries(THEMES.light).filter(([, value]) =>
      /^#[\da-f]{8}$/i.test(value),
    );
    // Ninguno de los tokens que este test mide usa alfa de 8 dígitos hoy. Si
    // aparece uno, el par tiene que pasar a medirse compuesto.
    for (const [name] of translucent) {
      expect(measuredTokens()).not.toContain(name);
    }
  });

  it('el parser no se come los comentarios', () => {
    // Los comentarios de `globals.css` tienen hex y ratios de ejemplo adentro.
    // Un parser ingenuo los contaría como tokens.
    const comments = stripComments(css);
    expect(comments).not.toContain('1.38:1');
    expect(comments).not.toContain('3.28:1');
  });

  it('la razón de contraste es simétrica y da 21:1 en blanco sobre negro', () => {
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    // Un color contra sí mismo es 1:1, no 0 ni una división por cero.
    expect(contrast('#6f6f7a', '#6f6f7a')).toBeCloseTo(1, 10);
  });

  it('acepta hex de 3 dígitos', () => {
    // `#fff` y `#ffffff` son el mismo color; si el parser solo aceptara uno de
    // los dos, un token escrito corto haría fallar el test por una razón que no
    // es de contraste.
    expect(contrast('#fff', '#000')).toBeCloseTo(21, 5);
  });
});
