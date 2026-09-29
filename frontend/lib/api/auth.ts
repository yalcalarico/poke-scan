import type { AuthResponseDto, UserDto } from '@/types/api';
import { apiFetch, refreshSession } from './api-client';
import { clearTokens, getRefreshToken, setTokens } from './token-storage';

export interface RegisterPayload {
  email: string;
  password: string;
  username: string;
  displayName: string;
}

export async function register(payload: RegisterPayload): Promise<AuthResponseDto> {
  const data = await apiFetch<AuthResponseDto>('/auth/register', {
    method: 'POST',
    body: payload,
    skipAuth: true,
  });
  setTokens(data.accessToken, data.refreshToken);
  return data;
}

export async function login(email: string, password: string): Promise<AuthResponseDto> {
  const data = await apiFetch<AuthResponseDto>('/auth/login', {
    method: 'POST',
    body: { email, password },
    skipAuth: true,
  });
  setTokens(data.accessToken, data.refreshToken);
  return data;
}

export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken();
  try {
    if (refreshToken) {
      await apiFetch<{ success: boolean }>('/auth/logout', {
        method: 'POST',
        body: { refreshToken },
        skipAuth: true,
      });
    }
  } finally {
    clearTokens();
  }
}

export async function getMe(): Promise<UserDto> {
  return apiFetch<UserDto>('/users/me');
}

export async function refreshSessionTokens(): Promise<AuthResponseDto | null> {
  return refreshSession();
}
