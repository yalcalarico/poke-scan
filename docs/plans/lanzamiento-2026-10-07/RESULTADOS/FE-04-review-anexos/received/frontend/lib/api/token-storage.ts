const HAS_SESSION_KEY = 'pcs.hasSession';
let accessToken: string | null = null;
let sessionEpoch = 0;

function sessionFlag(value?: boolean): boolean {
  if (typeof window === 'undefined') return false;
  try {
    // La migración elimina las credenciales que la versión anterior persistía.
    window.localStorage.removeItem('pcs.refreshToken');
    window.sessionStorage.removeItem('pcs.accessToken');
    if (value === true) window.localStorage.setItem(HAS_SESSION_KEY, 'true');
    if (value === false) window.localStorage.removeItem(HAS_SESSION_KEY);
    return window.localStorage.getItem(HAS_SESSION_KEY) === 'true';
  } catch {
    return accessToken !== null;
  }
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getSessionEpoch(): number {
  return sessionEpoch;
}

export function setTokens(access: string): number {
  accessToken = access;
  sessionFlag(true);
  sessionEpoch += 1;
  return sessionEpoch;
}

export function setRefreshedAccessToken(access: string, expectedEpoch: number): boolean {
  if (sessionEpoch !== expectedEpoch) return false;
  accessToken = access;
  sessionFlag(true);
  return true;
}

export function clearTokens(expectedEpoch?: number): boolean {
  if (expectedEpoch !== undefined && sessionEpoch !== expectedEpoch) return false;
  accessToken = null;
  sessionFlag(false);
  sessionEpoch += 1;
  return true;
}

export function hasSession(): boolean {
  return sessionFlag() || accessToken !== null;
}
