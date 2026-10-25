import { describe, expect, it } from 'vitest';
import type { VisualIdentifyResponseDto } from '@/types/api';
import {
  addDiagnosticReading, appendDiagnosticEvent, beginDiagnosticOperation, confirmDiagnosticIdentity, createDiagnosticSession, endDiagnosticOperation,
  estimateDataUrlBytes, failDiagnosticRecognition, finalizeDiagnosticSession, receiveDiagnosticPrediction, selectDiagnosticAlternative,
} from '../diagnostic-session';
import type { CaptureReview } from '../capture-review';

const card = (id: string, name = id) => ({
  id, name, supertype: 'Pokémon', subtypes: [], hp: null, types: [], number: '1', rarity: null,
  artist: null, setId: 'set-a', set: { id: 'set-a', name: 'Set A', series: null, printedTotal: 10, total: 10, releaseDate: null, logoUrl: null, symbolUrl: null },
  imageSmall: '', imageLarge: '',
});
const result: VisualIdentifyResponseDto = {
  candidates: [{ card: card('model-a'), similarity: 0.91, retrievalRank: 1 }, { card: card('model-b'), similarity: 0.8, retrievalRank: 2 }],
  retrievalLimit: 8, references: 100, indexVersion: 'v1', indexStale: false, collections: 1,
  indexMs: 1, cold: false, modelMs: 2, inferenceMs: 2, totalMs: 3,
};
const review = (runId = 1, image = 'data:image/png;base64,YQ=='): CaptureReview => ({
  image, source: 'camera', capturedAt: '2026-10-24T12:00:00.000Z', runId, result, error: null,
});

describe('diagnostic session', () => {
  it('preserves initial response, separates provisional choices, and tracks confirmed identity transitions', () => {
    const session = createDiagnosticSession({ id: 'set-a', name: 'Set A' });
    const reading = addDiagnosticReading(session, review())!;
    expect(reading.initial?.id).toBe('model-a');
    selectDiagnosticAlternative(session, reading.id, 'model-b');
    expect(reading.provisional?.id).toBe('model-b');
    expect(reading.confirmedCorrection).toBe(false);
    confirmDiagnosticIdentity(session, reading.id, { id: 'model-b', name: 'model-b', setId: 'set-a', setName: 'Set A', number: '1' }, 'model', 2);
    confirmDiagnosticIdentity(session, reading.id, { id: 'model-b', name: 'model-b', setId: 'set-a', setName: 'Set A', number: '1' }, 'model', 2);
    expect(reading.correctionHistory.map((item) => item.id)).toEqual(['model-b']);
    expect(reading.events.filter((event) => event.type === 'identity_confirmed')).toHaveLength(2);
    confirmDiagnosticIdentity(session, reading.id, { id: 'model-a', name: 'model-a', setId: 'set-a', setName: 'Set A', number: '1' });
    expect(reading.final?.id).toBe('model-a');
    expect(reading.confirmedCorrection).toBe(true);
    expect(reading.correctionHistory.map((item) => item.id)).toEqual(['model-b', 'model-a']);
    expect(session.expectedSet.name).toBe('Set A');
  });

  it('starts before prediction, records callbacks and failures, and budgets encoded crop payload bytes', () => {
    const session = createDiagnosticSession();
    const reading = addDiagnosticReading(session, { ...review(), result: null })!;
    expect(reading.events.map((event) => event.type)).toEqual(['crop_sent']);
    receiveDiagnosticPrediction(session, reading.id, result);
    expect(reading.initial?.id).toBe('model-a');
    expect(reading.result).not.toBe(result);
    expect(Object.isFrozen(reading.result)).toBe(true);
    expect(reading.events.at(-1)?.type).toBe('prediction_received');
    const failed = addDiagnosticReading(session, { ...review(2), result: null })!;
    failDiagnosticRecognition(session, failed.id, 'Cancelada', true);
    expect(failed.events.at(-1)?.type).toBe('recognition_cancelled');
    expect(estimateDataUrlBytes('data:image/png;base64,YQ==')).toBe(4);
  });

  it('rejects excess readings while retaining event updates and freezes on finalization', () => {
    const session = createDiagnosticSession();
    const reading = addDiagnosticReading(session, review())!;
    for (let i = 2; i <= 30; i += 1) expect(addDiagnosticReading(session, review(i))).not.toBeNull();
    expect(addDiagnosticReading(session, review(31))).toBeNull();
    expect(session.suspended).toBe(true);
    appendDiagnosticEvent(session, reading.id, 'comparison_opened');
    expect(reading.events.at(-1)?.type).toBe('comparison_opened');
    const frozen = finalizeDiagnosticSession(session);
    expect(Object.isFrozen(frozen.readings[0].events)).toBe(true);
    expect(() => appendDiagnosticEvent(session, reading.id, 'saved')).toThrow(/cerrado/);
  });

  it('refuses finalization while camera work is pending, including while options are open', () => {
    const session = createDiagnosticSession();
    beginDiagnosticOperation(session);
    expect(() => finalizeDiagnosticSession(session)).toThrow(/pendientes/);
    expect(session.finalized).toBe(false);
    endDiagnosticOperation(session);
    const reading = addDiagnosticReading(session, { ...review(), result: null });
    expect(() => finalizeDiagnosticSession(session)).toThrow(/pendientes/);
    receiveDiagnosticPrediction(session, reading!.id, result);
    expect(() => finalizeDiagnosticSession(session)).not.toThrow();
  });

  it('derives a manual confirmation rank only when the identity was in the original candidates', () => {
    const session = createDiagnosticSession();
    const reading = addDiagnosticReading(session, review())!;
    confirmDiagnosticIdentity(session, reading.id, { id: 'model-b', name: 'model-b', setId: 'set-a', setName: 'Set A', number: '1' }, 'manual');
    expect(reading.events.at(-1)?.rank).toBe(2);
    confirmDiagnosticIdentity(session, reading.id, { id: 'outside', name: 'outside', setId: 'set-b', setName: 'Set B', number: '1' }, 'manual');
    expect(reading.events.at(-1)?.rank).toBeNull();
  });
});
