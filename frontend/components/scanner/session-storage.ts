import type { SessionEntry } from './types';
import { createSessionDraft, readSessionDraft, sanitizeSessionEntries, syncDraftEntries, writeSessionDraft } from './session-draft';

const SESSION_KEY = 'pcs.scanSession';

/** Al llegar al límite se organiza el lote; ninguna lectura anterior se descarta. */
export function normalizeSession<T>(entries: readonly T[]): T[] {
  return [...entries];
}
export function appendSessionEntry<T>(current: readonly T[], entry: T): T[] {
  return [...current, entry];
}

function readLegacy(): SessionEntry[] {
  try { return sanitizeSessionEntries(JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? '[]') as unknown); }
  catch { return []; }
}

/** La nueva clave es un snapshot único. La clave anterior solo se lee al migrar. */
export function readSession(): SessionEntry[] {
  const legacy = readLegacy();
  return readSessionDraft(legacy)?.entries ?? legacy;
}
export function writeSession(entries: readonly SessionEntry[]): boolean {
  const existing = readSessionDraft(readLegacy());
  const snapshot = existing ? syncDraftEntries(existing, entries) : createSessionDraft(entries);
  return writeSessionDraft(snapshot);
}

/** Un descarte nunca borra la evidencia de una escritura incierta. */
export function clearSession(): boolean {
  const existing = readSessionDraft(readLegacy());
  if (existing?.recoveryBlocked || existing?.operations.some((operation) => operation.status !== 'confirmed' && operation.status !== 'rejected')) return false;
  try {
    if (existing) {
      if (!writeSessionDraft(syncDraftEntries(existing, []))) return false;
    }
    sessionStorage.removeItem(SESSION_KEY);
    return true;
  } catch { return false; }
}
export function isRunProtected(runId: number): boolean {
  const draft = readSessionDraft(readLegacy());
  if (!draft) return false;
  if (draft.recoveryBlocked) return true;
  const ids = new Set(draft.operations.filter((operation) => operation.status !== 'confirmed' && operation.status !== 'rejected').flatMap((operation) => operation.allocationIds));
  return draft.allocations.some((allocation) => allocation.runId === runId && ids.has(allocation.id));
}

/** Evita reutilizar runId de una lectura retirada en la misma sesión. */
export function readMaxSessionRunId(): number {
  const draft = readSessionDraft(readLegacy());
  return Math.max(0, ...(draft?.entries ?? readLegacy()).map((entry) => entry.runId), ...(draft?.retiredRunIds ?? []));
}

export function sessionRecoveryNotice(): string | null {
  return readSessionDraft(readLegacy())?.recoveryBlocked ?? null;
}
