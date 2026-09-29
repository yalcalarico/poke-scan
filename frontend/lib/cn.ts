import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * `tailwind-merge` no conoce las utilidades tipográficas propias del design
 * system (`@utility text-display`, `text-h1`, `text-body`…), así que las mete
 * en el grupo genérico de `font-size` junto con los colores de texto. El
 * resultado es que `cn('text-label', 'text-positive')` se come el tamaño y
 * devuelve solo `text-positive`: el `text-positive` gana porque aparece
 * después, y el texto queda en 16 px en vez de 13 px.
 *
 * La culpa no es de `tailwind-merge` sino del namespace: `text-*` es ambiguo
 * por diseño de Tailwind. La salida es registrar la escala como su propio
 * grupo con un id propio, y declararlo en el genérico de
 * `extendTailwindMerge` para que los tipos lo sepan.
 */
const FONT_SIZE_GROUP = 'pokescan-font-size';

/** Los 9 pasos de `design-system.md` §3.1. Ninguno más existe. */
const FONT_SIZE_CLASSES = [
  'text-display-lg',
  'text-display',
  'text-h1',
  'text-h2',
  'text-h3',
  'text-body',
  'text-body-strong',
  'text-label',
  'text-caption',
  'text-overline',
] as const;

const twMerge = extendTailwindMerge<typeof FONT_SIZE_GROUP>({
  extend: {
    classGroups: {
      [FONT_SIZE_GROUP]: FONT_SIZE_CLASSES,
    },
    conflictingClassGroups: {
      // La escala pisa a cualquier tamaño de la paleta default, incluido un
      // `text-[13px]` arbitrario. Sin esto las dos declaraciones de
      // `font-size` conviven y gana la última por orden de fuente, no por
      // intención. Hacen falta las dos direcciones porque
      // `conflictingClassGroups` solo declara que la clave pisa a los valores.
      [FONT_SIZE_GROUP]: ['font-size'],
      'font-size': [FONT_SIZE_GROUP],
    },
  },
});

/**
 * `clsx` resuelve condicionales y arrays; `tailwind-merge` pisa la clase
 * duplicada por grupo. Sin el merge, un `px-4` que viene de un componente y
 * un `px-6` del call site se acumulan y gana el que aparece último en el HTML.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
