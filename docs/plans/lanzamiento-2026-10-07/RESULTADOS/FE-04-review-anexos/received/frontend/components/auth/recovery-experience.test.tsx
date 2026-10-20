// @vitest-environment jsdom
import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  clearSession: vi.fn(),
  request: vi.fn(),
  recover: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }), usePathname: () => '/recuperar' }));
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ clearSession: mocks.clearSession }) }));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, requestPasswordRecovery: mocks.request, recoverPassword: mocks.recover };
});

import { RecoveryExperience } from './recovery-experience';

function setSnapshot(mode: string, token: string | null = null) {
  const snapshot = { mode, token };
  Object.defineProperty(window, '__pcsRecoveryManager', {
    configurable: true,
    value: { snapshot: () => snapshot, startRequest: vi.fn(), inspectEntry: vi.fn() },
  });
}

beforeEach(() => {
  mocks.replace.mockReset();
  mocks.clearSession.mockReset().mockReturnValue(true);
  mocks.request.mockReset();
  mocks.recover.mockReset();
  setSnapshot('request');
});

describe('RecoveryExperience', () => {
  it('does not submit twice under StrictMode while a request is pending', async () => {
    let finish: (() => void) | undefined;
    mocks.request.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    const user = userEvent.setup();
    render(<StrictMode><RecoveryExperience /></StrictMode>);
    await user.type(screen.getByLabelText(/Email/), 'ash@example.com');
    const submit = screen.getByRole('button', { name: 'Enviar instrucciones' });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(mocks.request).toHaveBeenCalledTimes(1);
    finish?.();
    await screen.findByRole('heading', { name: 'Revisá tu correo' });
  });

  it('reconoce éxito solo después de la respuesta y limpia la sesión con su epoch', async () => {
    setSnapshot('link', 'A'.repeat(43));
    mocks.recover.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<RecoveryExperience />);
    await user.type(screen.getByLabelText(/Contraseña nueva/), 'pikachu88');
    await user.type(screen.getByLabelText(/Repetí la contraseña/), 'pikachu88');
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    await screen.findByText('Cambiaste tu contraseña. Ya podés iniciar sesión.');
    expect(mocks.recover).toHaveBeenCalledTimes(1);
    expect(mocks.clearSession).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login'));
  });

  it('muestra incertidumbre para fallos de cambio y conserva la sesión', async () => {
    const { ApiError } = await import('@/lib/api');
    setSnapshot('link', 'A'.repeat(43));
    mocks.recover.mockRejectedValue(new ApiError(503, 'unavailable'));
    const user = userEvent.setup();
    render(<RecoveryExperience />);
    await user.type(screen.getByLabelText(/Contraseña nueva/), 'pikachu88');
    await user.type(screen.getByLabelText(/Repetí la contraseña/), 'pikachu88');
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    expect(await screen.findByRole('heading', { name: 'No confirmamos el cambio' })).toBeTruthy();
    expect(mocks.clearSession).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
