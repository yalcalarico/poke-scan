import { describe, expect, it } from 'vitest';
import { matchProducts, parseBuild, parsePrices, parseProducts, type LocalTcgcsvCard } from './tcgcsv.adapter.js';
import { CLASSIC_IDENTITIES } from './classic-identities.js';

const envelope = (results: unknown[], extra: Record<string, unknown> = {}): unknown => ({ success: true, errors: [], results, ...extra });
const product = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  productId: 716451, categoryId: 3, groupId: 24722, name: 'Articuno - 018/128', extendedData: [{ name: 'Number', value: '018/128' }], ...extra,
});
const price = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({ productId: 716451, subTypeName: 'Holofoil', lowPrice: 0, midPrice: null, highPrice: 12, marketPrice: null, ...extra });
const card: LocalTcgcsvCard = { id: 'me55-18', name: 'Articuno', number: '18', language: 'en', setId: 'me55', printedTotal: 128 };

describe('TCGCSV: identidad y validación del lote', () => {
  it('lee el build real con offset UTC sin colon y rechaza fechas normalizadas/futuras', () => {
    expect(parseBuild('2026-10-12T20:05:44+0000', new Date('2026-10-13T00:00:00Z')).toISOString()).toBe('2026-10-12T20:05:44.000Z');
    expect(() => parseBuild('2026-02-30T00:00:00Z', new Date('2026-10-13'))).toThrow();
    expect(() => parseBuild('2027-01-01T00:00:00Z', new Date('2026-10-13'))).toThrow();
    expect(() => parseBuild('2026-10-12 20:05:44')).toThrow();
  });
  it('asocia el sufijo exacto Number y conserva edición, idioma y grupo', () => {
    const parsed = parseProducts(envelope([product(), product({ productId: 716220, name: 'Articuno - 132/128', extendedData: [{ name: 'Number', value: '132/128' }] })]), 24722);
    expect(matchProducts([card, { ...card, id: 'me55-132', number: '132' }], parsed)).toEqual(new Map([[716451, 'me55-18'], [716220, 'me55-132']]));
    expect(matchProducts([{ ...card, language: 'ja' }], parsed).size).toBe(0);
    expect(matchProducts([{ ...card, printedTotal: 129 }], parsed).size).toBe(0);
    expect(matchProducts([card, { ...card, id: 'duplicate' }], parsed).size).toBe(0);
  });
  it('no elige uno entre productos con la misma identidad', () => {
    expect(matchProducts([card], parseProducts(envelope([product(), product({ productId: 1 })]), 24722)).size).toBe(0);
  });
  it('descarta sellados sin Number y exige todos los campos de los 30 Classic revisados', () => {
    const products = CLASSIC_IDENTITIES.map((entry) => ({ productId: entry.productId, groupId: 24837, language: 'English', number: entry.fullNumber, name: entry.productName }));
    const cards = CLASSIC_IDENTITIES.map((entry) => ({ id: entry.cardId, name: entry.localName, number: entry.localNumber, setId: 'me55c', language: 'en', printedTotal: null }));
    expect(matchProducts(cards, products).size).toBe(30);
    expect(matchProducts(cards, products.map((entry) => ({ ...entry, number: entry.number?.replace(/\/.*/, '/999') ?? null }))).size).toBe(0);
    expect(matchProducts(cards.map((entry) => ({ ...entry, name: `${entry.name} alterado` })), products).size).toBe(0);
    expect(matchProducts(cards, products.map((entry) => ({ ...entry, groupId: 24722 }))).size).toBe(0);
    expect(matchProducts([card], [{ productId: 1, groupId: 24722, language: 'English', number: null, name: 'Articuno' }]).size).toBe(0);
  });
  it('valida relaciones, duplicados, moneda, importes y variantes sin convertir null a cero', () => {
    const products = parseProducts(envelope([product()]), 24722);
    const parsed = parsePrices(envelope([price({ marketPrice: 0 }), price({ subTypeName: 'Reverse Holofoil' })]), products);
    expect(parsed.map((entry) => [entry.variant, entry.market])).toEqual([['holofoil', 0], ['reverseHolofoil', null]]);
    expect(parsePrices(envelope([price({ subTypeName: 'Unknown Foil' })]), products)[0].variant).toBe('');
    for (const invalid of [{ marketPrice: -1 }, { marketPrice: Infinity }, { marketPrice: '1' }, { currency: 'EUR' }, { productId: 1 }]) expect(() => parsePrices(envelope([price(invalid)]), products)).toThrow();
    expect(() => parsePrices(envelope([price(), price()]), products)).toThrow();
    expect(() => parseProducts(envelope([product()], { totalItems: 2 }), 24722)).toThrow();
    expect(() => parseProducts(envelope([product({ groupId: 24837 })]), 24722)).toThrow();
    expect(() => parseProducts(envelope([], { success: false, errors: ['falló'] }), 24722)).toThrow();
  });
});


describe('Ascended Heroes: asociación explícita del grupo', () => {
  const local: LocalTcgcsvCard = { id: 'me2pt5-54', name: 'Pikachu', number: '54', language: 'en', setId: 'me2pt5', printedTotal: 217 };
  const remote = { productId: 123456, groupId: 24541, language: 'English', number: '054/217', name: 'Pikachu - 054/217' };
  it('completa el denominador real y asocia número, nombre, idioma y grupo exactos', () => {
    expect(matchProducts([local], [remote])).toEqual(new Map([[123456, 'me2pt5-54']]));
    expect(matchProducts([{ ...local, printedTotal: 218 }], [remote]).size).toBe(0);
    expect(matchProducts([{ ...local, language: 'ja' }], [remote]).size).toBe(0);
    expect(matchProducts([local], [{ ...remote, groupId: 24722 }]).size).toBe(0);
  });
  it('conserva promos/impresiones diferentes y no elige una identidad duplicada', () => {
    expect(matchProducts([local], [{ ...remote, name: 'Pikachu (Poke Ball Pattern) - 054/217' }]).size).toBe(0);
    expect(matchProducts([local], [remote, { ...remote, productId: 654321 }]).size).toBe(0);
  });
});
