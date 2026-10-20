import { describe, expect, it } from 'vitest';
import { toCardDto, toPublicSharedCollection } from './schema';

const card = {
  id: 'sv1-1', name: 'Pikachu', supertype: 'Pokémon', subtypes: [], hp: '60', types: ['Lightning'],
  number: '1', rarity: 'Common', artist: 'Artist', setId: 'sv1', imageSmall: '/small.png', imageLarge: '/large.png',
};
const payload = {
  ownerDisplayName: 'Ada', collectionName: 'Binder', sharedAt: '2026-10-07T00:00:00.000Z', truncated: false,
  stats: { totalGroups: 1, totalCards: 2, uniqueCards: 1, duplicateCards: 1, setsCount: 1, totalValueUsd: null, pricedGroups: 0, cardsMissingPrice: 1 },
  items: [{ card, variant: 'normal', condition: 'NM', quantity: 2, price: null }],
};

describe('toPublicSharedCollection', () => {
  it('proyecta una allowlist e ignora campos privados extra', () => {
    const parsed = toPublicSharedCollection({
      ...payload,
      privateEmail: 'private@example.test',
      items: [{ ...payload.items[0], id: 'inventory-id', collectionId: 'collection-id', notes: 'privada', isForTrade: true, addedAt: 'yesterday' }],
    });
    expect(parsed).not.toBeNull();
    expect(JSON.stringify(parsed)).not.toContain('private@example.test');
    expect(JSON.stringify(parsed)).not.toContain('privada');
    expect(parsed?.items[0]).toEqual({ card, variant: 'normal', condition: 'NM', quantity: 2, price: null });
  });

  it('rechaza campos públicos obligatorios inválidos o stats inconsistentes', () => {
    expect(toPublicSharedCollection({ ...payload, items: [{ ...payload.items[0], quantity: '2' }] })).toBeNull();
    expect(toPublicSharedCollection({ ...payload, stats: { ...payload.stats, totalGroups: 2 } })).toBeNull();
  });

  it('exige el catálogo completo sin endurecer el parser genérico', () => {
    const incomplete = { id: card.id, name: card.name, setId: card.setId };
    expect(toCardDto(incomplete)).not.toBeNull();
    for (const invalidCard of [incomplete, { ...card, subtypes: ['válido', 3] }, { ...card, hp: 60 }, { ...card, imageSmall: false }, { ...card, supertype: '' }, { ...card, number: '' }, { ...card, imageLarge: '' }]) {
      expect(toPublicSharedCollection({ ...payload, items: [{ ...payload.items[0], card: invalidCard }] })).toBeNull();
    }
    for (const field of Object.keys(card)) {
      const incompleteCard: Record<string, unknown> = { ...card };
      delete incompleteCard[field];
      expect(toPublicSharedCollection({ ...payload, items: [{ ...payload.items[0], card: incompleteCard }] })).toBeNull();
    }
    const nullableStrings = { ...card, hp: '', rarity: null, artist: '' };
    expect(toPublicSharedCollection({ ...payload, items: [{ ...payload.items[0], card: nullableStrings }] })?.items[0]?.card).toEqual(nullableStrings);
  });

  it('rechaza sets incompletos y proyecta extras de catálogo y precio', () => {
    const set = { id: 'sv1', name: 'Scarlet', series: null, printedTotal: 1, total: 1, releaseDate: null, logoUrl: null, symbolUrl: null };
    const price = { market: 0, currency: 'USD', provider: null, source: 'tcgplayer', fetchedAt: payload.sharedAt };
    const known = { ...payload, stats: { ...payload.stats, pricedGroups: 1, cardsMissingPrice: 0, totalValueUsd: 0 }, items: [{ ...payload.items[0], card: { ...card, set, notes: 'SECRETO' }, price: { ...price, privateCost: 99 } }] };
    expect(toPublicSharedCollection(known)?.items[0]?.price).toEqual(price);
    expect(JSON.stringify(toPublicSharedCollection(known))).not.toContain('SECRETO');
    expect(JSON.stringify(toPublicSharedCollection(known))).not.toContain('privateCost');
    expect(toPublicSharedCollection({ ...known, items: [{ ...known.items[0], card: { ...card, set: { id: 'sv1', name: 'Scarlet' } } }] })).toBeNull();
    expect(toPublicSharedCollection({ ...known, items: [{ ...known.items[0], price: { ...price, currency: 'ARS' } }] })).toBeNull();
    expect(toPublicSharedCollection({ ...known, items: [{ ...known.items[0], price: { ...price, fetchedAt: 'ayer' } }] })).toBeNull();
  });

  it('valida conteos enteros, cobertura y valores desconocidos frente a cero conocido', () => {
    for (const field of ['totalGroups', 'totalCards', 'uniqueCards', 'duplicateCards', 'setsCount', 'pricedGroups', 'cardsMissingPrice']) {
      for (const invalid of [-1, 0.5]) {
        expect(toPublicSharedCollection({ ...payload, stats: { ...payload.stats, [field]: invalid } })).toBeNull();
      }
    }
    expect(toPublicSharedCollection({ ...payload, stats: { ...payload.stats, totalValueUsd: 0 } })).toBeNull();
    expect(toPublicSharedCollection({ ...payload, stats: { ...payload.stats, totalCards: 1 } })).toBeNull();
    expect(toPublicSharedCollection({ ...payload, stats: { ...payload.stats, uniqueCards: 2 } })).toBeNull();
    expect(toPublicSharedCollection({ ...payload, stats: { ...payload.stats, totalGroups: 0, totalCards: 0, uniqueCards: 0, duplicateCards: 0, setsCount: 0, cardsMissingPrice: 0, totalValueUsd: 0 }, items: [] })).not.toBeNull();
  });
});
