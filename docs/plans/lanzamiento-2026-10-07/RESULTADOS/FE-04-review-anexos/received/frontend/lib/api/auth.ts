import type { AuthResponseDto, UserDto } from '@/types/api';
import { apiFetch, recoveryFetch, refreshSession, ApiError } from './api-client';
import { clearTokens, getSessionEpoch, setTokens } from './token-storage';
import type { PasswordRecoveryAcceptedDto, PasswordRecoverySuccessDto } from '@/types/api';

export interface RegisterPayload {
  email: string;
  password: string;
  username: string;
  displayName: string;
}

let authMutationQueue: Promise<void> = Promise.resolve();

function serializeAuthMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = authMutationQueue.then(operation, operation);
  authMutationQueue = result.then(() => undefined, () => undefined);
  return result;
}

export async function register(payload: RegisterPayload): Promise<AuthResponseDto> {
  return serializeAuthMutation(async () => {
    const epoch = getSessionEpoch();
    const data = await apiFetch<AuthResponseDto>('/auth/register', {
      method: 'POST',
      body: payload,
      skipAuth: true,
    });
    if (getSessionEpoch() !== epoch) throw new ApiError(401, 'La sesión cambió. Volvé a intentarlo.');
    setTokens(data.accessToken);
    return data;
  });
}

export async function login(email: string, password: string): Promise<AuthResponseDto> {
  return serializeAuthMutation(async () => {
    const epoch = getSessionEpoch();
    const data = await apiFetch<AuthResponseDto>('/auth/login', {
      method: 'POST',
      body: { email, password },
      skipAuth: true,
    });
    if (getSessionEpoch() !== epoch) throw new ApiError(401, 'La sesión cambió. Volvé a intentarlo.');
    setTokens(data.accessToken);
    return data;
  });
}

export async function logout(): Promise<void> {
  return serializeAuthMutation(async () => {
    const epoch = getSessionEpoch();
    try {
      await apiFetch<{ success: boolean }>('/auth/logout', {
        method: 'POST', body: {}, skipAuth: true,
      });
    } finally {
      clearTokens(epoch);
    }
  });
}

export async function requestPasswordRecovery(email: string): Promise<PasswordRecoveryAcceptedDto> {
  const data = await recoveryFetch<PasswordRecoveryAcceptedDto>(
    '/auth/password-recovery-requests',
    { method: 'POST', body: { email } },
    202,
  );
  if (!data || typeof data.message !== 'string') throw new ApiError(202, 'Respuesta inválida.');
  return data;
}

export async function recoverPassword(token: string, newPassword: string): Promise<PasswordRecoverySuccessDto> {
  return serializeAuthMutation(async () => {
    const data = await recoveryFetch<PasswordRecoverySuccessDto>(
      '/auth/password-recoveries',
      { method: 'POST', body: { token, newPassword } },
      200,
    );
    if (!data || data.success !== true) throw new ApiError(200, 'Respuesta inválida.');
    return data;
  });
}


export async function getMe(): Promise<UserDto> {
  return apiFetch<UserDto>('/users/me');
}

export async function refreshSessionTokens(): Promise<AuthResponseDto | null> {
  return refreshSession();
}
