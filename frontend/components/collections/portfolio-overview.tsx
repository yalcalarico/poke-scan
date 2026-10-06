'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ChartNoAxesCombined, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Money, ShowOrDash } from '@/components/cards/money';
import { Sparkline } from '@/components/prices/sparkline';
import { Button, ErrorState, SegmentedControl, Skeleton, Surface } from '@/components/ui';
import { useAsync } from '@/hooks/use-async';
import { getPortfolio } from '@/lib/api/collections';
import { formatDate } from '@/lib/format';
import { VARIANT_OPTIONS } from '@/lib/variants';

const WINDOWS = [{ value: '7', label: '7 días' }, { value: '30', label: '30 días' }, { value: '365', label: '1 año' }] as const;

export function PortfolioOverview() {
  const { status, data, error, reload } = useAsync(getPortfolio, []);
  const [windowDays, setWindowDays] = useState<'7' | '30' | '365'>('30');
  if (status === 'loading') return <Skeleton variant="block" />;
  if (status === 'error' || !data) return <ErrorState title="No pudimos cargar el portafolio" message={error ?? undefined} onRetry={reload} />;
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - Number(windowDays) + 1);
  const observations = data.history.filter((point) => point.date >= cutoff.toISOString().slice(0, 10));
  const points = observations.flatMap((point) => point.valueUsd === null ? [] : [{ date: point.date, value: point.valueUsd }]);
  const first = points[0];
  const last = points.at(-1);
  const delta = first && last && points.length > 1 && observations.at(-1)?.valueUsd !== null ? last.value - first.value : null;
  return <section aria-label="Resumen del portafolio" className="grid gap-4 md:grid-cols-2">
    <Surface className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-2 text-brand"><Wallet aria-hidden="true" className="size-5" /><h2 className="text-h3">Tu portafolio</h2></div>
      <div>
        <p className="text-display-lg tracking-tight text-primary"><ShowOrDash usd={data.valueUsd} className="text-display-lg" moneyClassName="text-display-lg" /></p>
        <p className="text-caption text-secondary">{data.totalCards} cartas entre todas tus colecciones</p>
        {data.unpricedCards > 0 ? <p className="mt-1 text-caption text-warning">Valor parcial: {data.unpricedCards} {data.unpricedCards === 1 ? 'carta sin precio' : 'cartas sin precio'}</p> : null}
      </div>
      <SegmentedControl label="Período del portafolio" value={windowDays} options={WINDOWS} onChange={setWindowDays} />
      {delta !== null ? <p className="text-body-strong text-primary">Cambio de valor: {delta > 0 ? '+' : delta < 0 ? '−' : ''}<Money usd={Math.abs(delta)} /></p> : null}
      {points.length > 1 ? <Sparkline points={points} label={`Valor del portafolio: ${points.length} valoraciones entre ${first?.date} y ${last?.date}; de USD ${first?.value.toFixed(2)} a USD ${last?.value.toFixed(2)}`} className="text-brand [&_svg]:h-40" />
        : <div className="flex min-h-32 items-center gap-3 rounded-control bg-brand-soft p-4">
          <ChartNoAxesCombined aria-hidden="true" className="size-8 shrink-0 text-brand" />
          <p className="text-body text-secondary">{first ? 'Falta otra valoración en este período. Volvé otro día para ver la gráfica.' : 'La gráfica aparecerá cuando haya valoraciones con precios disponibles.'}</p>
        </div>}
      {points.length > 1 && first && last ? <p className="flex justify-between gap-3 text-caption text-tertiary"><span>{formatDate(`${first.date}T12:00:00Z`)}</span><span>{formatDate(`${last.date}T12:00:00Z`)}</span></p> : null}
      <p className="text-caption text-tertiary">Se registra una valoración por día al abrir el portafolio. El cambio incluye cartas agregadas o retiradas y cambios de precio; no representa una ganancia.</p>
      <details className="text-caption text-secondary">
        <summary className="flex min-h-11 cursor-pointer items-center">Ver valoraciones registradas ({observations.length})</summary>
        <ul>{observations.map((point) => <li key={point.date} className="flex justify-between gap-3 border-t border-line-subtle py-2"><span>{formatDate(`${point.date}T12:00:00Z`)}{point.unpricedCards > 0 ? ' · Parcial' : ''}</span><ShowOrDash usd={point.valueUsd} /></li>)}</ul>
      </details>
    </Surface>
    <Surface className="flex flex-col gap-4 p-5">
      <div><h2 className="text-h3 text-primary">Tus cartas más valiosas</h2><p className="text-caption text-secondary">Por precio de mercado de una copia</p></div>
      {data.topCards.length === 0 ? <p className="text-body text-secondary">Cuando tus cartas tengan precio disponible, vas a ver las más valiosas acá.</p> : <ul className="divide-y divide-line-subtle">
        {data.topCards.map((card) => <li key={`${card.cardId}-${card.variant}`}>
          <Link href={`/carta/${encodeURIComponent(card.cardId)}`} className="flex min-h-11 items-center gap-3 rounded-control py-3 focus-visible:outline-2 focus-visible:outline-[color:var(--focus-ring)]">
            <Image src={card.imageSmall} alt="" width={48} height={67} className="h-auto shrink-0 rounded-control object-contain" />
            <div className="min-w-0 flex-1"><p className="text-body-strong text-primary">{card.name}</p><p className="break-words text-caption text-secondary">{card.setName} · {card.number}</p><p className="text-caption text-tertiary">{VARIANT_OPTIONS.find((option) => option.value === card.variant)?.label ?? card.variant} · {card.quantity} {card.quantity === 1 ? 'copia' : 'copias'}</p></div>
            <div className="shrink-0 text-right"><Money usd={card.marketUsd} size="lg" /><p className="text-caption text-tertiary">Total <Money usd={card.valueUsd} size="sm" /></p></div>
          </Link>
        </li>)}
      </ul>}
      <Button variant="ghost" onClick={reload} className="mt-auto self-start">Actualizar resumen</Button>
    </Surface>
  </section>;
}
