'use client';

import { ExternalLink, Plus } from 'lucide-react';
import Link from 'next/link';

import { Button, Meter } from '@/components/ui';
import { formatCardNumber } from '@/lib/format';
import type { IdentifiedCandidateDto } from '@/types/api';

import { CardThumb } from './card-thumb';
import { CandidatePriceTable } from './detected-bar';
import { MatchedText } from './matched-text';
import { CONFIDENT_SCORE } from './types';

function scoreTone(score: number): 'positive' | 'neutral' {
  return score >= CONFIDENT_SCORE ? 'positive' : 'neutral';
}

export interface CandidateCardProps {
  candidate: IdentifiedCandidateDto;
  isBest: boolean;
  /** Ya está en la sesión: elegirla de nuevo la reemplaza, no la duplica. */
  isInSession: boolean;
  onAdd: () => void;
}

/**
 * ─── No es el `CardTile` ───
 *
 * Es una fila de resultado, no un tile del catálogo: lleva la confianza, el
 * `matchedText` y el desglose de precios que un tile de grilla no tiene. El
 * catálogo muestra 20 cosas en `/buscar`; el escáner necesita otro orden y otro
 * peso por dato.
 */
export function CandidateCard({ candidate, isBest, isInSession, onAdd }: CandidateCardProps) {
  const { card, score, matchedText } = candidate;
  const setName = card.set?.name ?? card.setId;
  const percent = Math.round(score * 100);

  return (
    <li className="flex flex-col gap-3 rounded-control bg-surface-2 p-3">
      <div className="flex items-start gap-3">
        <CardThumb card={card} width={56} />

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="line-clamp-2 text-body-strong text-primary" title={card.name}>
            {card.name}
          </p>
          <p className="truncate text-caption text-secondary" title={setName}>
            {setName}
            <span aria-hidden="true"> · </span>
            <span className="tabular-nums">
              {formatCardNumber(card.number, card.set?.printedTotal ?? null)}
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {isBest ? (
              <span className="rounded-full bg-brand-soft px-2 py-0.5 text-overline text-brand">
                Mejor match
              </span>
            ) : null}
            <span
              className={
                score >= CONFIDENT_SCORE
                  ? 'rounded-full bg-positive-soft px-2 py-0.5 text-overline text-positive'
                  : 'rounded-full bg-warning-soft px-2 py-0.5 text-overline text-warning'
              }
            >
              {percent}% coincidencia
            </span>
          </div>
        </div>
      </div>

      {/*
        El `Meter` no tiene tono `warning` (los tonos de `Progress` son brand,
        positive, negative, info y neutral), y `negative` está prohibido acá
        (§2.3: confianza baja es "no estamos seguros", no un error). Por eso la
        barra baja a `neutral` y el aviso va en el badge de arriba, que sí
        puede ser `warning`.
      */}
      <Meter
        value={percent}
        tone={scoreTone(score)}
        size="sm"
        label={`Coincidencia ${percent} por ciento`}
      />

      {matchedText ? <MatchedText text={matchedText} cardName={card.name} /> : null}

      <CandidatePriceTable candidate={candidate} />

      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={onAdd} className="flex-1">
          <Plus aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-4 w-4" />
          {isInSession ? 'Elegir esta' : 'Sumar'}
        </Button>

        <Link
          href={`/carta/${encodeURIComponent(card.id)}`}
          className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-control px-3 text-label text-secondary transition-colors duration-fast ease-standard hover:bg-surface-3 hover:text-primary focus-visible:ring-2 focus-visible:ring-brand/20 dark:focus-visible:ring-brand/40"
        >
          <ExternalLink aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-4 w-4" />
          Ver carta
        </Link>
      </div>
    </li>
  );
}
