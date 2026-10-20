import { toCardDto, toPriceList } from '@/lib/api/schema';
import type { CardCondition, CardVariant, RecognizedCard } from '@/types/api';
import type { SessionEntry } from './types';

export const SESSION_DRAFT_KEY = 'pcs.scanDraft';
export const SESSION_DRAFT_VERSION = 1;
export const MAX_DRAFT_QUANTITY = 999;

export interface DraftAllocation {
  id: string;
  runId: number;
  cardId: string;
  variant: CardVariant | null;
  variantReviewed: boolean;
  condition: CardCondition | null;
  conditionReviewed: boolean;
  quantity: number;
  reviewed: boolean;
}
export interface DraftOperation {
  id: string;
  userId: string;
  collectionId: string;
  payload: { cardId: string; variant: CardVariant; condition: CardCondition; quantity: number };
  allocationIds: string[];
  status: 'saving' | 'uncertain' | 'confirmed' | 'blocked' | 'rejected';
  message?: string;
}
export interface SessionDraft {
  schemaVersion: 1;
  sessionId: string;
  entries: SessionEntry[];
  ownerUserId: string | null;
  selectedCollectionId: string | null;
  destinationConfirmed: boolean;
  allocations: DraftAllocation[];
  operations: DraftOperation[];
  retiredRunIds: number[];
  /** Un esquema ilegible conserva el storage original y nunca habilita altas. */
  recoveryBlocked?: string;
}

const variants: CardVariant[] = ['normal', 'holofoil', 'reverseHolofoil', 'firstEditionNormal', 'firstEditionHolofoil', 'firstEdition', 'unlimited', 'unlimitedHolofoil'];
const conditions: CardCondition[] = ['NM', 'LP', 'MP', 'HP', 'DM'];
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const quantity = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_DRAFT_QUANTITY;

/** Proyección de datos de catálogo; nunca copia fotos ni campos ajenos al candidato. */
export function sanitizeSessionEntries(value: unknown): SessionEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: SessionEntry[] = [];
  const seen = new Set<number>();
  for (const raw of value) {
    if (!isObject(raw) || typeof raw.runId !== 'number' || !Number.isSafeInteger(raw.runId) || raw.runId < 1 || seen.has(raw.runId)
      || !isObject(raw.candidate) || !isObject(raw.candidate.card)) continue;
    const candidate = raw.candidate;
    const card = candidate.card as Record<string, unknown>;
    if (!text(card.id) || !text(card.name) || !text(card.setId)) continue;
    seen.add(raw.runId);
    const parsedCard = toCardDto(card);
    if (!parsedCard) continue;
    const imageUrl = (url: string) => url.startsWith('data:') || url.startsWith('blob:') ? '' : url;
    const projected: RecognizedCard = {
      card: { ...parsedCard, imageSmall: imageUrl(parsedCard.imageSmall), imageLarge: imageUrl(parsedCard.imageLarge) },
      score: raw.selectionSource !== 'manual' && typeof candidate.score === 'number' && Number.isFinite(candidate.score) ? candidate.score : 0,
      rawScore: raw.selectionSource !== 'manual' && typeof candidate.rawScore === 'number' && Number.isFinite(candidate.rawScore) ? candidate.rawScore : 0,
      price: null,
      prices: toPriceList({ prices: candidate.prices }).filter((price) => price.cardId === parsedCard.id),
    };
    entries.push({ runId: raw.runId, candidate: projected, ...(raw.identityReviewed === true ? { identityReviewed: true } : {}), ...(raw.selectionSource === 'manual' || raw.selectionSource === 'visual' ? { selectionSource: raw.selectionSource } : {}) });
  }
  return entries;
}

export function createSessionDraft(entries: readonly SessionEntry[], sessionId = crypto.randomUUID()): SessionDraft {
  const safeEntries = sanitizeSessionEntries(entries);
  return { schemaVersion: 1, sessionId, entries: safeEntries, ownerUserId: null, selectedCollectionId: null, destinationConfirmed: false,
    allocations: safeEntries.map((entry) => ({ id: crypto.randomUUID(), runId: entry.runId, cardId: entry.candidate.card.id,
      variant: null, variantReviewed: false, condition: null, conditionReviewed: false, quantity: 1, reviewed: entry.identityReviewed === true })), operations: [], retiredRunIds: [] };
}

function protectedDraft(entries: readonly SessionEntry[], reason: string): SessionDraft {
  return { ...createSessionDraft(entries), recoveryBlocked: reason };
}

/** Un dato inválido bloquea el snapshot; jamás se descarta evidencia de un intento. */
export function parseSessionDraft(value: unknown, legacyEntries: readonly SessionEntry[]): SessionDraft | null {
  if (Array.isArray(value)) return createSessionDraft(legacyEntries);
  if (!isObject(value)) return null;
  if (value.schemaVersion !== SESSION_DRAFT_VERSION) return protectedDraft(legacyEntries, 'Este borrador usa otra versión. Lo conservamos sin modificar y no enviamos altas.');
  const entries = 'entries' in value ? sanitizeSessionEntries(value.entries) : sanitizeSessionEntries(legacyEntries);
  const invalid = () => protectedDraft(entries, 'No pudimos validar el borrador anterior. Conservamos el original y bloqueamos los envíos.');
  if (!text(value.sessionId) || !Array.isArray(value.allocations) || !Array.isArray(value.operations)
    || ('entries' in value && (!Array.isArray(value.entries) || value.entries.length !== entries.length))) return invalid();
  const runs = new Map(entries.map((entry) => [entry.runId, entry.candidate.card.id]));
  const allocations: DraftAllocation[] = [];
  for (const raw of value.allocations) {
    if (!isObject(raw) || !text(raw.id) || typeof raw.runId !== 'number' || !runs.has(raw.runId) || raw.cardId !== runs.get(raw.runId)
      || !quantity(raw.quantity) || allocations.some((allocation) => allocation.id === raw.id)
      || (raw.variant !== null && !variants.includes(raw.variant as CardVariant)) || (raw.condition !== null && !conditions.includes(raw.condition as CardCondition))
      || typeof raw.reviewed !== 'boolean' || typeof raw.variantReviewed !== 'boolean' || typeof raw.conditionReviewed !== 'boolean') return invalid();
    allocations.push({ id: raw.id, runId: raw.runId, cardId: String(raw.cardId), quantity: raw.quantity,
      variant: raw.variant as CardVariant | null, variantReviewed: raw.variantReviewed,
      condition: raw.condition as CardCondition | null, conditionReviewed: raw.conditionReviewed, reviewed: raw.reviewed });
  }
  const operations: DraftOperation[] = [];
  const locked = new Set<string>();
  for (const raw of value.operations) {
    if (!isObject(raw) || !text(raw.id) || !uuid.test(raw.id) || !text(raw.userId) || !text(raw.collectionId)
      || !Array.isArray(raw.allocationIds) || !raw.allocationIds.length || raw.allocationIds.some((id) => !text(id))
      || new Set(raw.allocationIds).size !== raw.allocationIds.length || !isObject(raw.payload)
      || operations.some((operation) => operation.id === raw.id)) return invalid();
    const p = raw.payload;
    if (!text(p.cardId) || !variants.includes(p.variant as CardVariant) || !conditions.includes(p.condition as CardCondition) || !quantity(p.quantity)
      || !['saving', 'uncertain', 'confirmed', 'blocked', 'rejected'].includes(String(raw.status))) return invalid();
    const allocationIds = raw.allocationIds as string[];
    const status = raw.status as DraftOperation['status'];
    if (status !== 'confirmed') {
      const included = allocations.filter((allocation) => allocationIds.includes(allocation.id));
      if (included.length !== allocationIds.length || included.some((allocation) => allocation.cardId !== p.cardId
        || allocation.variant !== p.variant || allocation.condition !== p.condition) || included.reduce((sum, allocation) => sum + allocation.quantity, 0) !== p.quantity) return invalid();
      if (status !== 'rejected') {
        if (allocationIds.some((id) => locked.has(id))) return invalid();
        allocationIds.forEach((id) => locked.add(id));
      }
    } else if (allocationIds.some((id) => allocations.some((allocation) => allocation.id === id))) return invalid();
    operations.push({ id: raw.id, userId: raw.userId, collectionId: raw.collectionId,
      payload: { cardId: p.cardId, variant: p.variant as CardVariant, condition: p.condition as CardCondition, quantity: p.quantity },
      allocationIds, status: status === 'saving' ? 'uncertain' : status, message: typeof raw.message === 'string' ? raw.message : undefined });
  }
  const retiredRunIds = Array.isArray(value.retiredRunIds) ? value.retiredRunIds.filter((id): id is number => typeof id === 'number' && Number.isSafeInteger(id)) : [];
  if (allocations.some((allocation) => retiredRunIds.includes(allocation.runId))
    || entries.some((entry) => !retiredRunIds.includes(entry.runId) && !allocations.some((allocation) => allocation.runId === entry.runId))) return invalid();
  return { schemaVersion: 1, sessionId: value.sessionId, entries: entries.filter((entry) => !retiredRunIds.includes(entry.runId)),
    ownerUserId: text(value.ownerUserId) ? value.ownerUserId : null, selectedCollectionId: text(value.selectedCollectionId) ? value.selectedCollectionId : null,
    destinationConfirmed: value.destinationConfirmed === true, allocations, operations, retiredRunIds };
}

export function readSessionDraft(entries: readonly SessionEntry[]): SessionDraft | null {
  let raw: string | null;
  try { raw = sessionStorage.getItem(SESSION_DRAFT_KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    // El legado vive en pcs.scanSession; un array en esta clave no demuestra ausencia de intentos.
    if (Array.isArray(parsed)) return protectedDraft(entries, 'El borrador anterior no tiene un snapshot válido. Conservamos el original sin enviar altas.');
    return parseSessionDraft(parsed, entries) ?? protectedDraft(entries, 'El borrador anterior no es válido. Conservamos el original sin enviar altas.');
  }
  catch { return protectedDraft(entries, 'El borrador anterior está dañado. Conservamos el original sin enviar altas.'); }
}

export function writeSessionDraft(draft: SessionDraft): boolean {
  if (draft.recoveryBlocked) return false;
  try { sessionStorage.setItem(SESSION_DRAFT_KEY, JSON.stringify({ ...draft, entries: sanitizeSessionEntries(draft.entries) })); return true; }
  catch { return false; }
}

export function lockedAllocationIds(draft: SessionDraft): Set<string> {
  return new Set(draft.recoveryBlocked ? draft.allocations.map((allocation) => allocation.id)
    : draft.operations.filter((operation) => operation.status !== 'confirmed' && operation.status !== 'rejected').flatMap((operation) => operation.allocationIds));
}

/** Sincroniza capturas deliberadas; no recrea partes retiradas ni cambia intentos inmutables. */
export function syncDraftEntries(draft: SessionDraft, incoming: readonly SessionEntry[]): SessionDraft {
  if (draft.recoveryBlocked) return draft;
  const locked = lockedAllocationIds(draft);
  const protectedRuns = new Set(draft.allocations.filter((allocation) => locked.has(allocation.id)).map((allocation) => allocation.runId));
  const entries = sanitizeSessionEntries(incoming).filter((entry) => !draft.retiredRunIds.includes(entry.runId));
  for (const entry of draft.entries) if (protectedRuns.has(entry.runId)) {
    const index = entries.findIndex((item) => item.runId === entry.runId);
    if (index < 0) entries.push(entry); else entries[index] = entry;
  }
  const allocations = entries.flatMap((entry) => {
    const previous = draft.allocations.filter((allocation) => allocation.runId === entry.runId);
    if (!previous.length) return createSessionDraft([entry]).allocations;
    return previous.map((allocation) => allocation.cardId === entry.candidate.card.id ? (entry.identityReviewed ? { ...allocation, reviewed: true } : allocation) : {
      ...allocation, cardId: entry.candidate.card.id, variant: null, variantReviewed: false, condition: null, conditionReviewed: false, reviewed: entry.identityReviewed === true,
    });
  });
  const removedRuns = draft.entries.filter((entry) => !entries.some((item) => item.runId === entry.runId)).map((entry) => entry.runId);
  return { ...draft, entries, allocations, retiredRunIds: [...new Set([...draft.retiredRunIds, ...removedRuns])] };
}

export function groupAllocations(allocations: readonly DraftAllocation[]): DraftAllocation[][] {
  const groups = new Map<string, DraftAllocation[]>();
  for (const allocation of allocations) {
    const key = `${allocation.cardId}\u0000${allocation.variant ?? ''}\u0000${allocation.condition ?? ''}`;
    groups.set(key, [...(groups.get(key) ?? []), allocation]);
  }
  return [...groups.values()];
}
export function isAllocationReady(allocation: DraftAllocation): boolean {
  return Boolean(allocation.variant && allocation.condition && allocation.variantReviewed && allocation.conditionReviewed && allocation.reviewed);
}
export function readyAllocationGroups(draft: SessionDraft): DraftAllocation[][] {
  const locked = lockedAllocationIds(draft);
  return groupAllocations(draft.allocations.filter((allocation) => isAllocationReady(allocation) && !locked.has(allocation.id)))
    .filter((group) => group.reduce((sum, allocation) => sum + allocation.quantity, 0) <= MAX_DRAFT_QUANTITY);
}

/** Confirmación y retiro se escriben juntos; la cantidad devuelta por el ítem no es el delta. */
export function settleDraftOperation(draft: SessionDraft, id: string, status: DraftOperation['status'], message?: string): SessionDraft {
  const operation = draft.operations.find((item) => item.id === id);
  if (!operation) return draft;
  const allocations = status === 'confirmed' ? draft.allocations.filter((allocation) => !operation.allocationIds.includes(allocation.id)) : draft.allocations;
  const retired = status === 'confirmed' ? draft.allocations.filter((allocation) => operation.allocationIds.includes(allocation.id)
    && !allocations.some((remaining) => remaining.runId === allocation.runId)).map((allocation) => allocation.runId) : [];
  return { ...draft, allocations, retiredRunIds: [...new Set([...draft.retiredRunIds, ...retired])],
    entries: draft.entries.filter((entry) => !retired.includes(entry.runId)),
    operations: draft.operations.map((item) => item.id === id ? { ...item, status, message } : item) };
}
