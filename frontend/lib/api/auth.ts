import type { AuthResponseDto, UserDto } from '@/types/api';
import { apiFetch, recoveryFetch, refreshSession, ApiError } from './api-client';
import { clearTokens, getSessionEpoch, setTokens } from './token-storage';
import type { PasswordRecoveryAcceptedDto, PasswordRecoverySuccessDto } from '@/types/api';
import { withSessionMutation } from './session-mutations';

export interface RegisterPayload {
  email: string;
  password: string;
  username: string;
  displayName: string;
}

export async function register(payload: RegisterPayload, started?: () => void): Promise<AuthResponseDto> {
  return withSessionMutation(async () => {
    started?.();
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

export async function login(email: string, password: string, started?: () => void): Promise<AuthResponseDto> {
  return withSessionMutation(async () => {
    started?.();
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

export async function logout(started?: () => void): Promise<void> {
  return withSessionMutation(async () => {
    started?.();
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
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length !== 1 || typeof data.message !== 'string' || !data.message.trim()) throw new ApiError(202, 'Respuesta inválida.');
  return { message: 'Recibimos tu pedido.' };
}

export async function recoverPassword(token: string, newPassword: string, confirmed?: () => void): Promise<PasswordRecoverySuccessDto> {
  return withSessionMutation(async () => {
    const data = await recoveryFetch<PasswordRecoverySuccessDto>(
      '/auth/password-recoveries',
      { method: 'POST', body: { token, newPassword } },
      200,
    );
    if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length !== 1 || data.success !== true) throw new ApiError(200, 'Respuesta inválida.');
    // Limpiar antes de liberar la cola: un login posterior crea otra sesión.
    if (confirmed) confirmed();
    else clearTokens(getSessionEpoch());
    return { success: true };
  });
}


export async function getMe(): Promise<UserDto> {
  return apiFetch<UserDto>('/users/me');
}

export async function refreshSessionTokens(): Promise<AuthResponseDto | null> {
  return refreshSession();
}
