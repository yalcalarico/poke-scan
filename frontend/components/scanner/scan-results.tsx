'use client';

import { Search } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent } from 'react';

import { Alert, Button, EmptyState, Input, Sheet } from '@/components/ui';
import type { IdentifiedCandidateDto, IdentifyResponseDto } from '@/types/api';

import { CandidateCard } from './candidate-card';
import { formatCount } from './copy';
import { HAPTIC, haptic } from './haptics';
import { assessCandidates } from '@/lib/scanner/assessment';

export interface ScanResultsProps {
  open: boolean;
  data: IdentifyResponseDto | null;
  /** Lo que entendió el parser local, para el copy si el backend no devolvió nombre. */
  localNameGuess: string | null;
  /** Número impreso leído por OCR, conservado aunque el API sólo reciba el numerador. */
  localNumberGuess: string | null;
  /** Candidatos ya sumados a la sesión, para el estado "ya está". */
  sessionCardIds: ReadonlySet<string>;
  onClose: () => void;
  onChoose: (candidate: IdentifiedCandidateDto, remember?: boolean) => void;
  onForget?: () => void;
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
  localNumberGuess,
  sessionCardIds,
  onClose,
  onChoose,
  onForget,
  onManualSearch,
}: ScanResultsProps) {
  const queryId = useId();
  const [manualName, setManualName] = useState('');
  const [remember, setRemember] = useState(false);

  const candidates = data?.candidates ?? [];
  const isConfident = (data?.status ?? assessCandidates(candidates)) === 'confident';
  const extracted = data?.extracted ?? null;
  const detected = localNameGuess ?? extracted?.name ?? null;
  const contextHint = extracted?.setHint ?? null;
  const numberHint = localNumberGuess ?? extracted?.number;
  const total = data?.totalCandidates ?? 0;
  const hasMatch = candidates.length > 0;

  /*
   * ─── Por qué la confirmación vive acá y no en la `CameraView` ───
   *
   * El momento de "salió una carta" es el mismo render en el que la pantalla
   * hace `setSession(...)` **y** `setStage('results')`. Los dos `setState` caen
   * en el mismo tick, así que React los batchea: la `CameraView` se desmonta
   * antes de que corra un efecto que mire el contador de sesión. Un
   * `useEffect` sobre `sessionCount` adentro del scanner no vibraría nunca — y no
   * fallaría, que es peor.
   *
   * Este `Sheet` es lo que sobrevive a ese montaje (la pantalla lo renderiza
   * siempre, con `open`), y abrirse con al menos una candidata *es* la
   * confirmación: la mejor match ya entró a la sesión en el mismo tick.
   *
   * Con cero candidatas no vibra: el `EmptyState` de abajo es un fallo de
   * lectura, y confirmar un "no encontramos nada" con la misma sensación que un
   * acierto es mentirle al tacto.
   */
  useEffect(() => {
    if (open && hasMatch && isConfident) haptic(HAPTIC.confirmed);
  }, [open, hasMatch, isConfident]);

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
          {contextHint || numberHint ? (
            <p className="mt-1 text-caption text-secondary">
              {[contextHint ? `Colección sugerida: ${contextHint}` : null,
                numberHint ? `Número detectado: ${numberHint}` : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          ) : null}
        </div>

        {candidates.length > 0 ? (
          <div className="flex flex-col gap-2">
            <label className="text-caption text-secondary flex items-center gap-2">
              <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
              Recordar esta lectura en este dispositivo (sin guardar la foto)
            </label>
            {onForget ? <Button variant="ghost" size="sm" onClick={onForget}>Borrar lecturas recordadas</Button> : null}
          </div>
        ) : null}

        {candidates.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {candidates.map((candidate, index) => (
              <CandidateCard
                key={`${candidate.card.id}-${index}`}
                candidate={candidate}
                isBest={index === 0}
                isInSession={sessionCardIds.has(candidate.card.id)}
                onAdd={() => onChoose(candidate, remember)}
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
            Revisá la colección y el número antes de sumar la carta. Todavía no confirmamos la edición.
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
