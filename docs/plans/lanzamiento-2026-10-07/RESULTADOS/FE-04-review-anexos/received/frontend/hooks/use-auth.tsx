'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  getMe,
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
  type RegisterPayload,
} from '@/lib/api';
import { clearTokens, getSessionEpoch, hasSession } from '@/lib/api/token-storage';
import type { UserDto } from '@/types/api';

export interface AuthContextValue {
  user: UserDto | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<UserDto>;
  register: (payload: RegisterPayload) => Promise<UserDto>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<UserDto | null>;
  clearSession: (expectedEpoch: number) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  /**
   * Releer el usuario desde la API.
   *
   * El `setIsLoading(false)` va en un `finally` y **no** solo en el camino del
   * `try`: el `return` temprano de "no hay sesión" saltaba el `finally` de la
   * versión anterior y dejaba `isLoading` en `true` para siempre. Hoy el
   * bootstrap del `useEffect` tapa ese caso, así que no se ve —pero cualquier
   * llamada futura a `refreshUser()` desde un estado ya montado (un "reintentar",
   * un refresh al volver de la PWA) dejaba la app colgada en el skeleton.
   */
  const refreshUser = useCallback(async (): Promise<UserDto | null> => {
    const epoch = getSessionEpoch();
    if (!hasSession()) {
      if (getSessionEpoch() === epoch) { setUser(null); setIsLoading(false); }
      return null;
    }
    try {
      const me = await getMe();
      if (getSessionEpoch() !== epoch) return null;
      setUser(me);
      return me;
    } catch {
      if (getSessionEpoch() === epoch || !hasSession()) setUser(null);
      return null;
    } finally {
      if (getSessionEpoch() === epoch || !hasSession()) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      const epoch = getSessionEpoch();
      if (!hasSession()) {
        if (!cancelled && getSessionEpoch() === epoch) setIsLoading(false);
        return;
      }
      try {
        const me = await getMe();
        if (!cancelled && getSessionEpoch() === epoch) setUser(me);
      } catch {
        if (!cancelled && (getSessionEpoch() === epoch || !hasSession())) setUser(null);
      } finally {
        if (!cancelled && (getSessionEpoch() === epoch || !hasSession())) setIsLoading(false);
      }
    };
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await loginRequest(email, password);
    setUser(data.user);
    setIsLoading(false);
    return data.user;
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    const data = await registerRequest(payload);
    setUser(data.user);
    setIsLoading(false);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      if (!hasSession()) setUser(null);
    }
  }, []);

  const clearSession = useCallback((expectedEpoch: number) => {
    if (!clearTokens(expectedEpoch)) return false;
    setUser(null);
    setIsLoading(false);
    return true;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      login,
      register,
      logout,
      refreshUser,
      clearSession,
    }),
    [user, isLoading, login, register, logout, refreshUser, clearSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  }
  return context;
}
