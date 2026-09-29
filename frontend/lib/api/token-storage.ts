const ACCESS_TOKEN_KEY = 'pcs.accessToken';
const REFRESH_TOKEN_KEY = 'pcs.refreshToken';
const HAS_SESSION_KEY = 'pcs.hasSession';

let accessToken: string | null = null;
let hydrated = false;

const isBrowser = () => typeof window !== 'undefined';

function hydrateAccessToken(): void {
  if (hydrated || !isBrowser()) return;
  hydrated = true;
  try {
    accessToken = window.sessionStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    accessToken = null;
  }
}

function readSessionStorage(key: string): string | null {
  if (!isBrowser()) return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSessionStorage(key: string, value: string): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    /* storage bloqueado (modo privado): el token sigue en memoria */
  }
}

function removeSessionStorage(key: string): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

function readLocalStorage(key: string): string | null {
  if (!isBrowser()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorage(key: string, value: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* noop */
  }
}

function removeLocalStorage(key: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

export function getAccessToken(): string | null {
  hydrateAccessToken();
  if (accessToken) return accessToken;
  accessToken = readSessionStorage(ACCESS_TOKEN_KEY);
  return accessToken;
}

export function getRefreshToken(): string | null {
  return readLocalStorage(REFRESH_TOKEN_KEY);
}

export function setTokens(access: string, refresh: string): void {
  accessToken = access;
  hydrated = true;
  writeSessionStorage(ACCESS_TOKEN_KEY, access);
  writeLocalStorage(REFRESH_TOKEN_KEY, refresh);
  writeLocalStorage(HAS_SESSION_KEY, 'true');
}

export function clearTokens(): void {
  accessToken = null;
  hydrated = true;
  removeSessionStorage(ACCESS_TOKEN_KEY);
  removeLocalStorage(REFRESH_TOKEN_KEY);
  removeLocalStorage(HAS_SESSION_KEY);
}

export function hasSession(): boolean {
  if (readLocalStorage(HAS_SESSION_KEY) === 'true') return true;
  return getRefreshToken() !== null;
}
