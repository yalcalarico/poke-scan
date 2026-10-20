// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() }));
vi.mock('@/lib/api', async () => ({ ...await vi.importActual<typeof import('@/lib/api')>('@/lib/api'),
  getMe: mocks.me, login: mocks.login, register: mocks.register, logout: mocks.logout }));
import { AuthProvider, useAuth } from './use-auth';
import { clearTokens, getSessionEpoch, setTokens } from '@/lib/api/token-storage';
const user = { id: 'fixture', email: 'fixture@example.invalid', username: 'fixture', displayName: 'Fixture',
  avatarUrl: null, preferredCurrency: 'USD', preferredRateType: 'blue', createdAt: '2026-10-10', updatedAt: '2026-10-10' };
beforeEach(() => { vi.clearAllMocks(); clearTokens(); });

describe('generación del AuthProvider', () => {
  it('bootstrap anterior al clear confirmado no restaura user ni loading', async () => {
    setTokens('fixture-access');
    let finish!: (value: typeof user) => void;
    mocks.me.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const { result } = renderHook(useAuth, { wrapper: AuthProvider });
    act(() => { result.current.clearSession(getSessionEpoch()); });
    await act(async () => { finish(user); });
    expect(result.current.user === null).toBe(true); expect(result.current.isLoading).toBe(false);
  });

  it('refreshUser anterior al clear confirmado no restaura el perfil', async () => {
    mocks.me.mockResolvedValue(user); setTokens('fixture-access');
    const { result } = renderHook(useAuth, { wrapper: AuthProvider });
    await act(async () => {});
    let finish!: (value: typeof user) => void;
    mocks.me.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    let refresh!: Promise<unknown>;
    act(() => { refresh = result.current.refreshUser(); result.current.clearSession(getSessionEpoch()); });
    await act(async () => { finish(user); await refresh; });
    expect(result.current.user === null).toBe(true); expect(result.current.isAuthenticated).toBe(false);
  });

  it('login que empieza después del reset confirmado sí crea perfil nuevo', async () => {
    const { result } = renderHook(useAuth, { wrapper: AuthProvider });
    let start!: () => void; let finish!: (value: { user: typeof user; accessToken: string }) => void;
    mocks.login.mockImplementation((_email, _password, started) => { start = started; return new Promise((resolve) => { finish = resolve; }); });
    let pending!: Promise<unknown>;
    act(() => { pending = result.current.login(user.email, 'fixture-password'); result.current.clearSession(getSessionEpoch()); });
    await act(async () => { start(); setTokens('fixture-new'); finish({ user, accessToken: 'fixture-new' }); await pending; });
    expect(result.current.user?.id === user.id).toBe(true); expect(result.current.isAuthenticated).toBe(true);
  });

  it.each(['login', 'register'] as const)('%s viejo no restaura provider después de clear confirmado', async (kind) => {
    const { result } = renderHook(useAuth, { wrapper: AuthProvider });
    let finish!: (value: { user: typeof user; accessToken: string }) => void;
    mocks[kind].mockImplementation((...args: unknown[]) => {
      const started = args.at(-1); if (typeof started === 'function') started();
      return new Promise((resolve) => { finish = resolve; });
    });
    let response!: Promise<boolean>;
    act(() => {
      const operation = kind === 'login' ? result.current.login(user.email, 'fixture-password') :
        result.current.register({ email: user.email, username: user.username, displayName: user.displayName, password: 'fixture-password' });
      response = operation.then(() => false, () => true);
      setTokens('fixture-response'); result.current.clearSession(getSessionEpoch());
    });
    await act(async () => { finish({ user, accessToken: 'fixture-response' }); expect(await response).toBe(true); });
    expect(result.current.user === null).toBe(true); expect(result.current.isLoading).toBe(false);
  });
});
