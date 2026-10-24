'use client';

import { useState } from 'react';
import { Button, Select, SegmentedControl, Skeleton, Surface } from '@/components/ui';
import { useAsync } from '@/hooks/use-async';
import { getCardComparison, getCollectionComparison } from '@/lib/api/comparison';
import { formatObservedDay, formatReferenceTime } from '@/lib/prices/format';
import { VARIANT_OPTIONS, variantLabel } from '@/lib/variants';
import type { CardVariant, ComparisonProvider } from '@/types/api';
import { ComparisonChart } from './comparison-chart';

const WINDOWS = [{ value: '7', label: '7 días' }, { value: '30', label: '30 días' }, { value: '90', label: '90 días' }, { value: '365', label: '1 año' }] as const;
const freshnessNames = { fresh: 'feed reciente', stale: 'feed anterior', unknown: 'fecha del feed desconocida' } as const;
const names: Record<ComparisonProvider, string> = { tcgdex: 'TCGdex', tcgcsv: 'TCGCSV' };
const moneyUsd = (value: number | null) => value === null ? '—' : new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD' }).format(value);
const observed = (value: string | null) => value ? formatObservedDay(value.slice(0, 10)) : 'fecha desconocida';

function WindowSelector({ value, onChange }: { value: '7' | '30' | '90' | '365'; onChange: (value: '7' | '30' | '90' | '365') => void }) {
  return <SegmentedControl label="Período del historial" value={value} options={WINDOWS} onChange={onChange} />;
}

function comparisonError(error: string | null) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'Estás sin conexión. El historial se va a cargar cuando vuelva internet.';
  return error ?? 'No pudimos cargar el historial. Revisá tu conexión e intentá de nuevo.';
}

export function CardComparisonPanel({ cardId, variants, preferredVariant, loadingVariants = false }: {
  cardId: string;
  variants: readonly CardVariant[];
  preferredVariant?: CardVariant;
  loadingVariants?: boolean;
}) {
  const [days, setDays] = useState<'7' | '30' | '90' | '365'>('30');
  const [selection, setSelection] = useState<{ cardId: string; variant: CardVariant } | null>(null);
  const options = VARIANT_OPTIONS.filter(({ value }) => variants.includes(value));
  const selected = selection?.cardId === cardId && options.some(({ value }) => value === selection.variant) ? selection.variant : null;
  const preferred = options.some(({ value }) => value === preferredVariant) ? preferredVariant : undefined;
  const variant = selected ?? preferred ?? options[0]?.value;

  return <Surface as="section" className="flex flex-col gap-4 p-4" aria-labelledby="comparacion-carta">
    <div><h2 id="comparacion-carta" className="text-h3 text-primary">Historial de precio</h2><p className="mt-1 text-caption text-secondary">Referencia TCGplayer en USD, informada por TCGCSV.</p></div>
    <div className="grid gap-3">
      {!loadingVariants && variant ? <div><p className="mb-1 text-label text-secondary">Variante</p>{options.length > 1 ? <Select aria-label="Variante de la carta del historial" value={variant} options={options} onChange={(value) => setSelection({ cardId, variant: value as CardVariant })} /> : <p className="text-body text-primary">{variantLabel(variant)}</p>}</div> : null}
      <div><p className="mb-1 text-label text-secondary">Período</p><WindowSelector value={days} onChange={setDays} /></div>
    </div>
    {loadingVariants ? <div role="status" aria-label="Cargando variantes"><Skeleton variant="block" /></div> : variant ? <CardComparisonResult key={`${cardId}:${variant}:${days}`} cardId={cardId} variant={variant} days={days} /> : <p className="text-body text-secondary">Todavía no hay variantes conocidas del historial.</p>}
  </Surface>;
}

function CardComparisonResult({ cardId, variant, days }: { cardId: string; variant: CardVariant; days: '7' | '30' | '90' | '365' }) {
  const result = useAsync((signal) => getCardComparison(cardId, variant, Number(days), signal), [cardId, variant, days]);
  const data = result.data;
  const series = data?.series.filter((item) => item.provider === 'tcgcsv') ?? [];
  return <>
    {result.status === 'loading' ? <div role="status" aria-label="Cargando historial"><Skeleton variant="block" /></div> : null}
    {result.status === 'error' ? <div role="alert" className="rounded-control bg-warning-soft p-3"><p className="text-body text-primary">{comparisonError(result.error)}</p><Button className="mt-2" variant="secondary" onClick={result.reload}>Reintentar</Button></div> : null}
    {result.status === 'ready' && data ? <>
      {series.length ? <ComparisonChart label={`Precios de ${variant} durante ${days} días, expresados en dólares`} series={series.map((item) => ({ provider: item.provider, points: item.points.map((point) => ({ date: point.date, value: point.market })) }))} /> : <p className="text-body text-secondary">Todavía no hay observaciones de precios para esta variante.</p>}
      <details className="text-caption text-secondary"><summary className="flex min-h-11 cursor-pointer items-center rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]">Ver observaciones diarias</summary><ul>{series.flatMap((item) => item.points.map((point) => <li key={`${item.provider}-${point.date}`} className="flex flex-wrap justify-between gap-x-3 border-t border-line-subtle py-2"><span>{names[item.provider]} · {observed(point.date)}</span><span>{moneyUsd(point.market)} · TCGplayer USD · {freshnessNames[point.freshness]}</span></li>))}</ul></details>
      <div className="grid gap-3 sm:grid-cols-2">
        {(['tcgcsv'] as const).map((provider) => {
          const item = series.find((entry) => entry.provider === provider);
          const current = item?.current ?? null;
          return <div key={provider} className="rounded-control bg-surface-2 p-3">
            <h3 className="text-label text-primary">{names[provider]}</h3>
            <p className="mt-1 text-h3 tabular-nums text-positive">{moneyUsd(current?.market ?? null)}</p>
            <p className="text-caption text-secondary">TCGplayer · USD</p>
            {current ? <p className="mt-2 text-caption text-secondary">Recibido {formatReferenceTime(current.fetchedAt)} · feed {formatReferenceTime(current.feedPublishedAt)}</p> : <p className="mt-2 text-caption text-tertiary">Sin precio conocido para esta variante.</p>}
            {current ? <p className="text-caption text-tertiary">Publicación del feed: {current.freshness === 'fresh' ? 'actual' : current.freshness === 'stale' ? 'anterior' : 'desconocida'}</p> : null}
            {provider === 'tcgcsv' && data.tcgcsv.state !== 'ready' ? <p className="mt-1 text-caption text-warning">{statusLabel(data.tcgcsv.state)}</p> : null}
            {provider === 'tcgcsv' && data.tcgcsv.state === 'ready' && current?.market === null ? <p className="mt-1 text-caption text-warning">No hay precio conocido para esta variante.</p> : null}
          </div>;
        })}
      </div>
      <p className="text-caption text-tertiary">La fecha de recepción y la fecha publicada del feed son distintas; TCGCSV no informa la fecha real de la cotización.</p><Button variant="ghost" className="self-start" onClick={result.reload}>Actualizar historial</Button>
    </> : null}
  </>;
}

function statusLabel(state: 'disabled' | 'unsupported' | 'pending' | 'ready' | 'failed') {
  switch (state) {
    case 'disabled': return 'TCGCSV todavía no está habilitado.';
    case 'unsupported': return 'Esta carta todavía no tiene una asociación admitida en TCGCSV.';
    case 'pending': return 'El historial está pendiente de importación local.';
    case 'ready': return 'La fuente está disponible, pero no hay precio para esta variante.';
    case 'failed': return 'No se pudo actualizar esta fuente.';
  }
}

export function CollectionComparisonPanel({ collectionId, refreshKey = 0 }: { collectionId: string | null; refreshKey?: number }) {
  const [days, setDays] = useState<'7' | '30' | '90' | '365'>('30');
  return <Surface as="section" className="flex flex-col gap-4 p-4" aria-labelledby={collectionId ? 'comparacion-coleccion' : 'comparacion-portafolio'}>
    <div><h2 id={collectionId ? 'comparacion-coleccion' : 'comparacion-portafolio'} className="text-h3 text-primary">Historial de valor de la colección</h2><p className="mt-1 text-caption text-secondary">Valor de las cartas que había en cada corte, no ganancia. Las referencias se expresan en USD.</p></div>
    <WindowSelector value={days} onChange={setDays} />
    <CollectionComparisonResult key={`${collectionId ?? 'portfolio'}:${days}:${refreshKey}`} collectionId={collectionId} days={days} />
  </Surface>;
}

function CollectionComparisonResult({ collectionId, days }: { collectionId: string | null; days: '7' | '30' | '90' | '365' }) {
  const result = useAsync((signal) => getCollectionComparison(collectionId, Number(days), signal), [collectionId, days]);
  const data = result.data;
  const series = data?.series.filter((item) => item.provider === 'tcgcsv') ?? [];
  return <>
    {result.status === 'loading' ? <div role="status" aria-label="Cargando historial de comparación"><Skeleton variant="block" /></div> : null}
    {result.status === 'error' ? <div role="alert" className="rounded-control bg-warning-soft p-3"><p className="text-body text-primary">{comparisonError(result.error)}</p><Button className="mt-2" variant="secondary" onClick={result.reload}>Reintentar</Button></div> : null}
    {result.status === 'ready' && data ? <>
      {series.length ? <ComparisonChart label={`Valor de la colección en USD durante ${days} días`} series={series.map((item) => ({ provider: item.provider, points: item.points.map((point) => ({ date: point.date, value: point.valueUsd, compositionChanged: point.compositionChanged })) }))} /> : <p className="text-body text-secondary">Todavía no hay cortes de valor para este período.</p>}
      <details className="text-caption text-secondary"><summary className="flex min-h-11 cursor-pointer items-center rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]">Ver cortes diarios y cobertura</summary><ul>{series.flatMap((item) => item.points.map((point) => <li key={`${item.provider}-${point.date}`} className="border-t border-line-subtle py-2"><div className="flex flex-wrap justify-between gap-x-3"><span>{names[item.provider]} · {observed(point.date)}</span><span>{moneyUsd(point.valueUsd)} · USD</span></div><p className="mt-1">Cobertura {point.pricedCopies}/{point.totalCopies} copias · {point.unpricedCopies} sin precio · {point.freshCopies} con feed reciente · {point.staleCopies} con feed anterior · {point.unknownFreshnessCopies} sin fecha del feed{point.compositionChanged ? ' · cambió la composición' : ''}{point.provisional ? ' · provisional' : ''}</p></li>))}</ul></details>
      <div className="grid gap-3 sm:grid-cols-2">{series.map((item) => <div key={item.provider} className="rounded-control bg-surface-2 p-3">
        <h3 className="text-label text-primary">{names[item.provider]}</h3><p className="mt-1 text-h3 tabular-nums text-positive">{moneyUsd(item.current.valueUsd)}</p>
        <p className="text-caption text-secondary">{item.current.pricedCopies} de {item.current.totalCopies} copias con precio · {item.current.unpricedCopies} sin precio</p>
        <p className="mt-1 text-caption text-tertiary">Evaluado {formatReferenceTime(item.current.evaluatedAt)} · corte {observed(item.current.cutAt)}{item.current.provisional ? ' · valor provisional de hoy' : ''}</p>
        <p className="text-caption text-tertiary">{item.current.freshCopies} con feed reciente · {item.current.staleCopies} con feed anterior · {item.current.unknownFreshnessCopies} sin fecha del feed · feed {formatReferenceTime(item.current.feedPublishedAt)}</p>
      </div>)}</div>
      {series.some((item) => item.points.some((point) => point.compositionChanged)) ? <div className="rounded-control bg-info-soft p-3"><p className="text-label text-primary">Cambios de composición</p><ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-caption text-secondary">{series.flatMap((item) => item.points.filter((point) => point.compositionChanged).map((point) => <li key={`${item.provider}-${point.date}`}>{names[item.provider]} · {observed(point.date)}</li>))}</ul></div> : null}
      <p className="text-caption text-tertiary">Estas gráficas mantienen USD aunque elijas pesos para el resto de la app.</p><Button variant="ghost" className="self-start" onClick={result.reload}>Actualizar historial</Button>
    </> : null}
  </>;
}
