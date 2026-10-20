// @vitest-environment jsdom
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ replace: vi.fn(), clearSession: vi.fn(), request: vi.fn(), recover: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }), usePathname: () => '/recuperar' }));
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ clearSession: mocks.clearSession }) }));
vi.mock('@/lib/api', async () => ({ ...await vi.importActual<typeof import('@/lib/api')>('@/lib/api'), requestPasswordRecovery: mocks.request, recoverPassword: mocks.recover }));
import { ApiError } from '@/lib/api';
import { RecoveryExperience } from './recovery-experience';
import type { RecoveryViewSnapshot } from '@/lib/recovery/recovery-view';

let snapshot: RecoveryViewSnapshot;
const publish = (mode: RecoveryViewSnapshot['mode'], token: string | null = null, fresh = false) => {
  snapshot = { mode, token, entry: snapshot.entry + (fresh ? 1 : 0) };
  window.dispatchEvent(new Event('pcs:recovery-view'));
};
function changeFields(password = 'fixture-pass') {
  fireEvent.change(screen.getByLabelText(/Nueva contraseña/), { target: { value: password } });
  fireEvent.change(screen.getByLabelText(/Repetí la contraseña/), { target: { value: password } });
}
function submitChange() { fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' })); }
beforeEach(() => {
  vi.clearAllMocks();
  mocks.clearSession.mockReturnValue(true);
  mocks.request.mockReset(); mocks.recover.mockReset();
  snapshot = { mode: 'request', token: null, entry: 1 };
  window.__pcsRecoveryManager = { snapshot: () => snapshot, inspectEntry: vi.fn(),
    startRequest: () => publish('request', null, true), discardLink: () => publish('unavailable') };
});
afterEach(() => { vi.useRealTimers(); delete window.__pcsRecoveryManager; });

describe('RecoveryExperience', () => {
  it('HTML SSR no habilita GET ni envío nativo antes de hidratar', () => {
    const container = document.createElement('div'); container.innerHTML = renderToString(<RecoveryExperience />);
    const form = container.querySelector('form')!;
    expect(form.getAttribute('method')).toBe('post');
    expect(container.querySelector('input[name=email]')?.hasAttribute('disabled')).toBe(true);
    expect(container.querySelector('button[type=submit]')?.hasAttribute('disabled')).toBe(true);
    expect(container.querySelector('input')?.value === '').toBe(true);
  });
  it('bloquea doble click y Enter bajo StrictMode y 202 no promete entrega', async () => {
    let finish!: () => void;
    mocks.request.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<StrictMode><RecoveryExperience /></StrictMode>);
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'fixture@example.invalid' } });
    const submit = screen.getByRole('button', { name: 'Pedir enlace' });
    fireEvent.click(submit); fireEvent.click(submit); fireEvent.submit(submit.closest('form')!);
    expect(mocks.request).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    expect(screen.getByRole('heading', { name: 'Recibimos tu pedido' })).toBeTruthy();
    expect(document.body.textContent?.includes('fixture@example.invalid')).toBe(false);
    expect(screen.getByText(/Si corresponde y el envío puede completarse/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pedir otro enlace' }).hasAttribute('disabled')).toBe(true);
  });

  it('éxito limpia dentro del callback confirmado y requiere login manual', async () => {
    snapshot = { mode: 'link', token: 'A'.repeat(43), entry: 1 };
    mocks.recover.mockImplementation(async (_token, _password, confirmed) => { confirmed(); return { success: true }; });
    render(<RecoveryExperience />); changeFields(); submitChange();
    const heading = await screen.findByRole('heading', { name: 'Cambiaste tu contraseña' });
    expect(document.activeElement).toBe(heading);
    expect(mocks.clearSession).toHaveBeenCalledTimes(1); expect(mocks.recover).toHaveBeenCalledTimes(1);
    vi.useFakeTimers(); await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Iniciar sesión' }).getAttribute('href')).toBe('/login');
    expect(screen.queryByRole('button', { name: 'Cambiar contraseña' })).toBeNull();
    expect(snapshot.token === null).toBe(true);
  });

  it.each([
    [503, 'RECOVERY_UNAVAILABLE'], [400, undefined], [400, 'UNKNOWN'],
    [403, 'INPUT_INVALID'], [429, 'RECOVERY_LINK_INVALID'], [200, undefined],
  ])('status/code inesperado %s/%s deja incertidumbre sin replay ni clearing', async (status, code) => {
    snapshot = { mode: 'link', token: 'A'.repeat(43), entry: 1 };
    mocks.recover.mockRejectedValue(new ApiError(status, 'no renderizar', { code }));
    render(<RecoveryExperience />); changeFields(); submitChange();
    const heading = await screen.findByRole('heading', { name: 'No confirmamos el cambio' });
    expect(document.activeElement).toBe(heading);
    expect(mocks.clearSession).not.toHaveBeenCalled(); expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Cambiar contraseña' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pedir otro enlace' }));
    expect(screen.getByRole('button', { name: 'Pedir enlace' })).toBeTruthy();
    expect(mocks.request).not.toHaveBeenCalled(); expect(mocks.recover).toHaveBeenCalledTimes(1);
  });

  it('403 reconocido ofrece login y 400 INPUT conserva enlace/campos y foco', async () => {
    snapshot = { mode: 'link', token: 'A'.repeat(43), entry: 1 };
    mocks.recover.mockRejectedValueOnce(new ApiError(400, 'raw', { code: 'INPUT_INVALID', fields: { newPassword: 'raw' } }))
      .mockRejectedValueOnce(new ApiError(403, 'raw', { code: 'SESSION_REQUEST_FORBIDDEN' }));
    render(<RecoveryExperience />); changeFields(); submitChange();
    await screen.findByText('Usá entre 8 y 72 caracteres.');
    // El error se pinta antes de que el efecto devuelva el foco al campo.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/Nueva contraseña/)));
    expect(snapshot.token !== null).toBe(true);
    submitChange(); await screen.findByRole('heading', { name: 'Volvé a empezar' });
    expect(screen.queryByRole('button', { name: 'Cambiar contraseña' })).toBeNull();
    expect(mocks.clearSession).not.toHaveBeenCalled();
  });

  it('cuenta codepoints, permite claves astrales y no trunca por maxlength UTF16', async () => {
    snapshot = { mode: 'link', token: 'A'.repeat(43), entry: 1 };
    mocks.recover.mockRejectedValue(new ApiError(503, 'raw'));
    render(<RecoveryExperience />);
    const input = screen.getByLabelText(/Nueva contraseña/);
    expect(input.hasAttribute('maxlength')).toBe(false);
    changeFields('😀'.repeat(7)); submitChange(); expect(mocks.recover).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Mostrar confirmación' })).toBeTruthy();
    changeFields('😀'.repeat(72)); submitChange();
    await screen.findByRole('heading', { name: 'No confirmamos el cambio' });
    expect(mocks.recover).toHaveBeenCalledTimes(1);
  });

  it('espera 429 con fallback sin countdown live ni submit automático', async () => {
    vi.useFakeTimers();
    mocks.request.mockRejectedValue(new ApiError(429, 'raw', { code: 'RECOVERY_RATE_LIMITED' }));
    render(<RecoveryExperience />);
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'fixture@example.invalid' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Pedir enlace' })); });
    expect(screen.getByRole('button', { name: 'Pedir enlace' }).hasAttribute('disabled')).toBe(true);
    const before = screen.getByRole('status').textContent;
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(screen.getByRole('status').textContent).toBe(before);
    await act(async () => { await vi.advanceTimersByTimeAsync(59_000); });
    expect(screen.getByRole('status').textContent).toBe('Ya podés volver a intentar.');
    expect(screen.getByRole('button', { name: 'Pedir enlace' }).hasAttribute('disabled')).toBe(false);
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it('una entrada nueva ignora respuesta vieja y pierde campos previos', async () => {
    let finish!: () => void;
    mocks.request.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<RecoveryExperience />);
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'fixture@example.invalid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pedir enlace' }));
    act(() => publish('request', null, true));
    expect((screen.getByLabelText(/Email/) as HTMLInputElement).value === '').toBe(true);
    await act(async () => finish());
    expect(screen.getByRole('heading', { name: 'Recuperá tu cuenta' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pedir enlace' }).hasAttribute('disabled')).toBe(false);
  });
});
