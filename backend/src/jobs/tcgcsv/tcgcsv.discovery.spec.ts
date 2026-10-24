import { describe, expect, it } from 'vitest';
import { buildIsNew, discoverSetMappings, parseGroups, type TcgcsvGroup, type TcgcsvLocalSet } from './tcgcsv.discovery.js';

const local: TcgcsvLocalSet = { id: 'sv4', name: 'Paradox Rift', series: 'Scarlet & Violet', englishOnly: true };
const group: TcgcsvGroup = { groupId: 23286, name: 'SV04: Paradox Rift', isSupplemental: false };
describe('TCGCSV: descubrimiento conserva identidades', () => {
  it('normaliza prefijos explícitos, ampersand y títulos base revisados', () => {
    expect(discoverSetMappings([local], [group]).mappings).toEqual([{ setId: 'sv4', groupId: 23286 }]);
    expect(discoverSetMappings([{ ...local, name: 'Scarlet & Violet' }], [{ ...group, name: 'SV01: Scarlet & Violet Base Set' }]).mappings).toHaveLength(1);
    expect(discoverSetMappings([{ ...local, name: 'Delta Species', series: 'EX' }], [{ ...group, name: 'EX Delta Species' }]).mappings).toHaveLength(1);
    expect(discoverSetMappings([{ ...local, name: 'Base', series: 'Base' }], [{ ...group, name: 'Base Set' }]).mappings).toHaveLength(1);
  });
  it('normaliza el prefijo HGSS del catálogo sin fusionar sets distintos', () => {
    const sets: TcgcsvLocalSet[] = [
      { id: 'hgss2', name: 'HS—Unleashed', series: 'HeartGold & SoulSilver', englishOnly: true },
      { id: 'hgss3', name: 'HS—Undaunted', series: 'HeartGold & SoulSilver', englishOnly: true },
      { id: 'hgss4', name: 'HS—Triumphant', series: 'HeartGold & SoulSilver', englishOnly: true },
    ];
    const groups: TcgcsvGroup[] = [
      { groupId: 1399, name: 'Unleashed', isSupplemental: false },
      { groupId: 1403, name: 'Undaunted', isSupplemental: false },
      { groupId: 1381, name: 'Triumphant', isSupplemental: false },
    ];
    expect(discoverSetMappings(sets, groups).mappings).toEqual([
      { setId: 'hgss2', groupId: 1399 },
      { setId: 'hgss3', groupId: 1403 },
      { setId: 'hgss4', groupId: 1381 },
    ]);
    const ambiguous = discoverSetMappings([...sets, { ...sets[2], id: 'other' }], groups);
    expect(ambiguous.mappings.map(({ setId }) => setId)).toEqual(['hgss2', 'hgss3']);
    expect(ambiguous.missing.map(({ setId }) => setId)).toEqual(['hgss4', 'other']);
  });
  it('ignora dos puntos editoriales pero conserva la identidad del subtítulo', () => {
    const sets: TcgcsvLocalSet[] = [
      { id: 'sma', name: 'Hidden Fates Shiny Vault', series: 'Sun & Moon', englishOnly: true },
      { id: 'swsh45sv', name: 'Shining Fates Shiny Vault', series: 'Sword & Shield', englishOnly: true },
      { id: 'swsh12pt5gg', name: 'Crown Zenith Galarian Gallery', series: 'Sword & Shield', englishOnly: true },
    ];
    const groups: TcgcsvGroup[] = [
      { groupId: 2594, name: 'Hidden Fates: Shiny Vault', isSupplemental: false },
      { groupId: 2781, name: 'Shining Fates: Shiny Vault', isSupplemental: false },
      { groupId: 17689, name: 'SWSH: Crown Zenith: Galarian Gallery', isSupplemental: false },
    ];
    expect(discoverSetMappings(sets, groups).mappings).toEqual([
      { setId: 'sma', groupId: 2594 },
      { setId: 'swsh45sv', groupId: 2781 },
      { setId: 'swsh12pt5gg', groupId: 17689 },
    ]);
    expect(discoverSetMappings([sets[0]], [{ ...groups[0], name: 'Hidden Fates' }]).mappings).toHaveLength(0);
  });
  it('rechaza idioma, serie, región, ediciones y subsets distintos sin fuzzy join', () => {
    expect(discoverSetMappings([{ ...local, englishOnly: false }], [group]).mappings).toHaveLength(0);
    expect(discoverSetMappings([{ ...local, series: 'Sun & Moon' }], [group]).mappings).toHaveLength(0);
    for (const name of ['SV04: Paradox Rift Japanese', 'SV04: Paradox Rift Trainer Gallery', 'SV04: Paradox Rift (1st Edition)', 'SV04: Paradox Rifts', 'SV04: Paradox Rift Southeast Asia Exclusives']) {
      expect(discoverSetMappings([local], [{ ...group, name }]).mappings).toHaveLength(0);
    }
    expect(discoverSetMappings([local], [{ ...group, isSupplemental: true }]).mappings).toHaveLength(0);
  });
  it('no selecciona entre dos grupos o dos sets locales con la misma identidad', () => {
    expect(discoverSetMappings([local], [group, { ...group, groupId: 999 }]).missing[0].reason).toBe('grupo ambiguo');
    expect(discoverSetMappings([local, { ...local, id: 'other' }], [group]).mappings).toHaveLength(0);
  });
  it('preserva pins y registro existente y rechaza conflictos sin sobrescribir', () => {
    expect(discoverSetMappings([{ ...local, id: 'me55c', name: 'Classic' }], []).mappings).toEqual([{ setId: 'me55c', groupId: 24837 }]);
    expect(discoverSetMappings([local], [], [{ setId: local.id, groupId: group.groupId }]).mappings).toHaveLength(1);
    expect(discoverSetMappings([local], [group], [{ setId: 'other', groupId: group.groupId }]).mappings).toHaveLength(0);
    expect(discoverSetMappings([{ ...local, id: 'me55' }], [], [{ setId: 'me55', groupId: 999 }]).mappings).toHaveLength(0);
  });
  it('valida completitud y duplicados del catálogo antes de registrar', () => {
    const envelope = { success: true, errors: [], totalItems: 1, results: [{ ...group, categoryId: 3 }] };
    expect(parseGroups(envelope)).toEqual([group]);
    expect(() => parseGroups({ ...envelope, totalItems: 2 })).toThrow();
    expect(() => parseGroups({ ...envelope, results: [...envelope.results, ...envelope.results], totalItems: 2 })).toThrow();
    expect(() => parseGroups({ ...envelope, results: [{ ...group, categoryId: 2 }] })).toThrow();
  });
  it('la igualdad u orden anterior de builds no autoriza una reimportación', () => {
    const build = new Date('2026-10-12T20:05:44Z');
    expect(buildIsNew(build, null)).toBe(true);
    expect(buildIsNew(build, build)).toBe(false);
    expect(buildIsNew(new Date(build.getTime() - 1), build)).toBe(false);
    expect(buildIsNew(new Date(build.getTime() + 1), build)).toBe(true);
  });
});

it('admite únicamente equivalencias revisadas, incluidos suplementarios y grupos compartidos', () => {
  const sets: TcgcsvLocalSet[] = [
    { id: 'swshp', name: 'SWSH Black Star Promos', series: 'Sword & Shield', englishOnly: true },
    { id: 'tk1a', name: 'EX Trainer Kit Latias', series: 'EX', englishOnly: true },
    { id: 'tk1b', name: 'EX Trainer Kit Latios', series: 'EX', englishOnly: true },
    { id: 'mcd21', name: "McDonald's Collection 2021", series: 'Other', englishOnly: true },
  ];
  const groups: TcgcsvGroup[] = [
    { groupId: 2545, name: 'SWSH: Sword & Shield Promo Cards', isSupplemental: false },
    { groupId: 1543, name: 'EX Trainer Kit 1: Latias & Latios', isSupplemental: false },
    { groupId: 2782, name: "McDonald's 25th Anniversary Promos", isSupplemental: true },
  ];
  expect(discoverSetMappings(sets, groups).mappings).toEqual([
    { setId: 'swshp', groupId: 2545 }, { setId: 'tk1a', groupId: 1543 },
    { setId: 'tk1b', groupId: 1543 }, { setId: 'mcd21', groupId: 2782 },
  ]);
  expect(discoverSetMappings(sets, groups.map((g) => ({ ...g, name: `${g.name} Japanese` }))).mappings).toHaveLength(0);
  expect(discoverSetMappings([{ ...sets[3], englishOnly: false }], groups).mappings).toHaveLength(0);
  expect(discoverSetMappings(sets.slice(1, 3), groups, [{ setId: 'other', groupId: 1543 }]).mappings).toHaveLength(0);
});
