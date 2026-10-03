const HAS_SESSION_KEY = 'pcs.hasSession';
let accessToken: string | null = null;

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

export function setTokens(access: string): void {
  accessToken = access;
  sessionFlag(true);
}

export function clearTokens(): void {
  accessToken = null;
  sessionFlag(false);
}

export function hasSession(): boolean {
  return sessionFlag() || accessToken !== null;
}
