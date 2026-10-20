// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { CollectionDto } from '@/types/api';
const mocks = vi.hoisted(() => ({ remove: vi.fn(), update: vi.fn(), success: vi.fn() }));
vi.mock('@/lib/api/collections', () => ({ deleteCollection: mocks.remove, updateCollection: mocks.update }));
vi.mock('@/components/visual-preview/preview-sheet', () => ({ PreviewSheet: ({ open, title, children, footer }: { open: boolean; title: string; children: ReactNode; footer: ReactNode }) => open ? <div role="dialog" aria-label={title}>{children}{footer}</div> : null }));
vi.mock('@/components/ui', async (original) => ({ ...await original<typeof import('@/components/ui')>(), useToast: () => ({ success: mocks.success }) }));
import { CollectionRenameSheet } from '../collection-rename-sheet';
const collection = { id: 'own', name: 'Favoritas', itemCount: 3 } as CollectionDto;
beforeEach(() => vi.clearAllMocks());

it('editar sólo permite renombrar y no incluye la acción de eliminar', async () => {
  const onRenamed = vi.fn();
  mocks.update.mockResolvedValue({ ...collection, name: 'Nuevas favoritas' });
  render(<CollectionRenameSheet open collection={collection} onClose={vi.fn()} onRenamed={onRenamed} />);
  expect(screen.queryByRole('button', { name: /eliminar/i })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Nuevas favoritas' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(onRenamed).toHaveBeenCalledWith(expect.objectContaining({ name: 'Nuevas favoritas' })));
  expect(mocks.remove).not.toHaveBeenCalled();
});
