'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  getMe,
  ApiError,
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
  const generation = useRef(0);

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
    const started = generation.current;
    if (!hasSession()) {
      if (generation.current === started && getSessionEpoch() === epoch) { setUser(null); setIsLoading(false); }
      return null;
    }
    try {
      const me = await getMe();
      if (generation.current !== started || getSessionEpoch() !== epoch) return null;
      setUser(me);
      return me;
    } catch {
      if (generation.current === started && (getSessionEpoch() === epoch || !hasSession())) setUser(null);
      return null;
    } finally {
      if (generation.current === started && (getSessionEpoch() === epoch || !hasSession())) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      const epoch = getSessionEpoch();
      const started = generation.current;
      if (!hasSession()) {
        if (!cancelled && generation.current === started && getSessionEpoch() === epoch) setIsLoading(false);
        return;
      }
      try {
        const me = await getMe();
        if (!cancelled && generation.current === started && getSessionEpoch() === epoch) setUser(me);
      } catch {
        if (!cancelled && generation.current === started && (getSessionEpoch() === epoch || !hasSession())) setUser(null);
      } finally {
        if (!cancelled && generation.current === started && (getSessionEpoch() === epoch || !hasSession())) setIsLoading(false);
      }
    };
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    let started = ++generation.current;
    try {
      const data = await loginRequest(email, password, () => { started = ++generation.current; });
      if (generation.current !== started) throw new ApiError(401, 'La sesión cambió. Volvé a intentarlo.');
      setUser(data.user);
      return data.user;
    } finally { if (generation.current === started) setIsLoading(false); }
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    let started = ++generation.current;
    try {
      const data = await registerRequest(payload, () => { started = ++generation.current; });
      if (generation.current !== started) throw new ApiError(401, 'La sesión cambió. Volvé a intentarlo.');
      setUser(data.user);
      return data.user;
    } finally { if (generation.current === started) setIsLoading(false); }
  }, []);

  const logout = useCallback(async () => {
    let started = ++generation.current;
    try {
      await logoutRequest(() => { started = ++generation.current; });
    } finally {
      if (generation.current === started && !hasSession()) { setUser(null); setIsLoading(false); }
    }
  }, []);

  const clearSession = useCallback((expectedEpoch: number) => {
    if (!clearTokens(expectedEpoch)) return false;
    generation.current += 1;
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
