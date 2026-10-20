// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ availability: vi.fn(), remove: vi.fn(), clear: vi.fn(), auth: { isLoading: false, isAuthenticated: true } }));
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ clearSession: mocks.clear, ...mocks.auth }) }));
vi.mock('@/lib/api/account-deletion', () => ({
  getAccountDeletionAvailability: mocks.availability,
  deleteOwnAccount: mocks.remove,
}));
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a> }));

import { ApiError } from '@/lib/api';
import { clearTokens, setTokens } from '@/lib/api/token-storage';
import { AccountDeletionExperience } from './account-deletion-experience';

function fillConfirmation() {
  fireEvent.change(screen.getByLabelText(/Contraseña actual/), { target: { value: 'synthetic-password' } });
  fireEvent.change(screen.getByLabelText(/Escribí ELIMINAR/), { target: { value: 'ELIMINAR' } });
  fireEvent.click(screen.getByLabelText(/Confirmo que quiero eliminar/));
}
function submit() { fireEvent.click(screen.getByRole('button', { name: 'Eliminar mi cuenta' })); }

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.isLoading = false; mocks.auth.isAuthenticated = true;
  setTokens('synthetic-session-token');
  mocks.availability.mockResolvedValue({ available: true });
  mocks.clear.mockReturnValue(true);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('AccountDeletionExperience', () => {
  it('espera la recuperación de sesión al recargar antes de consultar disponibilidad', async () => {
    clearTokens(); mocks.auth.isLoading = true; mocks.auth.isAuthenticated = false;
    const view = render(<AccountDeletionExperience />);
    await act(async () => {});
    expect(mocks.availability).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Iniciá sesión para continuar' })).toBeNull();
    setTokens('synthetic-refreshed'); mocks.auth.isLoading = false; mocks.auth.isAuthenticated = true;
    view.rerender(<AccountDeletionExperience />);
    expect(await screen.findByRole('button', { name: 'Eliminar mi cuenta' })).toBeTruthy();
    expect(mocks.availability).toHaveBeenCalledTimes(1);
  });

  it('retira los campos sensibles al abandonar o volver desde el historial', async () => {
    render(<AccountDeletionExperience />);
    await screen.findByRole('button', { name: 'Eliminar mi cuenta' });
    fillConfirmation(); fireEvent(window, new Event('pagehide'));
    expect((screen.getByLabelText(/Contraseña actual/) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/Escribí ELIMINAR/) as HTMLInputElement).value).toBe('');
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    fillConfirmation(); fireEvent(window, new Event('pageshow'));
    expect((screen.getByLabelText(/Contraseña actual/) as HTMLInputElement).value).toBe('');
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('falla de forma cerrada si disponibilidad no está habilitada', async () => {
    mocks.availability.mockResolvedValue({ available: false });
    render(<AccountDeletionExperience />);
    expect(await screen.findByRole('heading', { name: 'Eliminación no disponible' })).toBeTruthy();
    expect(screen.queryByLabelText(/Contraseña actual/)).toBeNull();
    expect(document.body.textContent).not.toContain('journal');
  });

  it('valida la confirmación en el cliente y bloquea envíos duplicados', async () => {
    let finish!: () => void;
    mocks.remove.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<AccountDeletionExperience />);
    await screen.findByRole('button', { name: 'Eliminar mi cuenta' });
    fireEvent.change(screen.getByLabelText(/Contraseña actual/), { target: { value: 'synthetic-password' } });
    submit();
    expect(await screen.findByText('Confirmá que querés eliminar tu cuenta.')).toBeTruthy();
    expect(mocks.remove).not.toHaveBeenCalled();

    fillConfirmation();
    const button = screen.getByRole('button', { name: 'Eliminar mi cuenta' });
    fireEvent.click(button); fireEvent.click(button);
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    await act(async () => finish());
  });

  it('muestra contraseña incorrecta como error corregible y confirma limpiando la época actual', async () => {
    mocks.remove.mockRejectedValueOnce(new ApiError(401, 'raw', { code: 'ACCOUNT_DELETION_AUTH_INVALID' }))
      .mockImplementationOnce(async (_payload, confirmed) => {
        expect(confirmed).toBeTypeOf('function');
        expect(confirmed((await import('@/lib/api/token-storage')).getSessionEpoch())).toBe(true);
        return { success: true };
      });
    render(<AccountDeletionExperience />); await screen.findByRole('button', { name: 'Eliminar mi cuenta' });
    fillConfirmation(); submit();
    expect(await screen.findByText('Revisá tu contraseña actual o volvé a iniciar sesión.')).toBeTruthy();
    expect((screen.getByLabelText(/Contraseña actual/) as HTMLInputElement).value).toBe('');
    fireEvent.change(screen.getByLabelText(/Contraseña actual/), { target: { value: 'synthetic-password' } });
    fireEvent.change(screen.getByLabelText(/Escribí ELIMINAR/), { target: { value: 'ELIMINAR' } });
    submit();
    expect(await screen.findByRole('heading', { name: 'Tu cuenta fue eliminada' })).toBeTruthy();
    expect(mocks.clear).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Eliminar mi cuenta' })).toBeNull();
  });

  it('no atribuye un 401 de sesión vencida sólo a la contraseña y ofrece volver a entrar', async () => {
    mocks.remove.mockRejectedValue(new ApiError(401, 'token expired', { code: 'ACCOUNT_DELETION_AUTH_INVALID' }));
    render(<AccountDeletionExperience />); await screen.findByRole('button', { name: 'Eliminar mi cuenta' });
    fillConfirmation(); submit();
    expect(await screen.findByText('Revisá tu contraseña actual o volvé a iniciar sesión.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Iniciar sesión' }).getAttribute('href')).toBe('/login');
    expect(document.body.textContent).not.toContain('token expired');
    expect(mocks.remove).toHaveBeenCalledTimes(1); expect(mocks.clear).not.toHaveBeenCalled();
  });

  it('ante resultado incierto no repite ni limpia sesión', async () => {
    mocks.remove.mockRejectedValue(new ApiError(503, 'raw', { code: 'ACCOUNT_DELETION_RESULT_UNKNOWN' }));
    render(<AccountDeletionExperience />); await screen.findByRole('button', { name: 'Eliminar mi cuenta' });
    fillConfirmation(); submit();
    expect(await screen.findByRole('heading', { name: 'No confirmamos el resultado' })).toBeTruthy();
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Eliminar mi cuenta' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toBeTruthy();
  });
});
