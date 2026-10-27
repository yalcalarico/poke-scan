'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ChartNoAxesCombined, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Money, ShowOrDash } from '@/components/cards/money';
import { PriceReferenceDetails, ValuationEvidence } from '@/components/prices/price-evidence';
import { Sparkline } from '@/components/prices/sparkline';
import { useCurrency } from '@/hooks/use-currency';
import { Button, ErrorState, SegmentedControl, Skeleton, Surface } from '@/components/ui';
import { useAsync } from '@/hooks/use-async';
import { getPortfolio } from '@/lib/api/collections';
import { formatObservedDay } from '@/lib/prices/format';
import { VARIANT_OPTIONS } from '@/lib/variants';
import { chartDateRange } from '@/lib/prices/chart-window';

const WINDOWS = [{ value: '7', label: '7 días' }, { value: '30', label: '30 días' }, { value: '365', label: '1 año' }] as const;

export function PortfolioOverview({ refreshKey = 0 }: { refreshKey?: number }) {
  const { currency } = useCurrency();
  const currencyIsArs = currency === 'ARS';
  const { status, data, error, reload } = useAsync(getPortfolio, [refreshKey]);
  const [windowDays, setWindowDays] = useState<'7' | '30' | '365'>('30');
  if (status === 'loading') return <div role="status" aria-label="Cargando el portafolio" aria-busy="true"><Skeleton variant="block" /></div>;
  if (status === 'error' || !data) return <ErrorState title="No pudimos cargar el portafolio" message={error ?? undefined} onRetry={reload} />;
  const dateRange = chartDateRange(Number(windowDays), data.valuation?.evaluatedAt ?? new Date().toISOString());
  const observations = data.history.filter((point) => point.date >= dateRange.start && point.date <= dateRange.end);
  const points = observations.flatMap((point) => point.valuation?.amount == null ? [] : [{ date: point.date, value: point.valuation.amount }]);
  const first = points[0];
  const last = points.at(-1);
  const latestObservation = observations.at(-1);
  const delta = first && last && points.length > 1 && last.date === latestObservation?.date && latestObservation.valuation?.amount != null ? last.value - first.value : null;
  return <section aria-label="Resumen del portafolio" className="grid gap-4 md:grid-cols-2">
    <Surface className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-2 text-brand"><Wallet aria-hidden="true" className="size-5" /><h2 className="text-h3">Tu portafolio</h2></div>
      <div>
        <p className="text-display-lg tracking-tight text-primary"><ShowOrDash usd={data.valuation?.amount} className="text-display-lg" moneyClassName="text-display-lg" /></p>
        <p className="text-caption text-secondary">{data.totalCards} copias entre todas tus colecciones</p>
        <ValuationEvidence valuation={data.valuation} emptyMessage="Todavía no tenés cartas en tus colecciones." announceChanges />
      </div>
      <h3 className="text-body-strong text-primary">Valor observado de tus colecciones</h3>
      <SegmentedControl label="Período del portafolio" value={windowDays} options={WINDOWS} onChange={setWindowDays} />
      {delta !== null ? <p className="text-body-strong text-primary">Cambio de valor: {delta > 0 ? '+' : delta < 0 ? '−' : ''}<Money usd={Math.abs(delta)} /></p> : null}
      {points.length > 1 ? <Sparkline points={points} dateRange={dateRange} label={`Valor observado de tus colecciones: ${points.length} observaciones entre ${first?.date} y ${last?.date}; de USD ${first?.value.toFixed(2)} a USD ${last?.value.toFixed(2)}`} className="text-brand [&_svg]:h-40" />
        : <div className="flex min-h-32 items-center gap-3 rounded-control bg-brand-soft p-4">
          <ChartNoAxesCombined aria-hidden="true" className="size-8 shrink-0 text-brand" />
          <p className="text-body text-secondary">{first ? 'Falta otra valoración en este período. Volvé otro día para ver la gráfica.' : 'La gráfica aparecerá cuando haya valoraciones con precios disponibles.'}</p>
        </div>}
      {points.length > 1 ? <p className="flex justify-between gap-3 text-caption text-tertiary"><span>{formatObservedDay(dateRange.start)}</span><span>{formatObservedDay(dateRange.end)}</span></p> : null}
      <p className="text-caption text-tertiary">Puede cambiar por tus cartas, cantidades y referencias de precio; no representa ganancia. {currencyIsArs ? 'Historial en USD convertido al cambio actual; no representa valores históricos en pesos.' : ''}</p>
      <details className="text-caption text-secondary">
        <summary className="flex min-h-11 cursor-pointer items-center rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]">Ver valoraciones registradas ({observations.length})</summary>
        <ul>{observations.map((point) => <li key={point.date} className="flex flex-col gap-1 border-t border-line-subtle py-2"><div className="flex justify-between gap-3"><span>Valor observado {formatObservedDay(point.date)}</span><ShowOrDash usd={point.valuation?.amount} /></div><ValuationEvidence valuation={point.valuation} /></li>)}</ul>
      </details>
    </Surface>
    <Surface className="flex flex-col gap-4 p-5">
      <div><h2 className="text-h3 text-primary">Tus cartas más valiosas</h2><p className="text-caption text-secondary">Por precio de mercado de una copia</p></div>
      {data.topCards.length === 0 ? <p className="text-body text-secondary">Cuando tus cartas tengan precio disponible, vas a ver las más valiosas acá.</p> : <ul className="divide-y divide-line-subtle">
        {data.topCards.slice(0, 5).map((card) => <li key={`${card.cardId}-${card.variant}`}>
          <Link href={`/carta/${encodeURIComponent(card.cardId)}`} className="flex min-h-11 items-center gap-3 rounded-control py-3 focus-visible:outline-2 focus-visible:outline-[color:var(--focus-ring)]">
            <Image src={card.imageSmall} alt="" width={48} height={67} className="h-auto shrink-0 rounded-control object-contain" />
            <div className="min-w-0 flex-1"><p className="text-body-strong text-primary">{card.name}</p><p className="break-words text-caption text-secondary">{card.setName} · {card.number}</p><p className="text-caption text-tertiary">{VARIANT_OPTIONS.find((option) => option.value === card.variant)?.label ?? card.variant} · {card.quantity} {card.quantity === 1 ? 'copia' : 'copias'}</p></div>
            <div className="shrink-0 text-right"><Money usd={card.marketUsd} size="lg" /><p className="text-caption text-tertiary">Total <Money usd={card.valueUsd} size="sm" /></p></div>
          </Link>
          <div className="pb-3 pl-14">{card.reference ? <PriceReferenceDetails reference={card.reference} showConversion /> : <p className="text-caption text-warning">Antigüedad no disponible.</p>}</div>
        </li>)}
      </ul>}
      <Button variant="ghost" onClick={reload} className="mt-auto self-start">Actualizar resumen</Button>
    </Surface>
  </section>;
}
