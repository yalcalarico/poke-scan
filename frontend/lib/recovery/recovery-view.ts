export type RecoveryViewSnapshot = {
  mode: 'request' | 'link' | 'invalid' | 'unavailable' | 'blocked';
  token: string | null;
  entry: number;
};

type RecoveryManager = {
  snapshot: () => RecoveryViewSnapshot;
  startRequest: () => void;
  discardLink: () => void;
  inspectEntry: () => void;
};

declare global {
  interface Window {
    __pcsRecoveryManager?: RecoveryManager;
  }
}

const REQUEST_SNAPSHOT: RecoveryViewSnapshot = { mode: 'request', token: null, entry: 0 };
const BLOCKED_SNAPSHOT: RecoveryViewSnapshot = { mode: 'blocked', token: null, entry: 0 };
const UNAVAILABLE_SNAPSHOT: RecoveryViewSnapshot = { mode: 'unavailable', token: null, entry: 0 };

export function getServerRecoverySnapshot(): RecoveryViewSnapshot {
  return REQUEST_SNAPSHOT;
}

export function getRecoverySnapshot(): RecoveryViewSnapshot {
  if (typeof window === 'undefined') return REQUEST_SNAPSHOT;
  if (window.__pcsRecoveryManager) return window.__pcsRecoveryManager.snapshot();
  // Si no arrancó la captura, un fragmento presente no habilita ningún POST.
  if (window.location.hash) return BLOCKED_SNAPSHOT;
  return window.history.state?.pcsRecoveryView === 'link' ? UNAVAILABLE_SNAPSHOT : REQUEST_SNAPSHOT;
}

export function subscribeRecoveryView(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('pcs:recovery-view', listener);
  return () => window.removeEventListener('pcs:recovery-view', listener);
}

export function startRecoveryRequest(): void {
  if (typeof window !== 'undefined') window.__pcsRecoveryManager?.startRequest();
}

export function discardRecoveryLink(): void {
  if (typeof window !== 'undefined') window.__pcsRecoveryManager?.discardLink();
}
