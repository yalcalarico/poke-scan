'use client';

import { cn } from '@/lib/cn';

import { Chip } from '../ui';

/**
 * Las 12 rarezas del catálogo, en el **texto de la fuente** y no en uno
 * traducido.
 *
 * No es descuido: `rarity` viaja al backend como igualdad case-insensitive
 * contra el valor crudo de la columna (`backend/docs/api.md` §`cards/search`),
 * y el catálogo espejado came de pokemontcg.io. Traducir el label sin traducir
 * el `value` rompe el filtro; y un filtro de rareza que a veces no filtra es
 * peor que un filtro en inglés.
 */
export const RARITY_OPTIONS = [
  'Common',
  'Uncommon',
  'Rare',
  'Rare Holo',
  'Ultra Rare',
  'Secret Rare',
  'Special Illustration Rare',
  'Amazing Rare',
  'Shiny Rare',
  'Trainer',
  'Energy',
  'Promo',
] as const;

/** Tira la barra de scroll sin esconder el scroll. Chromium lo pide por
 *  pseudoelemento y Firefox por `scrollbar-width`: hacen falta los dos. */
const NO_SCROLLBAR = '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

export interface RarityFilterProps {
  /** Rareza activa, o `''` si no hay filtro. */
  value: string;
  onChange: (rarity: string) => void;
  className?: string;
}

/**
 * Filtro de rareza como scroller horizontal de chips (§7.2).
 *
 * Doce opciones entran directas como pills: es el punto del patrón. Un
 * `Sheet` con buscador para doce cosas es un click de más, y en el wireframe
 * las rarezas son una fila de chips al lado de los sets.
 *
 * El scroller **sangra hasta los bordes de la pantalla** (`-mx-4 px-4`) con el
 * padding de vuelta adentro. Sin eso, el primer chip queda a 16 px del borde y
 * el último a 16 px del otro, y se lee como una fila que no llega a entrar en
 * pantalla. Con eso, la fila "se sale" y es obvio que hay más.
 *
 * `snap-x` + `snap-start`: al scrollear a dedo, cada chip queda alineado en
 * lugar de quedar a medio camino entre dos. Sin snap, el último chip visible
 * siempre queda cortado y parece un error de layout.
 */
export function RarityFilter({ value, onChange, className }: RarityFilterProps) {
  return (
    <div
      role="group"
      aria-label="Filtros por rareza"
      className={cn(
        '-mx-4 flex snap-x gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6',
        NO_SCROLLBAR,
        className,
      )}
    >
      <Chip
        active={value === ''}
        onClick={() => onChange('')}
        className="snap-start"
        aria-label="Todas las rarezas"
      >
        Todas
      </Chip>

      {RARITY_OPTIONS.map((rarity) => (
        <Chip
          key={rarity}
          active={value === rarity}
          onClick={() => onChange(value === rarity ? '' : rarity)}
          className="snap-start"
        >
          {rarity}
        </Chip>
      ))}
    </div>
  );
}
