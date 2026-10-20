import type {
  AccountDeletionAvailabilityDto,
  AccountDeletionErrorCode,
  AccountDeletionRequestDto,
  AccountDeletionResponseDto,
} from '@/types/api';

import { ApiError, apiFetch, getApiBaseUrl } from './api-client';
import { getAccessToken, getSessionEpoch } from './token-storage';
import { withSessionMutation } from './session-mutations';

const ERROR_STATUS: Record<AccountDeletionErrorCode, number> = {
  INPUT_INVALID: 400,
  ACCOUNT_DELETION_AUTH_INVALID: 401,
  SESSION_REQUEST_FORBIDDEN: 403,
  ACCOUNT_DELETION_RATE_LIMITED: 429,
  ACCOUNT_DELETION_RESULT_UNKNOWN: 503,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function responseBody(response: Response): Promise<unknown> {
  const content = await response.text();
  if (!content) return undefined;
  try { return JSON.parse(content) as unknown; } catch { return undefined; }
}

function safeRetryAfter(response: Response): number | undefined {
  const value = response.headers.get('Retry-After');
  if (!value || !/^[1-9][0-9]*$/.test(value)) return undefined;
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) ? seconds : undefined;
}

/** Consulta disponibilidad con bearer y sin permitir una respuesta cacheada. */
export async function getAccountDeletionAvailability(): Promise<AccountDeletionAvailabilityDto> {
  const data: unknown = await apiFetch('/auth/account-deletion-availability', { cache: 'no-store' });
  if (!isRecord(data) || Object.keys(data).length !== 1 || typeof data.available !== 'boolean') {
    throw new ApiError(503, 'No pudimos consultar la disponibilidad.');
  }
  return { available: data.available };
}

/**
 * Un solo POST, en la misma cola de login/refresh. El token y la época quedan
 * fijados al encolar para que una espera nunca cambie la cuenta objetivo.
 */
export function deleteOwnAccount(
  payload: AccountDeletionRequestDto,
  confirmed: (expectedEpoch: number) => boolean,
): Promise<AccountDeletionResponseDto> {
  const token = getAccessToken();
  const epoch = getSessionEpoch();
  if (!token) return Promise.reject(new ApiError(401, 'Iniciá sesión para continuar.'));

  return withSessionMutation(async () => {
    if (getSessionEpoch() !== epoch || getAccessToken() !== token) {
      throw new ApiError(401, 'La sesión cambió. Volvé a iniciar sesión.');
    }
    const response = await fetch(`${getApiBaseUrl()}/auth/account-deletions`, {
      method: 'POST',
      credentials: 'include',
      redirect: 'error',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Session-Request': '1',
      },
      body: JSON.stringify(payload),
    });
    const body = await responseBody(response);

    if (response.status === 200 && response.ok) {
      if (!isRecord(body) || Object.keys(body).length !== 1 || body.success !== true) {
        throw new ApiError(503, 'No pudimos confirmar el resultado.');
      }
      if (getSessionEpoch() !== epoch || !confirmed(epoch)) {
        throw new ApiError(503, 'No pudimos confirmar el resultado.');
      }
      return { success: true };
    }

    const code = isRecord(body) && typeof body.code === 'string' && Object.hasOwn(ERROR_STATUS, body.code)
      && ERROR_STATUS[body.code as AccountDeletionErrorCode] === response.status
      ? body.code as AccountDeletionErrorCode
      : undefined;
    throw new ApiError(response.status, 'No pudimos confirmar el resultado.', {
      ...(code ? { code } : {}),
      ...(response.status === 429 ? { safeRetryAfter: safeRetryAfter(response) } : {}),
    });
  });
}
