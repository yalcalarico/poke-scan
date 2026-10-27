// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createSessionDraft, lockedAllocationIds, parseSessionDraft, readSessionDraft, readyAllocationGroups, settleDraftOperation, syncDraftEntries, writeSessionDraft, type DraftOperation } from '../session-draft';
import { clearSession, readMaxSessionRunId, readSession, writeSession } from '../session-storage';
import { scan, uxTwentyDraft } from './draft-fixture';

beforeEach(() => sessionStorage.clear());

function operationFor(draft: ReturnType<typeof createSessionDraft>): DraftOperation {
  const group = readyAllocationGroups(draft)[0]!;
  const first = group[0]!;
  return { id: crypto.randomUUID(), userId: 'user-1', collectionId: 'collection-1', payload: { cardId: first.cardId, variant: first.variant!, condition: first.condition!, quantity: group.reduce((sum, allocation) => sum + allocation.quantity, 0) }, allocationIds: group.map((allocation) => allocation.id), status: 'uncertain' };
}
function prepared() {
  const draft = createSessionDraft([scan(7)]);
  draft.allocations = draft.allocations.map((allocation) => ({ ...allocation, reviewed: true, variant: 'normal', variantReviewed: true, condition: 'NM', conditionReviewed: true }));
  draft.ownerUserId = 'user-1'; draft.selectedCollectionId = 'collection-1'; draft.destinationConfirmed = true;
  return draft;
}

describe('consistencia del snapshot FE-01', () => {
  it('fixture de sesión larga: confirma y retira incrementos sin perder pendientes', () => {
    const { original, draft: initial } = uxTwentyDraft();
    let draft = initial;
    expect(original).toHaveLength(20);
    expect(draft.allocations.reduce((sum, allocation) => sum + allocation.quantity, 0)).toBe(23);
    const groups = readyAllocationGroups(draft);
    expect(groups.flat().reduce((sum, allocation) => sum + allocation.quantity, 0)).toBe(22);
    for (const group of groups) {
      const first = group[0]!;
      const operation: DraftOperation = { id: crypto.randomUUID(), userId: 'user-1', collectionId: 'collection-1', allocationIds: group.map((allocation) => allocation.id),
        payload: { cardId: first.cardId, variant: first.variant!, condition: first.condition!, quantity: group.reduce((sum, allocation) => sum + allocation.quantity, 0) }, status: 'saving' };
      draft = { ...draft, operations: [...draft.operations, operation] };
      draft = settleDraftOperation(draft, operation.id, first.cardId === 'B' && first.variant === 'reverseHolofoil' ? 'rejected' : first.cardId === 'F' ? 'uncertain' : 'confirmed');
    }
    const copies = (status: DraftOperation['status']) => draft.operations.filter((operation) => operation.status === status).reduce((sum, operation) => sum + operation.payload.quantity, 0);
    expect(copies('confirmed')).toBe(16); expect(copies('rejected')).toBe(3); expect(copies('uncertain')).toBe(3);
    expect(draft.allocations.reduce((sum, allocation) => sum + allocation.quantity, 0)).toBe(7);
    expect(readyAllocationGroups(draft).flat().reduce((sum, allocation) => sum + allocation.quantity, 0)).toBe(3);
    expect(draft.allocations.filter((allocation) => allocation.runId === 7).map((allocation) => allocation.quantity)).toEqual([1]);
    expect(draft.entries.some((entry) => entry.runId === 7)).toBe(true);
    expect(writeSessionDraft(draft)).toBe(true);
    // Aunque el legado conserva las 20 lecturas, la confirmación canónica no las resucita.
    sessionStorage.setItem('pcs.scanSession', JSON.stringify(original));
    const restored = readSessionDraft(original)!;
    expect(restored.recoveryBlocked).toBeUndefined();
    expect(restored.entries).toEqual(draft.entries);
    expect(restored.operations).toEqual(draft.operations);
    expect(restored.allocations.reduce((sum, allocation) => sum + allocation.quantity, 0)).toBe(7);
    expect(readyAllocationGroups(restored)).toEqual([]);
    expect(readSession()).toEqual(draft.entries);
    expect(writeSession(original)).toBe(true);
    expect(readSession()).toEqual(draft.entries);
    expect(readMaxSessionRunId()).toBe(20);
  });

  it.each(['payload', 'allocationIds', 'userId', 'collectionId', 'status'])('un intento con %s corrupto no libera altas ni sobrescribe la evidencia', (field) => {
    const draft = prepared();
    const operation = operationFor(draft);
    const raw = { ...draft, operations: [{ ...operation, [field]: field === 'allocationIds' ? [] : null }] };
    const stored = JSON.stringify(raw);
    sessionStorage.setItem('pcs.scanDraft', stored);
    const restored = readSessionDraft(draft.entries)!;
    expect(restored.recoveryBlocked).toBeTruthy();
    expect(lockedAllocationIds(restored).size).toBe(restored.allocations.length);
    expect(readyAllocationGroups(restored)).toEqual([]);
    expect(writeSessionDraft(restored)).toBe(false);
    expect(writeSession(draft.entries)).toBe(false);
    expect(sessionStorage.getItem('pcs.scanDraft')).toBe(stored);
    expect(clearSession()).toBe(false);
  });

  it('conserva una versión futura y el JSON dañado byte por byte', () => {
    for (const stored of ['{"schemaVersion":9,"unknown":"evidencia"}', '{', '[]']) {
      sessionStorage.setItem('pcs.scanDraft', stored);
      const restored = readSessionDraft([scan(1)])!;
      expect(restored.recoveryBlocked).toBeTruthy();
      expect(writeSessionDraft(restored)).toBe(false);
      expect(sessionStorage.getItem('pcs.scanDraft')).toBe(stored);
    }
  });

  it('saving restaura uncertain con cuenta, destino, UUID y payload originales', () => {
    const draft = prepared();
    const operation = { ...operationFor(draft), status: 'saving' as const };
    const restored = parseSessionDraft({ ...draft, operations: [operation] }, draft.entries)!;
    expect(restored.operations).toEqual([{ ...operation, status: 'uncertain' }]);
    expect(readyAllocationGroups(restored)).toEqual([]);
  });

  it('normaliza un intento rechazado antiguo al precio automático sin revivir el payload rechazado', () => {
    const item = scan(3);
    item.candidate.prices = [{ cardId: 'card-3', variant: 'holofoil', market: 12, currency: 'USD', source: 'tcgplayer', provider: 'tcgcsv', fetchedAt: '2026-10-01T00:00:00Z', low: null, mid: null, high: null }];
    const draft = createSessionDraft([item]);
    const allocation = draft.allocations[0]!;
    const rejected: DraftOperation = { id: crypto.randomUUID(), userId: 'user-1', collectionId: 'collection-1', allocationIds: [allocation.id],
      payload: { cardId: 'card-3', variant: 'normal', condition: 'LP', quantity: 1 }, status: 'rejected' };
    const restored = parseSessionDraft({ ...draft, allocations: [{ ...allocation, variant: 'normal', condition: 'LP' }], operations: [rejected] }, draft.entries)!;
    expect(restored.recoveryBlocked).toBeUndefined();
    expect(restored.allocations[0]).toMatchObject({ variant: 'holofoil', condition: 'NM' });
    expect(readyAllocationGroups(restored)[0]?.[0]).toMatchObject({ variant: 'holofoil', condition: 'NM' });
  });

  it('corrección/retirada y otra cuenta no cambian partes inciertas ni su payload', () => {
    const draft = prepared();
    const operation = operationFor(draft);
    draft.operations = [operation];
    const corrected = syncDraftEntries(draft, [scan(7, 'outside-top-eight')]);
    expect(corrected.entries).toEqual(draft.entries);
    expect(corrected.operations).toEqual([operation]);
    expect(syncDraftEntries(draft, []).allocations).toEqual(draft.allocations);
  });

  it('una captura nueva no hereda variante del mismo cardId; un grupo sobre999 se divide', () => {
    const draft = prepared();
    const next = syncDraftEntries(draft, [...draft.entries, scan(8, 'card-7')]);
    expect(next.allocations[1]).toMatchObject({ reviewed: true, variant: null, condition: 'NM' });
    next.allocations = next.allocations.map((allocation) => ({ ...allocation, reviewed: true, variant: 'normal', variantReviewed: true, condition: 'NM', conditionReviewed: true, quantity: 600 }));
    expect(readyAllocationGroups(next).map((group) => group.reduce((sum, allocation) => sum + allocation.quantity, 0))).toEqual([600, 600]);
    expect(next.allocations.reduce((sum, allocation) => sum + allocation.quantity, 0)).toBe(1200);
  });

  it('retiro parcial y confirmación final no reutilizan el runId después de recargar', () => {
    const draft = prepared();
    const first = { ...draft.allocations[0]!, quantity: 2 };
    const second = { ...first, id: crypto.randomUUID(), quantity: 1 };
    draft.allocations = [first, second];
    draft.operations = [{ id: crypto.randomUUID(), userId: 'user-1', collectionId: 'collection-1', allocationIds: [first.id],
      payload: { cardId: first.cardId, variant: 'normal', condition: 'NM', quantity: 2 }, status: 'saving' }];
    const partial = settleDraftOperation(draft, draft.operations[0]!.id, 'confirmed');
    expect(partial.entries.map((entry) => entry.runId)).toEqual([7]);
    partial.operations.push({ id: crypto.randomUUID(), userId: 'user-1', collectionId: 'collection-1', allocationIds: [second.id],
      payload: { cardId: second.cardId, variant: 'normal', condition: 'NM', quantity: 1 }, status: 'saving' });
    const complete = settleDraftOperation(partial, partial.operations[1]!.id, 'confirmed');
    writeSessionDraft(complete);
    expect(readSession()).toEqual([]);
    expect(readMaxSessionRunId()).toBe(7);
    expect(syncDraftEntries(complete, draft.entries).allocations).toEqual([]);
  });

  it('una corrección visual acepta identidad y asigna solo NM; variante sigue respaldada por precio', () => {
    const draft = createSessionDraft([scan(1)]);
    const corrected = syncDraftEntries(draft, [{ ...scan(1, 'corrected'), identityReviewed: true, selectionSource: 'visual' }]);
    expect(corrected.allocations[0]).toMatchObject({ cardId: 'corrected', reviewed: true, variant: null, variantReviewed: false, condition: 'NM', conditionReviewed: true });
    expect(readyAllocationGroups(corrected)).toEqual([]);
  });

  it('la selección manual no hereda score anterior ni campos extra/fotos de la entrada', () => {
    const raw = { ...scan(1), selectionSource: 'manual' as const, image: 'data:image/png;base64,private', candidate: { ...scan(1).candidate, score: 0.99, rawScore: 0.99, crop: 'blob:private' } };
    const draft = createSessionDraft([raw]);
    expect(draft.entries[0]).toMatchObject({ selectionSource: 'manual', candidate: { score: 0, rawScore: 0 } });
    expect(JSON.stringify(draft)).not.toContain('private');
  });

});
