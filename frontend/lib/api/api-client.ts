import type { AuthResponseDto } from '@/types/api';
import { clearTokens, getAccessToken, getSessionEpoch, hasSession, setRefreshedAccessToken } from './token-storage';
import { withSessionMutation } from './session-mutations';

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '') ?? 'http://localhost:3001/api';

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly fields?: Record<string, string>;
  readonly safeRetryAfter?: number;

  constructor(status: number, message: string, details: { code?: string; fields?: Record<string, string>; safeRetryAfter?: number } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = details.code;
    this.fields = details.fields;
    this.safeRetryAfter = details.safeRetryAfter;
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
  code?: string;
  fields?: Record<string, unknown>;
}

let refreshInFlight: { epoch: number; promise: Promise<AuthResponseDto | null> } | null = null;

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
  const epoch = getSessionEpoch();
  if (refreshInFlight?.epoch === epoch) return refreshInFlight.promise;

  const run = async (): Promise<AuthResponseDto | null> => {
    if (getSessionEpoch() !== epoch || !hasSession()) return null;
    try {
      const response = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Session-Request': '1' },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        clearTokens(epoch);
        return null;
      }
      const data = await parseBody<AuthResponseDto>(response);
      if (!data?.accessToken) {
        clearTokens(epoch);
        return null;
      }
      if (!setRefreshedAccessToken(data.accessToken, epoch)) return null;
      return data;
    } catch {
      return null;
    }
  };

  const promise = withSessionMutation(run);
  refreshInFlight = { epoch, promise };
  const release = () => {
    if (refreshInFlight?.promise === promise) refreshInFlight = null;
  };
  void promise.then(release, release);
  return promise;
}

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') return BASE_URL;

  if (process.env.NODE_ENV === 'development') {
    // Los Server Components necesitan una URL absoluta; /api es solo para el browser.
    return process.env.DEV_API_PROXY_TARGET ?? BASE_URL;
  }

  if (process.env.NODE_ENV === 'production') {
    const internalBaseUrl = process.env.API_INTERNAL_URL;
    return internalBaseUrl ? internalBaseUrl.replace(/\/+$/, '') : BASE_URL;
  }

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

  return fetch(`${getApiBaseUrl()}${path}`, { ...rest, credentials: 'include', headers, body: payload });
}

const RECOVERY_STATUS: Record<string, number> = {
  INPUT_INVALID: 400, SESSION_REQUEST_FORBIDDEN: 403, RECOVERY_RATE_LIMITED: 429,
  RECOVERY_UNAVAILABLE: 503, RECOVERY_LINK_INVALID: 400,
};
const RECOVERY_FIELDS: Record<string, string> = {
  email: 'Revisá el formato del email.', newPassword: 'Usá entre 8 y 72 caracteres.', request: 'Revisá los datos ingresados.',
};

function recoveryErrorDetails(response: Response, body: ErrorBody | undefined) {
  const fields: Record<string, string> = {};
  if (body?.fields && typeof body.fields === 'object') {
    for (const [key, value] of Object.entries(body.fields)) {
      if (Object.hasOwn(RECOVERY_FIELDS, key) && typeof value === 'string') fields[key] = RECOVERY_FIELDS[key];
    }
  }
  const rawRetryAfter = response.headers.get('Retry-After');
  const safeRetryAfter = rawRetryAfter && /^[1-9][0-9]*$/.test(rawRetryAfter)
    ? Number(rawRetryAfter)
    : undefined;
  return {
    code: typeof body?.code === 'string' && Object.hasOwn(RECOVERY_STATUS, body.code) && RECOVERY_STATUS[body.code] === response.status ? body.code : undefined,
    fields: Object.keys(fields).length ? fields : undefined,
    safeRetryAfter: safeRetryAfter && Number.isSafeInteger(safeRetryAfter) ? safeRetryAfter : undefined,
  };
}

/** Hace un único POST público: no adjunta sesión, no refresca ni reintenta. */
export async function recoveryFetch<T>(
  path: '/auth/password-recovery-requests' | '/auth/password-recoveries',
  options: ApiFetchOptions,
  expectedStatus: 200 | 202,
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.delete('Authorization');
  const response = await execute(path, { ...options, headers, method: 'POST', skipAuth: true, redirect: 'error', cache: 'no-store' });
  const body = await parseBody<ErrorBody & T>(response);
  if (response.status !== expectedStatus || !response.ok) {
    throw new ApiError(response.status, 'No pudimos confirmar el pedido.', recoveryErrorDetails(response, body));
  }
  return body as T;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const requestEpoch = getSessionEpoch();
  const { isRetry = false, ...rest } = options;
  const response = await execute(path, rest);

  if (response.status === 401 && !isRetry && !rest.skipAuth && requestEpoch === getSessionEpoch()) {
    if (hasSession()) {
      const refreshed = await refreshSession();
      if (requestEpoch !== getSessionEpoch()) {
        throw new ApiError(401, 'La sesión cambió. Volvé a intentarlo.');
      }
      if (refreshed) {
        return apiFetch<T>(path, { ...rest, isRetry: true });
      }
      clearTokens(requestEpoch);
      if (!hasSession()) redirectToLogin();
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
