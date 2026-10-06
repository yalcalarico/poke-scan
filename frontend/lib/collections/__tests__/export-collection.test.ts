import { describe, expect, it, vi } from 'vitest';
import { listItems } from '@/lib/api/collections';
import { collectionCsv, exportCollectionCsv } from '../export-collection';
import type { CollectionItemDto } from '@/types/api';
vi.mock('@/lib/api/collections', () => ({ listItems: vi.fn() }));

const item: CollectionItemDto = {
  id: 'item-1', collectionId: 'collection-1', variant: 'normal', condition: 'NM', quantity: 2,
  isForTrade: false, notes: '=HYPERLINK("example")\nnota;otra', addedAt: '2026-10-05', price: null,
  card: { id: 'base1-4', name: 'Charizard', supertype: 'Pokémon', subtypes: [], hp: '120', types: ['Fire'],
    number: '4', rarity: 'Rare Holo', artist: null, setId: 'base1', imageSmall: '', imageLarge: '' },
};

describe('Exportación de colección', () => {
  it('mantiene precios desconocidos vacíos y neutraliza fórmulas sin romper comillas o saltos', () => {
    const csv = collectionCsv([item]);
    expect(csv).toContain('"2";"";"";"No"');
    expect(csv).toContain('"\'=HYPERLINK(""example"")\nnota;otra"');
    expect(csv.startsWith('\uFEFF')).toBe(true);
  });
  it('incluye páginas no cargadas y no hereda filtros de la grilla', async () => {
    vi.mocked(listItems).mockResolvedValueOnce({ data: [item], page: 1, pageSize: 200, total: 201, totalPages: 2 })
      .mockResolvedValueOnce({ data: [{ ...item, card: { ...item.card, id: 'base1-25', name: 'Pikachu' } }], page: 2, pageSize: 200, total: 201, totalPages: 2 });
    const signal = new AbortController().signal;
    const csv = await exportCollectionCsv('collection-1', signal);
    expect(csv).toContain('Charizard');
    expect(csv).toContain('Pikachu');
    expect(listItems).toHaveBeenNthCalledWith(2, 'collection-1', { page: 2, pageSize: 200 }, signal);
  });
});
