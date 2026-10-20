// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { CollectionDto } from '@/types/api';
const mocks = vi.hoisted(() => ({ remove: vi.fn(), update: vi.fn(), success: vi.fn() }));
vi.mock('@/lib/api/collections', () => ({ deleteCollection: mocks.remove, updateCollection: mocks.update }));
vi.mock('@/components/visual-preview/preview-sheet', () => ({ PreviewSheet: ({ open, title, children, footer }: { open: boolean; title: string; children: ReactNode; footer: ReactNode }) => open ? <div role="dialog" aria-label={title}>{children}{footer}</div> : null }));
vi.mock('@/components/ui', async (original) => ({ ...await original<typeof import('@/components/ui')>(), useToast: () => ({ success: mocks.success }) }));
import { CollectionDeleteSheet } from '../collection-delete-sheet';
const collection = { id: 'own', name: 'Favoritas', itemCount: 3 } as CollectionDto;
beforeEach(() => vi.clearAllMocks());

it('exige confirmación y permite conservar la colección sin borrarla', () => {
  const onClose = vi.fn();
  render(<CollectionDeleteSheet open collection={collection} onClose={onClose} onDeleted={vi.fn()} />);
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(screen.getByText(/Favoritas.*3 copias/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Conservar colección' }));
  expect(onClose).toHaveBeenCalledOnce();
  expect(mocks.remove).not.toHaveBeenCalled();
});

it('bloquea dobles envíos y navega sólo después de borrar', async () => {
  let resolve: () => void = () => undefined;
  mocks.remove.mockReturnValue(new Promise<void>((done) => { resolve = done; }));
  const onDeleted = vi.fn();
  render(<CollectionDeleteSheet open collection={collection} onClose={vi.fn()} onDeleted={onDeleted} />);
  fireEvent.click(screen.getByRole('button', { name: 'Sí, eliminar colección' }));
  fireEvent.click(screen.getByRole('button', { name: 'Eliminando…' }));
  expect(mocks.remove).toHaveBeenCalledExactlyOnceWith('own');
  expect(onDeleted).not.toHaveBeenCalled();
  resolve();
  await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce());
});

it('un error conserva la confirmación y permite reintentar', async () => {
  mocks.remove.mockRejectedValue(new Error('red'));
  const onDeleted = vi.fn();
  render(<CollectionDeleteSheet open collection={collection} onClose={vi.fn()} onDeleted={onDeleted} />);
  fireEvent.click(screen.getByRole('button', { name: 'Sí, eliminar colección' }));
  expect(await screen.findByText(/No pudimos eliminar/)).toBeInTheDocument();
  expect(onDeleted).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Sí, eliminar colección' })).toBeEnabled();
});
