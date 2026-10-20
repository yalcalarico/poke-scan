export type RecoveryViewSnapshot = {
  mode: 'request' | 'link' | 'invalid' | 'unavailable' | 'blocked';
  token: string | null;
};

type RecoveryManager = {
  snapshot: () => RecoveryViewSnapshot;
  startRequest: () => void;
  inspectEntry: () => void;
};

declare global {
  interface Window {
    __pcsRecoveryManager?: RecoveryManager;
  }
}

const REQUEST_SNAPSHOT: RecoveryViewSnapshot = { mode: 'request', token: null };

export function getServerRecoverySnapshot(): RecoveryViewSnapshot {
  return REQUEST_SNAPSHOT;
}

export function getRecoverySnapshot(): RecoveryViewSnapshot {
  return typeof window === 'undefined'
    ? REQUEST_SNAPSHOT
    : window.__pcsRecoveryManager?.snapshot() ?? REQUEST_SNAPSHOT;
}

export function subscribeRecoveryView(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('pcs:recovery-view', listener);
  return () => window.removeEventListener('pcs:recovery-view', listener);
}

export function startRecoveryRequest(): void {
  if (typeof window !== 'undefined') window.__pcsRecoveryManager?.startRequest();
}
