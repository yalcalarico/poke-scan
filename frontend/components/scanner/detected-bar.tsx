'use client';

import { useCurrency } from '@/hooks/use-currency';
import { cn } from '@/lib/cn';
import { formatCardNumber } from '@/lib/format';
import type { RecognizedCard, PriceDto } from '@/types/api';

import { CardThumb } from './card-thumb';

type UsablePrice = PriceDto;

function isUsable(price: PriceDto | null | undefined): price is UsablePrice {
  if (!price) return false;
  return [price.market, price.mid, price.low, price.high].some(
    (value) => typeof value === 'number' && Number.isFinite(value),
  );
}

/** `price` es UNA fila elegida por el backend; el resumen de la barra usa la misma. */
export function referencePrice(candidate: RecognizedCard): number | null {
  const best = (candidate.prices ?? []).find(isUsable) ?? candidate.price;
  if (!isUsable(best)) return null;
  return best.market ?? best.mid ?? best.low ?? best.high;
}

/**
 * Las 4 referencias de mercado de una fila de precio, en el orden en que las
 * lee un coleccionista: cuánto la encontré, cuánto la pido, cuánto la pido
 * arriba, y cuánto la está pagando la gente.
 */
const PRICE_FIELDS = [
  { key: 'low', label: 'Mín' },
  { key: 'mid', label: 'Media' },
  { key: 'high', label: 'Máx' },
  { key: 'market', label: 'Mercado' },
] as const satisfies readonly { key: keyof PriceDto; label: string }[];

export interface CandidatePriceTableProps {
  candidate: RecognizedCard;
  className?: string;
}

/**
 * El precio de un candidato sale de `prices[]`, no de `price`.
 *
 * `price` es **una** fila —el backend elige la variante más barata o más
 * reciente— y solo se usaba de esa fila `market ?? mid`. `prices[]` es
 * el desglose por variante, y para quien está armando una colección "cuánto
 * vale" y "de qué variante" son dos preguntas distintas: la Holo y la
 * regular del mismo Charizard tienen precios que no se explican solos.
 */
export function CandidatePriceTable({ candidate, className }: CandidatePriceTableProps) {
  const { formatMoney } = useCurrency();
  const variants = (candidate.prices ?? []).filter(isUsable);

  if (variants.length === 0) {
    return (
      <p className="text-caption text-tertiary" aria-label="Sin precio">
        Sin precio
      </p>
    );
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <dl className="flex flex-col gap-2">
        {variants.map((price) => (
          <div key={price.variant} className="grid grid-cols-4 gap-2">
            {PRICE_FIELDS.map((field) => {
              const value = price[field.key];
              const hasValue = typeof value === 'number' && Number.isFinite(value);
              return (
                <div key={field.key} className="min-w-0">
                  <dt className="text-overline text-tertiary">{field.label}</dt>
                  <dd className="truncate text-caption text-primary tabular-nums">
                    {hasValue ? formatMoney(value) : <span aria-label="Sin precio">—</span>}
                  </dd>
                </div>
              );
            })}
          </div>
        ))}
      </dl>

      {variants.length > 1 ? (
        <p className="text-caption text-tertiary">
          {variants.length} variantes con precio en el catálogo
        </p>
      ) : null}
    </div>
  );
}

export interface DetectedCardBarProps {
  candidate: RecognizedCard;
  className?: string;
}

/**
 * La barra de carta detectada: miniatura, nombre, set, número y precio, en
 * `bg-on-media` con `backdrop-blur`.
 *
 * Antes esto era una card modal que cubría la pantalla. Ahora es **inline y no
 * bloqueante**, y esa es la diferencia que importa. La cámara sigue viva
 * mientras el reconocimiento visual corre y mientras el usuario mira el resultado, así que la
 * foto que está encuadrando nunca desaparece de la pantalla.
 */
export function DetectedCardBar({ candidate, className }: DetectedCardBarProps) {
  const { formatMoney } = useCurrency();
  const { card } = candidate;
  const setName = card.set?.name ?? card.setId;
  const price = referencePrice(candidate);

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-panel bg-on-media px-3 py-2.5 text-on-media-text shadow-lg backdrop-blur-md',
        className,
      )}
    >
      <CardThumb card={card} width={40} onMedia />

      <div className="min-w-0 flex-1">
        <p className="truncate text-body-strong" title={card.name}>
          {card.name}
        </p>
        <p className="truncate text-caption text-on-media-text/70" title={setName}>
          {setName}
          <span aria-hidden="true"> · </span>
          <span className="tabular-nums">
            {formatCardNumber(card.number, card.set?.printedTotal ?? null)}
          </span>
        </p>
      </div>

      <p className="shrink-0 text-body-strong text-positive tabular-nums">
        {price === null ? (
          <span className="text-on-media-text/60" aria-label="Sin precio">
            —
          </span>
        ) : (
          formatMoney(price)
        )}
      </p>
    </div>
  );
}
