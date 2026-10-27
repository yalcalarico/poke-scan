import { describe, expect, it, vi } from 'vitest';
import { toPriceList } from '@/lib/api/schema';
import { createSessionDraft, sanitizeSessionEntries, groupAllocations, lockedAllocationIds, parseSessionDraft, readSessionDraft, readyAllocationGroups, writeSessionDraft, SESSION_DRAFT_KEY } from '../session-draft';
import type { SessionEntry } from '../types';

const scans: SessionEntry[] = [
  { runId: 1, candidate: { card: { id: 'card-a', name: 'Carta A', setId: 'set-a' } } as SessionEntry['candidate'] },
  { runId: 2, candidate: { card: { id: 'card-a', name: 'Carta A', setId: 'set-a' } } as SessionEntry['candidate'] },
];

describe('draft versionado del escáner', () => {
  it('conserva el array ya parseado del DTO real de precios en múltiples sanitizaciones', () => {
    const apiResponse = { card: scans[0]!.candidate.card, prices: [
      { cardId: 'card-a', variant: 'normal', market: 10, currency: 'USD', provider: 'tcgcsv', source: 'tcgplayer', fetchedAt: '2026-10-07T12:00:00Z' },
      { cardId: 'card-a', variant: 'holofoil', market: 100, currency: 'USD', provider: 'tcgcsv', source: 'tcgplayer', fetchedAt: '2026-10-07T12:00:00Z' },
      { cardId: 'card-a', variant: 'reverseHolofoil', market: 5, currency: 'USD', provider: 'tcgcsv', source: 'tcgplayer', fetchedAt: '2026-10-07T12:00:00Z' },
      { cardId: 'card-a', variant: 'firstEditionNormal', market: 0, provider: 'tcgcsv' },
      { cardId: 'card-a', variant: 'unlimited', market: null, provider: 'tcgcsv' },
      { cardId: 'card-a', variant: 'normal', market: 9999, provider: 'tcgdex', source: 'tcgplayer', currency: 'USD', fetchedAt: '2026-10-07T12:00:00Z' },
      { cardId: 'card-ajena', variant: 'normal', market: 9999 },
      { cardId: 'card-a', variant: 'variante-corrupta', market: 9999 },
    ] };
    // La API entrega un envelope; RecognizedCard guarda el array ya validado.
    let entries: SessionEntry[] = [{ ...scans[0]!, candidate: { ...scans[0]!.candidate, prices: toPriceList(apiResponse) } }];
    for (let round = 0; round < 5; round++) {
      entries = sanitizeSessionEntries(JSON.parse(JSON.stringify(entries)) as unknown);
      expect(entries[0]!.candidate.prices?.map(({ variant, market }) => ({ variant, market }))).toEqual([
        { variant: 'normal', market: 10 }, { variant: 'holofoil', market: 100 }, { variant: 'reverseHolofoil', market: 5 },
        { variant: 'firstEditionNormal', market: 0 }, { variant: 'unlimited', market: null },
      ]);
      expect(entries[0]!.candidate.prices?.every((price) => price.cardId === 'card-a')).toBe(true);
    }
    const draft = createSessionDraft(entries, 'precios-reales');
    expect(draft.allocations[0]).toMatchObject({ variant: 'normal', condition: 'NM', reviewed: true });
    expect(parseSessionDraft(JSON.parse(JSON.stringify(draft)) as unknown, [])?.entries[0]?.candidate.prices).toEqual(entries[0]!.candidate.prices);
  });

  it('migra entradas legacy con condición NM e identidad aceptada automáticamente', () => {
    const draft = parseSessionDraft([{ runId: 1 }, { runId: 2 }], scans);
    expect(draft?.allocations).toHaveLength(2);
    expect(draft?.allocations.every((item) => item.variant === null && item.condition === 'NM' && item.reviewed)).toBe(true);
  });

  it('divide grupos mayores a 999 en partes sin perder asignaciones', () => {
    const draft = createSessionDraft(scans, 'large');
    draft.allocations = draft.allocations.map((item, index) => ({ ...item, variant: 'normal', condition: 'NM', quantity: index ? 501 : 999 }));
    const groups = readyAllocationGroups(draft);
    expect(groups.map((group) => group.reduce((sum, item) => sum + item.quantity, 0))).toEqual([999, 501]);
    expect(groups.flat().map((item) => item.id).sort()).toEqual(draft.allocations.map((item) => item.id).sort());
  });

  it('agrupa solo por carta, variante y condición', () => {
    const draft = createSessionDraft(scans, 'session');
    const allocations = draft.allocations.map((item, index) => ({ ...item,
      variant: index === 0 ? 'normal' as const : 'reverseHolofoil' as const, condition: 'NM' as const }));
    expect(groupAllocations(allocations)).toHaveLength(2);
    expect(groupAllocations([{ ...allocations[0], condition: 'LP' }, allocations[0]])).toHaveLength(2);
  });

  it('bloquea una operación con clave inválida y no habilita un alta nueva', () => {
    const fresh = createSessionDraft(scans, 'session');
    const malformed = { ...fresh, operations: [{ id: 'not-a-uuid', userId: 'user', collectionId: 'collection',
      payload: { cardId: 'card-a', variant: 'normal', condition: 'NM', quantity: 1 },
      allocationIds: [fresh.allocations[0]?.id], status: 'uncertain' }] };
    const restored = parseSessionDraft(malformed, scans);
    expect(restored?.recoveryBlocked).toBeTruthy();
    expect(readyAllocationGroups(restored!)).toEqual([]);
  });

  it('no persiste imágenes ni acepta un allocation con carta o cantidad inconsistente', () => {
    const fresh = createSessionDraft(scans, 'session');
    const raw = { ...fresh, allocations: [{ ...fresh.allocations[0], cardId: 'otra', quantity: 1000, image: 'data:image/png;base64,secret' }] };
    const serialized = JSON.stringify(raw);
    const restored = parseSessionDraft(JSON.parse(serialized) as unknown, scans);
    expect(restored?.recoveryBlocked).toBeTruthy();
    expect(JSON.stringify(restored)).not.toContain('data:image');
  });

  it('un draft JSON roto bloquea las lecturas restauradas en vez de convertirlas en altas', () => {
    vi.stubGlobal('sessionStorage', { getItem: () => '{', setItem: () => undefined });
    const restored = readSessionDraft(scans);
    expect(SESSION_DRAFT_KEY).toBe('pcs.scanDraft');
    expect(restored?.recoveryBlocked).toBeTruthy();
    expect(lockedAllocationIds(restored!).size).toBe(scans.length);
    expect(writeSessionDraft(restored!)).toBe(false);
    vi.unstubAllGlobals();
  });
});
