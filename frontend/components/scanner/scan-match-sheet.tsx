'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Button, Sheet, SheetBody, SheetFooter, SheetHeader } from '@/components/ui';
import { formatCardNumber } from '@/lib/format';
import type { CaptureReview } from '@/lib/scanner/capture-review';
import type { RecognizedCard, VisualIdentifyResponseDto } from '@/types/api';
import { cn } from '@/lib/cn';
import { CardThumb } from './card-thumb';
import { CaptureReviewActions } from './capture-review';

type Match = VisualIdentifyResponseDto['candidates'][number];

export function ScanMatchSheet({ review, candidate, open, pending, onOpenChange, onConfirm, onManualSearch }: {
  review: CaptureReview;
  candidate: RecognizedCard;
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (match: Match) => void;
  onManualSearch: () => void;
}) {
  const matches = review.result?.candidates ?? [];
  const [selectedId, setSelectedId] = useState(candidate.card.id);
  const selected = matches.find((match) => match.card.id === selectedId);
  const card = selected?.card ?? candidate.card;
  return <Sheet open={open} onClose={() => onOpenChange(false)} title="Revisá la coincidencia" subtitle="Compará tu captura y elegí la carta correcta.">
    <SheetHeader />
    <SheetBody className="flex flex-col gap-4 [&>*]:shrink-0">
      <div className="grid grid-cols-2 gap-3">
        <figure className="min-w-0">
          <div className="relative aspect-[63/88] overflow-hidden rounded-control bg-surface-2">
            <Image src={review.image} alt="Tu captura de la carta" fill unoptimized sizes="(max-width: 640px) 45vw, 280px" className="object-contain" />
          </div>
          <figcaption className="mt-2 text-center text-caption text-secondary">Tu captura</figcaption>
        </figure>
        <figure className="min-w-0">
          <div className="relative aspect-[63/88] overflow-hidden rounded-control bg-surface-2">
            <Image src={card.imageLarge || card.imageSmall} alt={`Referencia de ${card.name}`} fill sizes="(max-width: 640px) 45vw, 280px" className="object-contain" />
          </div>
          <figcaption className="mt-2 text-center text-caption text-secondary">Carta del catálogo</figcaption>
        </figure>
      </div>
      <div>
        <h3 className="text-body-strong text-primary">Otras coincidencias</h3>
        <p className="mt-1 text-caption text-secondary">DINOv2 propone estas opciones. La similitud no confirma la edición.</p>
        <div className="mt-3 flex gap-3 overflow-x-auto pb-2" role="group" aria-label="Opciones reconocidas">
          {matches.map((match) => <button key={match.card.id} type="button" aria-pressed={card.id === match.card.id}
            aria-label={`Elegir ${match.card.name}, ${match.card.set?.name ?? match.card.setId}, número ${match.card.number}`}
            disabled={pending} onClick={() => setSelectedId(match.card.id)}
            className={cn('w-24 shrink-0 rounded-control border-2 p-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]', card.id === match.card.id ? 'border-brand bg-brand-soft' : 'border-line bg-surface')}>
            <CardThumb card={match.card} width={84} />
            <span className="mt-1 block truncate text-caption text-primary">{match.card.name}</span>
            <span className="block truncate text-caption text-secondary">#{match.card.number}</span>
          </button>)}
        </div>
      </div>
      <div>
        <p className="text-body-strong text-primary">{card.name}</p>
        <p className="text-caption text-secondary">{card.set?.name ?? card.setId} · {formatCardNumber(card.number, card.set?.printedTotal ?? null)}</p>
      </div>
      <Button variant="secondary" onClick={onManualSearch} disabled={pending} fullWidth>¿No está? Buscá a mano</Button>
      <CaptureReviewActions review={review} open={false} onOpenChange={() => {}} />
    </SheetBody>
    <SheetFooter><Button fullWidth loading={pending} disabled={!selected || pending} onClick={() => { if (selected) onConfirm(selected); }}>Confirmar esta carta</Button></SheetFooter>
  </Sheet>;
}
