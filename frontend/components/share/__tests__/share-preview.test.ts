import { describe, expect, it, vi } from 'vitest';

import type { CollectionDto, CollectionItemDto, Paginated } from '@/types/api';
import {
  estimatedExpiration,
  formatExpiration,
  loadSharePreviewItem,
  sampleCollection,
  toSharePreviewItem,
} from '../share-preview';

function collection(id: string, itemCount: number): CollectionDto {
  return {
    id,
    userId: 'private-user-id',
    name: id,
    isDefault: false,
    itemCount,
    uniqueCount: itemCount,
    duplicateCount: 0,
    totalValueUsd: 0,
    totalValueArs: null,
    cover: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function item(overrides: Partial<CollectionItemDto> = {}): CollectionItemDto {
  return {
    id: 'private-item-id',
    collectionId: 'private-collection-id',
    card: {
      id: 'sv1-1',
      name: 'Sprigatito',
      supertype: 'Pokémon',
      subtypes: ['Basic'],
      hp: '60',
      types: ['Grass'],
      number: '1',
      rarity: 'Common',
      artist: 'Artist',
      setId: 'sv1',
      set: {
        id: 'sv1',
        name: 'Scarlet & Violet',
        series: 'Scarlet & Violet',
        printedTotal: 198,
        total: 198,
        releaseDate: null,
        logoUrl: null,
        symbolUrl: null,
      },
      imageSmall: 'https://images.pokemontcg.io/sv1/1.png',
      imageLarge: 'https://images.pokemontcg.io/sv1/1_hires.png',
    },
    variant: 'normal',
    condition: 'NM',
    quantity: 2,
    isForTrade: true,
    notes: 'nota privada centinela',
    addedAt: '2026-01-01T00:00:00.000Z',
    price: {
      cardId: 'sv1-1',
      variant: 'normal',
      low: 0,
      mid: 0,
      high: 0,
      market: 0,
      provider: 'tcgdex',
      currency: 'USD',
      source: 'tcgplayer',
      fetchedAt: '2026-01-02T03:04:00.000Z',
    },
    ...overrides,
  };
}

describe('preview privada de compartir', () => {
  it('elige una sola colección no vacía para el alcance global', () => {
    expect(sampleCollection([collection('vacia', 0), collection('llena', 2)], 'all')?.id).toBe('llena');
    expect(sampleCollection([collection('vacia', 0)], 'all')).toBeNull();
    expect(sampleCollection([collection('llena', 2)], 'llena')?.id).toBe('llena');
  });

  it('proyecta allowlist sin campos privados y conserva cero conocido y fuente', () => {
    const projected = toSharePreviewItem(item());
    expect(projected.price).toEqual({
      market: 0,
      currency: 'USD',
      provider: 'tcgdex',
      source: 'tcgplayer',
      fetchedAt: '2026-01-02T03:04:00.000Z',
    });
    expect(projected.card.setName).toBe('Scarlet & Violet');
    expect(JSON.stringify(projected)).not.toContain('nota privada');
    expect(JSON.stringify(projected)).not.toContain('private-item-id');
    expect(JSON.stringify(projected)).not.toContain('private-collection-id');
    expect(JSON.stringify(projected)).not.toContain('private-user-id');
    expect(JSON.stringify(projected)).not.toContain('isForTrade');
  });

  it('conserva el estado desconocido como “Sin referencia” y rechaza monedas no USD', () => {
    expect(toSharePreviewItem(item({ price: null })).price).toBeNull();
    expect(toSharePreviewItem(item({ price: { ...item().price!, currency: 'ARS' } })).price).toBeNull();
    expect(toSharePreviewItem(item({ price: { ...item().price!, market: null } })).price?.market).toBeNull();
  });

  it('no hereda precio de otra carta/variante ni convierte números inválidos en referencia', () => {
    const price = item().price!;
    expect(toSharePreviewItem(item({ price: { ...price, cardId: 'otra-carta' } })).price).toBeNull();
    expect(toSharePreviewItem(item({ price: { ...price, variant: 'holofoil' } })).price).toBeNull();
    expect(toSharePreviewItem(item({ price: { ...price, market: Infinity } })).price?.market).toBeNull();
    expect(toSharePreviewItem(item({ condition: 'HP' })).price?.market).toBe(0);
  });

  it('pide una fila con pageSize 1 y descarta la respuesta si se abortó', async () => {
    const controller = new AbortController();
    const loadItems = vi.fn(async (_id: string, _options: { page: number; pageSize: number }, signal: AbortSignal) => {
      const result: Paginated<CollectionItemDto> = { data: [item()], page: 1, pageSize: 1, total: 1, totalPages: 1 };
      controller.abort();
      expect(signal).toBe(controller.signal);
      return result;
    });

    await expect(loadSharePreviewItem('collection-1', controller.signal, loadItems)).resolves.toBeNull();
    expect(loadItems).toHaveBeenCalledWith('collection-1', { page: 1, pageSize: 1 }, controller.signal);
  });

  it('no hace el request cuando ya está abortado y devuelve vacío si no hay fila', async () => {
    const controller = new AbortController();
    const loadItems = vi.fn(async () => ({ data: [], page: 1, pageSize: 1, total: 0, totalPages: 0 }));
    controller.abort();
    await expect(loadSharePreviewItem('collection-1', controller.signal, loadItems)).resolves.toBeNull();
    expect(loadItems).not.toHaveBeenCalled();

    const available = new AbortController();
    await expect(loadSharePreviewItem('collection-1', available.signal, loadItems)).resolves.toBeNull();
  });

  it('presenta fecha estimada y fecha del servidor en hora local', () => {
    const now = Date.parse('2026-10-07T12:00:00.000Z');
    expect(estimatedExpiration(7, now)).toBe(formatExpiration('2026-10-14T12:00:00.000Z'));
    expect(formatExpiration('fecha inválida')).toBe('Fecha no disponible');
  });
});
