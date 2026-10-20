'use client';

import Image from 'next/image';
import { Money } from '@/components/cards/money';
import { Button, Surface } from '@/components/ui';
import { Burst, Reveal } from '@/components/visual-preview/effects';
import { VisualCard } from '@/components/visual-preview/holo-card';
import { PreviewLink } from '@/components/visual-preview/preview-link';
import { useVisualPreview } from '@/components/visual-preview/visual-preview';
import { formatCardNumber } from '@/lib/format';
import { referencePrice } from './detected-bar';
import type { SessionEntry } from './types';

/** Solo presenta el resultado existente: no reconoce, consulta ni guarda datos. */
export function VisualScanResult({ entry, onReview }: { entry: SessionEntry; onReview: () => void }) {
  const visual = useVisualPreview();
  if (!visual) return null;
  const { card } = entry.candidate;
  const price = referencePrice(entry.candidate);
  return <Reveal key={entry.runId} className="relative" >
    <Surface className="relative grid items-center gap-6 p-5 md:grid-cols-2" data-v2-scan-result="">
      <Burst trigger={entry.runId} />
      <div className="relative mx-auto w-full max-w-56 py-4">
        <VisualCard><Image src={card.imageLarge || card.imageSmall} alt={`Carta propuesta: ${card.name}`} width={315} height={440} sizes="224px" className="h-auto w-full rounded-surface" /></VisualCard>
      </div>
      <div className="flex min-w-0 flex-col items-start gap-3">
        <p className="text-overline text-brand">Coincidencia propuesta</p>
        <h2 className="break-words text-h1 text-primary">{card.name}</h2>
        <p className="text-body text-secondary">{card.set?.name ?? card.setId} · {formatCardNumber(card.number, card.set?.printedTotal ?? null)}</p>
        <p className="text-caption text-secondary">Revisá nombre, número y edición antes de organizar la carta.</p>
        <p className="text-display text-positive"><Money usd={price} className="text-display" /> </p>
        {price === null ? <p className="text-caption text-secondary">Sin referencia de precio disponible.</p> : <p className="text-caption text-secondary">Referencia de mercado de la coincidencia</p>}
        <Button variant="secondary" onClick={onReview}>Revisar coincidencia</Button>
        <PreviewLink href={`/carta/${encodeURIComponent(card.id)}`} className="flex min-h-11 items-center rounded-control px-3 text-label text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]">Ver detalle de la carta</PreviewLink>
      </div>
    </Surface>
  </Reveal>;
}
