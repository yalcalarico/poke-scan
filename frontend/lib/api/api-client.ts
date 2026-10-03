import type { AuthResponseDto } from '@/types/api';
import { clearTokens, getAccessToken, hasSession, setTokens } from './token-storage';

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '') ?? 'http://localhost:3001/api';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Uso interno: marca el reintento post-refresh para cortar loops. */
  isRetry?: boolean;
  /** No adjuntar el Authorization header ni disparar refresh ante un 401. */
  skipAuth?: boolean;
}

interface ErrorBody {
  statusCode?: number;
  error?: string;
  message?: string | string[];
}

let refreshInFlight: Promise<AuthResponseDto | null> | null = null;

function extractErrorMessage(status: number, body: ErrorBody | null | undefined): string {
  const raw = body?.message;
  if (Array.isArray(raw)) return raw.join(', ');
  if (typeof raw === 'string' && raw.length > 0) return raw;
  if (typeof body?.error === 'string' && body.error.length > 0) return body.error;
  return `Request failed with status ${status}`;
}

async function parseBody<T>(response: Response): Promise<T | undefined> {
  if (response.status === 204 || response.status === 205) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

function redirectToLogin(): void {
  if (typeof window === 'undefined') return;
  if (window.location.pathname === '/login') return;
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign('/login');
}

/**
 * Single-flight: si ya hay un refresh en curso, se espera esa misma promesa
 * en lugar de disparar otro. El backend revoca todas las sesiones si detecta
 * reuso de un refresh token, así que dos refresh simultáneos = sesión perdida.
 */
export function refreshSession(): Promise<AuthResponseDto | null> {
  if (refreshInFlight) return refreshInFlight;

  const run = async (): Promise<AuthResponseDto | null> => {
    if (!hasSession()) return null;
    try {
      const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Session-Request': '1' },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        clearTokens();
        return null;
      }
      const data = await parseBody<AuthResponseDto>(response);
      if (!data?.accessToken) {
        clearTokens();
        return null;
      }
      setTokens(data.accessToken);
      return data;
    } catch {
      return null;
    }
  };

  const coordinated = () => typeof navigator !== 'undefined' && navigator.locks
    ? navigator.locks.request('pcs.session-refresh', run)
    : run();
  refreshInFlight = coordinated().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

export function getApiBaseUrl(): string {
  return BASE_URL;
}

export function buildQueryString<T extends object>(params?: T): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string') {
      if (value.trim() === '') continue;
      search.append(key, value);
      continue;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) continue;
      search.append(key, String(value));
      continue;
    }
    if (typeof value === 'boolean') search.append(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

async function execute(path: string, options: Omit<ApiFetchOptions, 'isRetry'>): Promise<Response> {
  const { body, skipAuth, headers: customHeaders, ...rest } = options;

  const headers = new Headers(customHeaders);
  if (path.startsWith('/auth/')) headers.set('X-Session-Request', '1');
  let payload: string | undefined;
  if (body !== undefined && body !== null) {
    payload = typeof body === 'string' ? body : JSON.stringify(body);
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  }

  const token = skipAuth ? null : getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  return fetch(`${BASE_URL}${path}`, { ...rest, credentials: 'include', headers, body: payload });
}

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { isRetry = false, ...rest } = options;
  const response = await execute(path, rest);

  if (response.status === 401 && !isRetry && !rest.skipAuth) {
    if (hasSession()) {
      const refreshed = await refreshSession();
      if (refreshed) {
        return apiFetch<T>(path, { ...rest, isRetry: true });
      }
      clearTokens();
      redirectToLogin();
    }
    const body = await parseBody<ErrorBody>(response);
    throw new ApiError(401, extractErrorMessage(401, body));
  }

  if (!response.ok) {
    const body = await parseBody<ErrorBody>(response);
    throw new ApiError(
      response.status,
      extractErrorMessage(response.status, body),
    );
  }

  return (await parseBody<T>(response)) as T;
}
