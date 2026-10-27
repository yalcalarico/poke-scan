import { describe, expect, it } from 'vitest';
import { matchProducts, parseBuild, parsePrices, parseProducts, type LocalTcgcsvCard } from './tcgcsv.adapter.js';
import { CLASSIC_IDENTITIES } from './classic-identities.js';
import { CELEBRATIONS_CLASSIC_IDENTITIES } from './celebrations-classic-identities.js';
import { NINTENDO_PROMO_IDENTITIES } from './nintendo-promo-identities.js';

const envelope = (results: unknown[], extra: Record<string, unknown> = {}): unknown => ({ success: true, errors: [], results, ...extra });
const product = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  productId: 716451, categoryId: 3, groupId: 24722, name: 'Articuno - 018/128', extendedData: [{ name: 'Number', value: '018/128' }], ...extra,
});
const price = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({ productId: 716451, subTypeName: 'Holofoil', lowPrice: 0, midPrice: null, highPrice: 12, marketPrice: null, ...extra });
const card: LocalTcgcsvCard = { id: 'me55-18', name: 'Articuno', number: '18', language: 'en', setId: 'me55', printedTotal: 128 };

it('Rumble y energías SVE conservan número, idioma e impresión aunque el feed omita el total', () => {
  const rumble = { ...card, id: 'ru1-1', setId: 'ru1', name: 'Venusaur', number: '1', printedTotal: 16 };
  const venusaur = { productId: 90320, groupId: 1433, name: 'Venusaur', number: '1', language: 'English' };
  expect(matchProducts([rumble], [venusaur], { ru1: 1433 })).toEqual(new Map([[90320, 'ru1-1']]));
  const grass = { ...card, id: 'sve-1', setId: 'sve', name: 'Basic Grass Energy', number: '1', printedTotal: 8 };
  const laterGrass = { ...grass, id: 'sve-9', number: '9' };
  const basic = { productId: 475425, groupId: 24382, name: 'Basic Grass Energy - 001', number: '001', language: 'English' };
  const later = { ...basic, productId: 578864, name: 'Basic Grass Energy - 009', number: '009' };
  const cosmos = { ...basic, productId: 517177, name: 'Basic Grass Energy (Cosmos Holo)' };
  const cracked = { ...later, productId: 599740, name: 'Basic Grass Energy (Cracked Ice Holo)' };
  const groups = { sve: 24382 };
  expect(matchProducts([grass, laterGrass], [basic, later, cosmos, cracked], groups)).toEqual(new Map([[475425, 'sve-1'], [578864, 'sve-9']]));
  expect(matchProducts([grass, laterGrass], [cosmos, cracked], groups).size).toBe(0);
  expect(matchProducts([grass], [later], groups).size).toBe(0);
  expect(matchProducts([{ ...grass, language: 'ja' }], [basic], groups).size).toBe(0);
  expect(matchProducts([grass], [basic, { ...basic, productId: 999 }], groups).size).toBe(0);
});

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

it('promos conservan número sin denominador y Trainer Kits rechazan productos ambiguos entre sets', () => {
  const promo: LocalTcgcsvCard = { ...card, id: 'swshp-SWSH001', setId: 'swshp', name: 'Grookey', number: 'SWSH001', printedTotal: 307 };
  expect(matchProducts([promo], [{ productId: 1, groupId: 2545, name: 'Grookey - SWSH001', number: 'SWSH001', language: 'English' }], { swshp: 2545 })).toEqual(new Map([[1, promo.id]]));
  const a: LocalTcgcsvCard = { ...card, id: 'tk1a-1', setId: 'tk1a', name: 'Pikachu', number: '1', printedTotal: 10 };
  const b = { ...a, id: 'tk1b-1', setId: 'tk1b' };
  const remote = [{ productId: 2, groupId: 1543, name: 'Pikachu - 1/10', number: '1/10', language: 'English' }];
  expect(matchProducts([a, b], remote, { tk1a: 1543, tk1b: 1543 }).size).toBe(0);
  expect(matchProducts([a, { ...b, name: 'Raichu' }], remote, { tk1a: 1543, tk1b: 1543 })).toEqual(new Map([[2, a.id]]));
});

it('tolera padding equivalente en sufijo McDonald y promos con denominador verificado', () => {
  const mc: LocalTcgcsvCard = { ...card, id: 'mcd19-1', setId: 'mcd19', name: 'Caterpie', number: '1', printedTotal: 12 };
  const remote = [{ productId: 3, groupId: 2555, name: 'Caterpie - 1/12', number: '001/012', language: 'English' }];
  expect(matchProducts([mc], remote, { mcd19: 2555 })).toEqual(new Map([[3, mc.id]]));
  expect(matchProducts([mc], [{ ...remote[0], number: '001/013' }], { mcd19: 2555 }).size).toBe(0);
  const promo = { ...mc, id: 'basep-6', setId: 'basep', name: 'Arcanine', number: '6', printedTotal: 53 };
  const products = [{ productId: 4, groupId: 1418, name: 'Arcanine', number: '06/53', language: 'English' }];
  expect(matchProducts([promo], products, { basep: 1418 })).toEqual(new Map([[4, promo.id]]));
  expect(matchProducts([promo], [{ ...products[0], number: '06/54' }], { basep: 1418 }).size).toBe(0);
  expect(matchProducts([promo], [{ ...products[0], name: 'Arcanine (1st Edition)' }], { basep: 1418 }).size).toBe(0);
  const best = { ...promo, id: 'bp-1', setId: 'bp', name: 'Electabuzz', number: '1', printedTotal: 9 };
  const bestProduct = { productId: 5, groupId: 1455, name: 'Electabuzz - 1', number: '001/009', language: 'English' };
  expect(matchProducts([best], [bestProduct], { bp: 1455 })).toEqual(new Map([[5, best.id]]));
  expect(matchProducts([best], [{ ...bestProduct, name: 'Electabuzz - 2' }], { bp: 1455 }).size).toBe(0);
  expect(matchProducts([best], [{ ...bestProduct, number: '001/010' }], { bp: 1455 }).size).toBe(0);
});

it('conserva los prefijos SV/TG/GG al completar el total de un subset', () => {
  for (const [prefix, total] of [['SV', 94], ['TG', 30], ['GG', 70]] as const) {
    const local: LocalTcgcsvCard = { ...card, id: `test-${prefix}`, setId: `subset-${prefix}`, name: 'SubsetCard', number: `${prefix}001`, printedTotal: total };
    const remote = { productId: 10, groupId: 1234, name: 'SubsetCard', number: `${prefix}1/${prefix}${total}`, language: 'English' };
    const groups = { [local.setId]: 1234 };
    expect(matchProducts([local], [remote], groups)).toEqual(new Map([[10, local.id]]));
    expect(matchProducts([local], [{ ...remote, number: `${prefix}1/OTHER${total}` }], groups).size).toBe(0);
    expect(matchProducts([local], [{ ...remote, number: `${prefix}1/${prefix}${total + 1}` }], groups).size).toBe(0);
    expect(matchProducts([local], [{ ...remote, number: `OTHER1/${prefix}${total}` }], groups).size).toBe(0);
    expect(matchProducts([local], [{ ...remote, language: 'Japanese' }], groups).size).toBe(0);
    expect(matchProducts([local], [remote, { ...remote, productId: 11 }], groups).size).toBe(0);
  }
});

it('Celebrations Classic exige las 25 identidades revisadas y sus denominadores originales', () => {
  const cards = CELEBRATIONS_CLASSIC_IDENTITIES.map((r) => ({ id: r.cardId, setId: 'cel25c', name: r.localName, number: r.localNumber, language: 'en', printedTotal: 25 }));
  const products = CELEBRATIONS_CLASSIC_IDENTITIES.map((r) => ({ productId: r.productId, groupId: 2931, name: r.productName, number: r.fullNumber, language: 'English' }));
  expect(matchProducts(cards, products, { cel25c: 2931 }).size).toBe(25);
  expect(matchProducts(cards, products.map((r) => ({ ...r, number: r.number.replace(/\/.*/, '/999') })), { cel25c: 2931 }).size).toBe(0);
  expect(matchProducts(cards, products.map((r) => ({ ...r, groupId: 24837 })), { cel25c: 24837 }).size).toBe(0);
  expect(matchProducts(cards, products.map((r) => ({ ...r, productId: r.productId + 1_000_000 })), { cel25c: 2931 }).size).toBe(0);
  expect(matchProducts(cards, products.map((r) => ({ ...r, name: `${r.name} (otra edición)` })), { cel25c: 2931 }).size).toBe(0);
});

it('Nintendo Promos usa productos revisados y conserva ambiguas las versiones alternativas', () => {
  const cards = NINTENDO_PROMO_IDENTITIES.map((r) => ({ id: r.cardId, setId: 'np', name: r.localName, number: r.localNumber, language: 'en', printedTotal: 40 }));
  const products = NINTENDO_PROMO_IDENTITIES.map((r) => ({ productId: r.productId, groupId: 1423, name: r.productName, number: r.fullNumber, language: 'English' }));
  expect(matchProducts(cards, products, { np: 1423 }).size).toBe(27);
  expect(matchProducts(cards, products.map((r) => ({ ...r, productId: r.productId + 1_000_000 })), { np: 1423 }).size).toBe(0);
  expect(matchProducts(cards, products.map((r) => ({ ...r, name: `${r.name} [Winner]` })), { np: 1423 }).size).toBe(0);
  expect(matchProducts(cards, products.map((r) => ({ ...r, groupId: 1453 })), { np: 1453 }).size).toBe(0);
  const ambiguous = { ...card, id: 'np-17', setId: 'np', name: 'Torchic', number: '17', printedTotal: 40 };
  expect(matchProducts([ambiguous], [
    { productId: 89953, groupId: 1423, name: 'Torchic - 017 (EX Deck Tin)', number: '017', language: 'English' },
    { productId: 153317, groupId: 1423, name: 'Torchic - 017 (Target Promo)', number: '017', language: 'English' },
  ], { np: 1423 }).size).toBe(0);
});

it('Supreme Victors acepta el número corto sólo con su grupo y total revisados', () => {
  const local = { ...card, id: 'pl3-1', setId: 'pl3', name: 'Absol G', number: '1', printedTotal: 147 };
  const remote = { productId: 83457, groupId: 1384, name: 'Absol G', number: '1', language: 'English' };
  expect(matchProducts([local], [remote], { pl3: 1384 })).toEqual(new Map([[83457, 'pl3-1']]));
  expect(matchProducts([{ ...local, printedTotal: 148 }], [remote], { pl3: 1384 }).size).toBe(0);
  expect(matchProducts([local], [{ ...remote, groupId: 1234 }], { pl3: 1234 }).size).toBe(0);
  expect(matchProducts([local], [{ ...remote, name: 'Absol G (otra edición)' }], { pl3: 1384 }).size).toBe(0);
});
