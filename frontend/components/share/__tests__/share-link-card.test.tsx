// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/api-client';
import type { ShareLink } from '@/lib/api/share';
import { ShareLinkCard } from '../share-link-card';

const api = vi.hoisted(() => ({
  revokeShareLink: vi.fn(),
  updateShareLink: vi.fn(),
}));

vi.mock('@/lib/api/share', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/share')>()),
  revokeShareLink: api.revokeShareLink,
  updateShareLink: api.updateShareLink,
}));

vi.mock('@/components/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui')>()),
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

function link(): ShareLink {
  return {
    id: 'share-1',
    slug: 'public-slug',
    url: 'https://example.test/share/public-slug',
    collectionId: null,
    collectionName: 'Mi colección',
    isActive: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    viewCount: 2,
    expiresAt: null,
  };
}

describe('ShareLinkCard: acciones y errores', () => {
  beforeEach(() => {
    api.revokeShareLink.mockReset();
    api.updateShareLink.mockReset();
  });

  it('deja el error de revocación dentro de la confirmación y permite reintentar', async () => {
    const user = userEvent.setup();
    const onDeactivated = vi.fn();
    api.revokeShareLink
      .mockRejectedValueOnce(new ApiError(503, 'No pudimos conectar.'))
      .mockResolvedValueOnce(undefined);
    render(<ShareLinkCard link={link()} onUpdated={vi.fn()} onDeactivated={onDeactivated} />);

    await user.click(screen.getByRole('button', { name: 'Revocar' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('No podemos retractar páginas que ya están abiertas');
    await user.click(screen.getByRole('button', { name: 'Revocar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos conectar.');
    expect(dialog).toContainElement(screen.getByRole('button', { name: 'Reintentar' }));

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onDeactivated).toHaveBeenCalledWith('share-1');
    expect(api.revokeShareLink).toHaveBeenCalledTimes(2);
  });

  it('muestra el error de toggle junto a la fila de acciones', async () => {
    const user = userEvent.setup();
    api.updateShareLink.mockRejectedValueOnce(new ApiError(503, 'No pudimos actualizar.'));
    render(<ShareLinkCard link={link()} onUpdated={vi.fn()} onDeactivated={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Desactivar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos actualizar.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('serializa DELETE, mantiene la confirmación pendiente y evita PATCH concurrente', async () => {
    let finish: () => void = () => undefined;
    api.revokeShareLink.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    const onDeactivated = vi.fn();
    render(<ShareLinkCard link={link()} onUpdated={vi.fn()} onDeactivated={onDeactivated} />);
    fireEvent.click(screen.getByRole('button', { name: 'Revocar' }));
    const dialog = await screen.findByRole('dialog');
    const primary = within(dialog).getByRole('button', { name: 'Revocar' });
    fireEvent.click(primary); fireEvent.click(primary);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(api.revokeShareLink).toHaveBeenCalledTimes(1);
    expect(api.updateShareLink).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    await act(async () => finish());
    expect(onDeactivated).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('serializa PATCH y deja reintentar un error en la misma fila', async () => {
    let fail: (error: unknown) => void = () => undefined;
    api.updateShareLink.mockReturnValueOnce(new Promise<ShareLink>((_, reject) => { fail = reject; })).mockResolvedValueOnce({ ...link(), isActive: false });
    const onUpdated = vi.fn();
    render(<ShareLinkCard link={link()} onUpdated={onUpdated} onDeactivated={vi.fn()} />);
    const toggle = screen.getByRole('button', { name: 'Desactivar' });
    fireEvent.click(toggle); fireEvent.click(toggle);
    expect(api.updateShareLink).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Revocar' })).toBeDisabled();
    await act(async () => fail(new ApiError(503, 'Error de estado')));
    expect(screen.getByRole('alert')).toHaveTextContent('Error de estado');
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ isActive: false })));
    expect(api.updateShareLink).toHaveBeenCalledTimes(2);
  });

  it('un enlace vencido inactivo conserva vencido y no permite reactivar', () => {
    render(<ShareLinkCard link={{ ...link(), isActive: false, expiresAt: '2000-01-01T00:00:00Z' }} onUpdated={vi.fn()} onDeactivated={vi.fn()} />);
    expect(screen.getByText('Vencido')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copiar' })).not.toBeInTheDocument();
  });
});
