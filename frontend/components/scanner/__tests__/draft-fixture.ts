import type { CardDto } from '@/types/api';
import { createSessionDraft, type DraftAllocation, type SessionDraft } from '../session-draft';
import type { SessionEntry } from '../types';

export function scan(runId: number, cardId = `card-${runId}`): SessionEntry {
  const card: CardDto = { id: cardId, name: `Carta ${runId}`, setId: 'set', number: String(runId), supertype: 'pokemon', subtypes: [], hp: null, types: [], rarity: null, artist: null, imageSmall: '', imageLarge: '' };
  return { runId, candidate: { card, score: 1, rawScore: 1, price: null, prices: [] } };
}

/** Las cantidades/atributos son acciones explícitas del fixture UX-01, nunca defaults. */
export function uxTwentyDraft(): { original: SessionEntry[]; draft: SessionDraft } {
  const original = Array.from({ length: 20 }, (_, index) => {
    const run = index + 1;
    const cardId = run <= 4 ? 'A' : run <= 7 ? 'B' : run === 8 ? 'C' : run === 9 ? 'D' : run === 10 ? 'E' : run <= 13 ? 'F' : run <= 16 ? 'G' : run <= 18 ? 'H' : 'I';
    return scan(run, cardId);
  });
  const draft = createSessionDraft(original, 'fixture-twenty');
  draft.ownerUserId = 'user-1';
  draft.selectedCollectionId = 'collection-1';
  draft.destinationConfirmed = true;
  draft.allocations = draft.allocations.flatMap<DraftAllocation>((allocation) => {
    const run = allocation.runId;
    const ready = { ...allocation, variant: 'normal' as const, variantReviewed: true, condition: 'NM' as const, conditionReviewed: true, reviewed: true };
    if (run === 17) return [];
    if (run === 3 || run === 4) return [{ ...ready, variant: 'holofoil' as const, condition: run === 4 ? 'LP' as const : 'NM' as const }];
    if (run === 5 || run === 6) return [{ ...ready, variant: 'reverseHolofoil' as const, condition: 'MP' as const }];
    if (run === 7) return [
      { ...ready, variant: 'reverseHolofoil' as const, condition: 'MP' as const },
      { ...ready, id: crypto.randomUUID(), variant: 'normal' as const, condition: 'LP' as const, quantity: 2 },
    ];
    if (run >= 11 && run <= 13) return [{ ...ready, condition: 'HP' as const }];
    if (run === 14) return [{ ...ready, condition: null, conditionReviewed: false }];
    if (run === 15) return [{ ...ready, variant: null, variantReviewed: false }];
    return [{ ...ready, quantity: run === 20 ? 3 : 1 }];
  });
  draft.entries = draft.entries.filter((entry) => entry.runId !== 17);
  draft.retiredRunIds = [17];
  return { original, draft };
}
