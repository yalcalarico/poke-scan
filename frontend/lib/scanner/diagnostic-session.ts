import type { VisualIdentifyResponseDto } from '@/types/api';
import type { CaptureReview } from '@/lib/scanner/capture-review';

export const DIAGNOSTIC_MAX_READINGS = 30;
export const DIAGNOSTIC_MAX_CROP_BYTES = 64 * 1024 * 1024;

export type DiagnosticEventType =
  | 'crop_sent' | 'prediction_received' | 'recognition_failed' | 'recognition_cancelled'
  | 'comparison_opened' | 'alternative_selected' | 'manual_search_opened'
  | 'manual_result_confirmed' | 'identity_confirmed' | 'reading_discarded' | 'saved';

export interface DiagnosticCardIdentity {
  id: string;
  name: string;
  setId: string;
  setName: string | null;
  number: string;
}

export interface DiagnosticEvent {
  id: string;
  type: DiagnosticEventType;
  at: string;
  previousCardId: string | null;
  newCardId: string | null;
  source: 'model' | 'manual' | 'user' | 'system' | 'camera' | 'gallery' | null;
  rank: number | null;
  detail?: string;
}

export interface DiagnosticReading {
  id: string;
  runId: number;
  capturedAt: string;
  source: CaptureReview['source'];
  image: string;
  result: VisualIdentifyResponseDto | null;
  error: string | null;
  quality?: CaptureReview['quality'];
  initial: DiagnosticCardIdentity | null;
  provisional: DiagnosticCardIdentity | null;
  final: DiagnosticCardIdentity | null;
  initialRank: number | null;
  correctionHistory: DiagnosticCardIdentity[];
  confirmedCorrection: boolean;
  events: DiagnosticEvent[];
}

export interface DiagnosticSession {
  id: string;
  createdAt: string;
  expectedSet: { id: string | null; name: string | null };
  readings: DiagnosticReading[];
  acceptedCropBytes: number;
  suspended: boolean;
  finalized: boolean;
  pendingOperations: number;
  preparationFailures: number;
  preparationCancellations: number;
}

export type DiagnosticSessionSnapshot = Readonly<DiagnosticSession>;

function uuid(): string {
  return globalThis.crypto.randomUUID();
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function estimateDataUrlBytes(image: string): number {
  const base64 = /^data:image\/(?:png|jpeg|webp);base64,([\w+/]*={0,2})$/.exec(image)?.[1];
  if (!base64) throw new Error('El recorte no tiene un formato compatible.');
  // El cupo cubre lo que se transmite en la petición: el payload base64.
  return new TextEncoder().encode(base64).byteLength;
}

export function createDiagnosticSession(expectedSet?: { id?: string | null; name?: string | null }): DiagnosticSession {
  return {
    id: uuid(), createdAt: new Date().toISOString(),
    expectedSet: { id: expectedSet?.id ?? null, name: expectedSet?.name ?? null },
    readings: [], acceptedCropBytes: 0, suspended: false, finalized: false, pendingOperations: 0, preparationFailures: 0, preparationCancellations: 0,
  };
}

export function recordDiagnosticPreparationFailure(session: DiagnosticSession, cancelled = false): void {
  assertMutable(session);
  if (cancelled) session.preparationCancellations += 1;
  else session.preparationFailures += 1;
}

export function beginDiagnosticOperation(session: DiagnosticSession): void {
  assertMutable(session);
  session.pendingOperations += 1;
}

export function endDiagnosticOperation(session: DiagnosticSession): void {
  assertMutable(session);
  session.pendingOperations = Math.max(0, session.pendingOperations - 1);
}

export function diagnosticRankForIdentity(reading: DiagnosticReading, cardId: string): number | null {
  return reading.result?.candidates.find((candidate) => candidate.card.id === cardId)?.retrievalRank ?? null;
}

export function addDiagnosticReading(session: DiagnosticSession, review: CaptureReview): DiagnosticReading | null {
  assertMutable(session);
  const bytes = estimateDataUrlBytes(review.image);
  if (session.readings.length >= DIAGNOSTIC_MAX_READINGS || session.acceptedCropBytes + bytes > DIAGNOSTIC_MAX_CROP_BYTES) {
    session.suspended = true;
    return null;
  }
  const first = review.result?.candidates[0];
  const initial = first ? identity(first.card) : null;
  const reading: DiagnosticReading = {
    id: uuid(), runId: review.runId, capturedAt: review.capturedAt, source: review.source,
    image: review.image, result: review.result ? deepFreeze(clone(review.result)) : null,
    error: review.error, ...(review.quality ? { quality: clone(review.quality) } : {}),
    initial, provisional: initial, final: null, initialRank: first?.retrievalRank ?? null,
    correctionHistory: [], confirmedCorrection: false, events: [],
  };
  session.readings.push(reading);
  session.acceptedCropBytes += bytes;
  appendDiagnosticEvent(session, reading.id, 'crop_sent', { source: review.source });
  if (review.error) appendDiagnosticEvent(session, reading.id, 'recognition_failed', { detail: review.error, source: 'system' });
  else if (review.result) appendDiagnosticEvent(session, reading.id, 'prediction_received', { newCardId: initial?.id ?? null, source: review.source, rank: first?.retrievalRank ?? null });
  return reading;
}

/** Actualiza la lectura iniciada antes del await, sin modificar su ranking original luego. */
export function receiveDiagnosticPrediction(session: DiagnosticSession, readingId: string, result: VisualIdentifyResponseDto): void {
  const reading = mutableReading(session, readingId);
  if (reading.result || reading.error) return;
  const immutable = deepFreeze(clone(result));
  const first = immutable.candidates[0];
  reading.result = immutable;
  reading.initial = first ? identity(first.card) : null;
  reading.provisional = reading.initial ? clone(reading.initial) : null;
  reading.initialRank = first?.retrievalRank ?? null;
  appendDiagnosticEvent(session, readingId, 'prediction_received', { newCardId: reading.initial?.id ?? null, source: reading.source, rank: reading.initialRank });
}

export function failDiagnosticRecognition(session: DiagnosticSession, readingId: string, error: string, cancelled = false): void {
  const reading = mutableReading(session, readingId);
  if (reading.error) return;
  reading.error = error;
  appendDiagnosticEvent(session, readingId, cancelled ? 'recognition_cancelled' : 'recognition_failed', { detail: error, source: 'system' });
}

export function appendDiagnosticEvent(
  session: DiagnosticSession,
  readingId: string,
  type: DiagnosticEventType,
  metadata: Partial<Pick<DiagnosticEvent, 'previousCardId' | 'newCardId' | 'source' | 'rank' | 'detail'>> = {},
): DiagnosticEvent {
  assertMutable(session);
  const reading = getReading(session, readingId);
  const previousAt = reading.events.at(-1)?.at;
  const now = Date.now();
  const at = previousAt ? new Date(Math.max(now, Date.parse(previousAt) + 1)).toISOString() : new Date(now).toISOString();
  const event: DiagnosticEvent = {
    id: uuid(), type, at, previousCardId: metadata.previousCardId ?? null,
    newCardId: metadata.newCardId ?? null, source: metadata.source ?? null, rank: metadata.rank ?? null,
    ...(metadata.detail === undefined ? {} : { detail: metadata.detail }),
  };
  reading.events.push(event);
  return event;
}

export function selectDiagnosticAlternative(session: DiagnosticSession, readingId: string, cardId: string): void {
  const reading = mutableReading(session, readingId);
  const candidate = reading.result?.candidates.find((item) => item.card.id === cardId);
  if (!candidate) throw new Error('La alternativa no pertenece a esta lectura.');
  const previous = reading.provisional?.id ?? null;
  reading.provisional = identity(candidate.card);
  appendDiagnosticEvent(session, readingId, 'alternative_selected', {
    previousCardId: previous, newCardId: cardId, source: 'model', rank: candidate.retrievalRank,
  });
}

export function confirmDiagnosticIdentity(
  session: DiagnosticSession,
  readingId: string,
  card: DiagnosticCardIdentity,
  source: 'model' | 'manual' = 'model',
  rank: number | null = null,
): void {
  const reading = mutableReading(session, readingId);
  if (source === 'manual') rank = diagnosticRankForIdentity(reading, card.id);
  const previousFinalId = reading.final?.id ?? reading.initial?.id ?? null;
  reading.final = clone(card);
  const changed = card.id !== previousFinalId;
  if (changed) reading.correctionHistory.push(clone(card));
  reading.confirmedCorrection ||= changed;
  appendDiagnosticEvent(session, readingId, 'identity_confirmed', {
    previousCardId: previousFinalId, newCardId: card.id, source, rank,
  });
}

export function finalizeDiagnosticSession(session: DiagnosticSession): DiagnosticSessionSnapshot {
  if (!session.finalized) {
    if (session.pendingOperations > 0 || session.readings.some((reading) => !reading.result && !reading.error)) {
      throw new Error('Esperá a que terminen las lecturas pendientes antes de finalizar el diagnóstico.');
    }
    for (const reading of session.readings) reading.final = reading.final ? clone(reading.final) : null;
    session.finalized = true;
  }
  return deepFreeze(session);
}

export function snapshotDiagnosticSession(session: DiagnosticSession): DiagnosticSessionSnapshot {
  return deepFreeze(clone(session));
}

function identity(card: VisualIdentifyResponseDto['candidates'][number]['card']): DiagnosticCardIdentity {
  return { id: card.id, name: card.name, setId: card.setId, setName: card.set?.name ?? null, number: card.number };
}
function getReading(session: DiagnosticSession, id: string): DiagnosticReading {
  const reading = session.readings.find((item) => item.id === id);
  if (!reading) throw new Error('No encontramos esa lectura del diagnóstico.');
  return reading;
}
function assertMutable(session: DiagnosticSession): void {
  if (session.finalized) throw new Error('El diagnóstico ya está cerrado.');
}
function mutableReading(session: DiagnosticSession, id: string): DiagnosticReading {
  assertMutable(session);
  return getReading(session, id);
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
