'use client';

import { useCurrency } from '@/hooks/use-currency';
import { cn } from '@/lib/cn';
import { formatReferenceTime } from '@/lib/prices/format';
import { ValuationMetadata } from '@/components/prices/valuation-metadata';
import { formatPrice } from '@/lib/format';
import type { PriceFreshness, PriceDto, ValueAggregateDto } from '@/types/api';

type ReferenceEvidence = Pick<PriceDto, 'provider' | 'source' | 'currency' | 'fetchedAt'> &
  Partial<Pick<PriceDto, 'evaluatedAt' | 'freshness' | 'upstreamUpdatedAt' | 'upstreamFreshness'>>;

function freshnessLabel(freshness: PriceFreshness | undefined): string {
  if (freshness === 'fresh') return 'Consulta reciente al evaluar';
  if (freshness === 'stale') return 'Consulta anterior o de otra API al evaluar';
  return 'Antigüedad no disponible';
}

/** Fechas y procedencia comunicadas por la API, sin recalcularlas con el reloj del navegador. */
export function PriceReferenceDetails({ reference, showConversion = false }: { reference: ReferenceEvidence; showConversion?: boolean }) {
  const provider = reference.provider ?? 'origen no identificado · referencia legacy';
  const upstream = reference.upstreamUpdatedAt
    ? `Fuente actualizada el ${formatReferenceTime(reference.upstreamUpdatedAt)}${reference.upstreamFreshness === 'fresh' ? ' · reciente al evaluar' : reference.upstreamFreshness === 'stale' ? ' · referencia anterior' : ' · antigüedad de fuente no disponible'}`
    : 'Fecha de actualización de la fuente no disponible';

  return (
    <details className="text-caption text-secondary">
      <summary className="flex min-h-11 cursor-pointer items-center rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]">Ver referencia del precio</summary>
      <div className="flex flex-col gap-0.5">
      <p>Mercado: {reference.source} · API: {provider} · Moneda original: {reference.currency}</p>
      <p>{formatReferenceTime(reference.fetchedAt) === '—' ? 'Consulta: fecha no disponible' : `Consultado el ${formatReferenceTime(reference.fetchedAt)}`} · {freshnessLabel(reference.freshness)}</p>
      {reference.evaluatedAt ? <p>Evaluado el {formatReferenceTime(reference.evaluatedAt)}</p> : <p>Evaluación: antigüedad no disponible</p>}
      <p>{upstream}</p>
      {showConversion ? <LocalConversion /> : null}
      </div>
    </details>
  );
}

function LocalConversion() {
  const { currency, activeRate, fetchedAt, isStale } = useCurrency();
  if (currency !== 'ARS') return null;
  return <p>Referencia internacional convertida{activeRate ? ` · 1 USD = ${formatPrice(activeRate.rate, 'ARS')} (${activeRate.rateType})${fetchedAt ? ` · cotización del ${formatReferenceTime(fetchedAt)}` : ''}${isStale ? ' · cotización cambiaria anterior' : ''}` : ' · cotización actual no disponible'}</p>;
}

/** Cobertura por copias y antigüedad agregada; los estados faltantes nunca se completan por inferencia. */
export function ValuationEvidence({ valuation, emptyMessage = 'Todavía no hay cartas en esta colección.', className, announceChanges = false }: { valuation: ValueAggregateDto | undefined; emptyMessage?: string; className?: string; announceChanges?: boolean }) {
  const { currency } = useCurrency();
  return <div className={cn('flex flex-col gap-1 text-caption text-secondary', className)}>
    <ValuationMetadata valuation={valuation} emptyMessage={emptyMessage} announceChanges={announceChanges} />
    {valuation && currency === 'ARS' ? <details><summary className="flex min-h-11 cursor-pointer items-center rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]">Ver conversión a pesos</summary><LocalConversion /></details> : null}
  </div>;
}
