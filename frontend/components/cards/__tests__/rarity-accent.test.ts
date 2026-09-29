import { describe, expect, it } from 'vitest';

import { rarityAccent } from '../rarity-accent';

/**
 * El nivel de una rareza decide si el tile lleva franja de color y de qué
 * color. La primera versión era un `Record` con las 12 rarezas de
 * `RARITY_OPTIONS`, y al verificarla contra la base real resultó que la columna
 * `cards.rarity` tiene **41** valores distintos que mezclan dos vocabularios:
 * pokemontcg.io con espacios (`Rare Holo`) y scrydex en camelCase
 * (`RareHolo`, `RareUltra`, `HyperRare`, `RadiantRare`).
 *
 * Con la lista cerrada, `RareHolo` (1621 cartas), `RareUltra` (799) y
 * `IllustrationRare` (511) caían en `base` y no dibujaban nada: la grilla
 * seguía siendo una pared de imágenes indistinguibles, que es exactamente lo
 * que la franja resolvió. Estos tests son la razón por la que el match es por
 * patrón.
 */

/** Las 41 rarezas reales de la base, más las de pokemontcg.io. */
const REAL_RARITIES = [
  'Common',
  'Uncommon',
  'Rare',
  'RareHolo',
  'Promo',
  'RareUltra',
  'IllustrationRare',
  'UltraRare',
  'DoubleRare',
  'RareSecret',
  'RareRainbow',
  'RareHoloEX',
  'RareHoloV',
  'SpecialIllustrationRare',
  'RareHoloGX',
  'RareShiny',
  'ShinyRare',
  'RareHoloVMAX',
  'TrainerGalleryRareHolo',
  'HyperRare',
  'RareHoloLV.X',
  'RareHoloVSTAR',
  'RareShinyGX',
  'ACESPECRare',
  'PikachuRare',
  'RareBREAK',
  'RarePrismStar',
  'RarePrime',
  'RareHoloStar',
  'ClassicCollection',
  'LEGEND',
  'RareShining',
  'RadiantRare',
  'RareACE',
  'ShinyUltraRare',
  'AmazingRare',
  'MegaHyperRare',
  'MEGA_ATTACK_RARE',
  'BlackWhiteRare',
  'FuturisticRare',
  'HoloRareV',
  'HoloRareVMAX',
  'RareHoloex',
  'HoloRareVSTAR',
  'Rare Holo',
  'Special Illustration Rare',
  'Ultra Rare',
  'Secret Rare',
  'Shiny Rare',
];

describe('rarityAccent', () => {
  it('las rarezas comunes no llevan franja', () => {
    for (const rarity of ['Common', 'Uncommon', 'Trainer', 'Energy', 'Promo']) {
      expect(rarityAccent(rarity), rarity).toMatchObject({ tier: 'base', bar: '' });
    }
  });

  it('las rarezas de un nivel intermediate llevan la franja azul', () => {
    for (const rarity of [
      'Rare',
      'Rare Holo',
      'RareHolo', // camelCase: la variante que se escapaba de la lista cerrada
      'Amazing Rare',
      'Shiny Rare',
      'Double Rare',
    ]) {
      expect(rarityAccent(rarity), rarity).toMatchObject({ tier: 'rare', bar: 'bg-info' });
    }
  });

  it('las rarezas de vitrine llevan la franja ámbar', () => {
    for (const rarity of [
      'Ultra Rare',
      'UltraRare',
      'RareUltra',
      'Secret Rare',
      'RareSecret',
      'Special Illustration Rare',
      'SpecialIllustrationRare',
      'HyperRare',
      'MegaHyperRare',
      'IllustrationRare',
      'RadiantRare',
    ]) {
      expect(rarityAccent(rarity), rarity).toMatchObject({ tier: 'chase', bar: 'bg-warning' });
    }
  });

  it('normaliza espacios, guiones y guiones bajos', () => {
    // Las tres formas tienen que caer en el mismo lado: es la diferencia entre
    // un acento que funciona y uno que no aparece nunca.
    expect(rarityAccent('Rare Holo')).toEqual(rarityAccent('RareHolo'));
    expect(rarityAccent('ultra-rare')).toEqual(rarityAccent('UltraRare'));
    expect(rarityAccent('ultra_rare')).toEqual(rarityAccent('UltraRare'));
    expect(rarityAccent('  RAREHOLO  ')).toEqual(rarityAccent('RareHolo'));
  });

  it('el orden de los patrones no pierde las rarezas dobles', () => {
    // `shinyultrarare` contiene "ultra", "rare" y "shiny": si se buscara
    // "rare" primero, una rareza de vitrine se pintaría como intermedia.
    expect(rarityAccent('ShinyUltraRare').tier).toBe('chase');
    expect(rarityAccent('RareHoloVSTAR').tier).toBe('rare');
  });

  it('ninguna rareza real del catálogo queda sin clasificar como base', () => {
    // La regresión que motivó el cambio: con la lista cerrada, las de scrydex
    // caían en `base` sin drawn. Cualquier `base` acá tiene que ser una rareza
    // que de verdad no sea rara.
    const NOT_REALLY_RARE = new Set(['Common', 'Uncommon', 'Promo', 'LEGEND', 'ClassicCollection']);
    const misclassified = REAL_RARITIES.filter(
      (rarity) => rarityAccent(rarity).tier === 'base' && !NOT_REALLY_RARE.has(rarity),
    );
    expect(misclassified).toEqual([]);
  });

  it('sin rareza no inventa un nivel', () => {
    for (const rarity of [null, undefined, '', '   ']) {
      expect(rarityAccent(rarity), String(rarity)).toMatchObject({ tier: 'base', bar: '' });
    }
  });

  it('el color del texto acompaña al nivel', () => {
    expect(rarityAccent('Common').text).toBe('text-tertiary');
    expect(rarityAccent('RareHolo').text).toBe('text-info');
    expect(rarityAccent('HyperRare').text).toBe('text-warning');
  });
});
