'use client';

import { Search } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';

import { Alert, Button, EmptyState, Input, Sheet } from '@/components/ui';
import type { IdentifiedCandidateDto, IdentifyResponseDto } from '@/types/api';

import { CandidateCard } from './candidate-card';
import { formatCount } from './copy';
import { CONFIDENT_SCORE } from './types';

export interface ScanResultsProps {
  open: boolean;
  data: IdentifyResponseDto | null;
  /** Lo que entendió el parser local, para el copy si el backend no devolvió nombre. */
  localNameGuess: string | null;
  /** Candidatos ya sumados a la sesión, para el estado "ya está". */
  sessionCardIds: ReadonlySet<string>;
  onClose: () => void;
  onChoose: (candidate: IdentifiedCandidateDto) => void;
  /** `null` = no leímos un nombre: la pantalla destino abre sin query. */
  onManualSearch: (name: string | null) => void;
}

/**
 * Las coincidencias de una captura, en un `Sheet`.
 *
 * Un `Sheet` y no otra pantalla porque el escáner es full-bleed y no hay lugar
 * detrás de la foto: el sheet se abre **sin cámara montada** (ver el JSDoc de
 * `camera-view.tsx` para por qué), así que lo que queda atrás es la página.
 */
export function ScanResults({
  open,
  data,
  localNameGuess,
  sessionCardIds,
  onClose,
  onChoose,
  onManualSearch,
}: ScanResultsProps) {
  const queryId = useId();
  const [manualName, setManualName] = useState('');

  const candidates = data?.candidates ?? [];
  const bestScore = candidates[0]?.score ?? 0;
  const isConfident = bestScore >= CONFIDENT_SCORE;
  const extracted = data?.extracted ?? null;
  const detected = extracted?.name ?? localNameGuess;
  const contextHint = extracted?.setHint ?? null;
  const total = data?.totalCandidates ?? 0;

  const handleManualSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = manualName.trim();
    if (name) onManualSearch(name);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="full"
      title="Coincidencias"
      subtitle={
        total > 0
          ? `${formatCount(total)} ${total === 1 ? 'coincidencia' : 'coincidencias'} en el catálogo`
          : undefined
      }
      footer={
        <>
          <Button variant="primary" size="lg" onClick={onClose} className="flex-1">
            Seguir escaneando
          </Button>
          <Button variant="secondary" size="lg" onClick={() => onManualSearch(detected)}>
            Buscar a mano
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-control bg-surface-2 p-3">
          <p className="text-overline text-tertiary">Interpretamos</p>
          <p className="mt-1 text-body-strong text-primary">
            {detected ? `Detectamos: ${detected}` : 'No pudimos leer un nombre claro'}
          </p>
          {contextHint || extracted?.number ? (
            <p className="mt-1 text-caption text-secondary">
              {[contextHint, extracted?.number ? `#${extracted.number}` : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          ) : null}
        </div>

        {candidates.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {candidates.map((candidate, index) => (
              <CandidateCard
                key={`${candidate.card.id}-${index}`}
                candidate={candidate}
                isBest={index === 0}
                isInSession={sessionCardIds.has(candidate.card.id)}
                onAdd={() => onChoose(candidate)}
              />
            ))}
          </ul>
        ) : (
          <EmptyState
            kind="no-results"
            icon={Search}
            title="No encontramos coincidencias"
            size="sm"
            description={
              detected
                ? `Leímos «${detected}» pero no hay cartas que coincidan en el catálogo. Probá buscándola a mano.`
                : 'No pudimos encontrar una carta que coincida con lo que leímos. Probá con una foto más nítida o buscá a mano.'
            }
          />
        )}

        {candidates.length > 0 && !isConfident ? (
          <Alert tone="warning" title="No estamos seguros" size="sm">
            La mejor coincidencia es de{' '}
            {Math.round(bestScore * 100)} %. Revisá las opciones o escribí el nombre a mano.
          </Alert>
        ) : null}

        {!isConfident ? (
          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleManualSubmit}>
            <label htmlFor={queryId} className="sr-only">
              Nombre de la carta
            </label>
            <Input
              id={queryId}
              value={manualName}
              onChange={(event) => setManualName(event.target.value)}
              placeholder={localNameGuess ?? 'Ej: Charizard'}
              maxLength={80}
              autoComplete="off"
              className="flex-1"
            />
            <Button type="submit" variant="secondary" size="lg" disabled={manualName.trim().length === 0}>
              Buscar
            </Button>
          </form>
        ) : null}

        {candidates.length > 0 && total > candidates.length ? (
          <p className="text-center text-caption text-tertiary">
            {formatCount(total)} coincidencias en total: mostramos las {formatCount(candidates.length)}{' '}
            mejores.
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
