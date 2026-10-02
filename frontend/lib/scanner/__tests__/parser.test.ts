import { describe, expect, it } from 'vitest';

import samples from '../__fixtures__/ocr-samples.json';
import {
  extractNameCandidates,
  extractNumberCandidates,
  extractSetHints,
  parseOcrText,
} from '../parser';

interface Sample {
  id: string;
  label: string;
  text: string;
}

const byId = new Map<string, Sample>(
  (samples as Sample[]).map((sample) => [sample.id, sample]),
);

function textOf(id: string): string {
  const sample = byId.get(id);
  if (!sample) throw new Error(`missing fixture ${id}`);
  return sample.text;
}

/**
 * Ground truth from the real OCR run (pokemontcg.io card images, Tesseract 7).
 * The first name candidate must be the real card name.
 */
const NAME_TRUTH: { id: string; name: string }[] = [
  { id: 'base1-4', name: 'Charizard' },
  { id: 'base1-1', name: 'Alakazam' },
  { id: 'xy5-1', name: 'Weedle' },
  { id: 'bw10-26', name: 'Abomasnow' },
  { id: 'hgss4-1', name: 'Aggron' },
  { id: 'pl1-1', name: 'Ampharos' },
  { id: 'neo1-10', name: 'Meganium' },
];

describe('extractNameCandidates (real OCR text)', () => {
  it('conserva ex y recupera el logo estilizado de la foto de Umbreon', () => {
    expect(parseOcrText('Umbreon ex\nHP270').nameGuess).toBe('Umbreon ex');
    expect(parseOcrText('=X Umbreon €X _').nameGuess).toBe('Umbreon ex');
    expect(parseOcrText('7 Umbreon &X').nameGuess).toBe('Umbreon ex');
  });

  it('conserva sufijos de identidad sin convertirlos en nombres solos', () => {
    expect(parseOcrText('Umbreon EX').nameGuess).toBe('Umbreon EX');
    expect(parseOcrText('Pikachu VMAX').nameGuess).toBe('Pikachu VMAX');
    expect(parseOcrText('Gengar V').nameGuess).toBe('Gengar V');
    expect(parseOcrText('ex GX V VMAX VSTAR').nameGuess).toBeNull();
    expect(parseOcrText('Pokémon ex rule').nameGuess).not.toBe('Pokémon ex');
  });
  it.each(NAME_TRUTH)('$id → $name', ({ id, name }) => {
    const candidates = extractNameCandidates(textOf(id));
    expect(candidates[0]).toBe(name);
  });

  // Known limitation: on sm4-12 (Alolan Marowak) Tesseract reads the name as
  // "Bone Keeper", the flavour-text heading. No client-side heuristic can recover
  // "Marowak" from that string; only a catalog lookup on the backend can.
  it.todo('sm4-12 (Alolan Marowak) is OCR’d as "Bone Keeper" — needs backend matching');

  it('never returns empty or noise-only candidates for the fixtures', () => {
    for (const { id } of NAME_TRUTH) {
      const candidates = extractNameCandidates(textOf(id));
      expect(candidates.length).toBeGreaterThan(0);
      for (const candidate of candidates) {
        expect(candidate.trim()).not.toBe('');
        expect(candidate).toMatch(/^[\p{L}\p{N}' -]+$/u);
      }
    }
  });

  it('is deterministic and deduplicated', () => {
    const first = extractNameCandidates(textOf('base1-4'));
    const second = extractNameCandidates(textOf('base1-4'));
    expect(first).toEqual(second);
    expect(new Set(first).size).toBe(first.length);
  });
});

describe('extractNumberCandidates', () => {
  it('reads the numerator of "25/203"', () => {
    const candidates = extractNumberCandidates('Base Set card 25/203');
    expect(candidates[0]).toBe('25');
  });

  it('reads "NO. 105" and "N0.18" style numbers', () => {
    expect(extractNumberCandidates('NO. 105 Bone Keeper')[0]).toBe('105');
    expect(extractNumberCandidates('I NO.18 Light Pokémon')[0]).toBe('18');
  });

  it('ranks the set number/total format above the # pokedex number', () => {
    const candidates = extractNumberCandidates('LV.76 #6\n© 1999 Wizards 4/102');
    expect(candidates[0]).toBe('4');
    expect(candidates).toContain('6');
  });

  it('does not invent numbers', () => {
    // No card-number shape at all: only HP/damage/pokedex-looking noise.
    const candidates = extractNumberCandidates(
      'Razor Leaf 40\nBang Heads 80\nSeats are 4 and 7\nMeganium 100 HP',
    );
    expect(candidates.length).toBeLessThanOrEqual(3);
    for (const candidate of candidates) expect(candidate).toMatch(/^\d{1,3}$/);
  });

  it('returns an empty list for text with no number at all', () => {
    expect(extractNumberCandidates('Charizard\nweakness resistance retreat cost')).toEqual([]);
  });
});

describe('extractSetHints', () => {
  it('finds known set names', () => {
    expect(extractSetHints('From the Jungle set')).toContain('Jungle');
    expect(extractSetHints('Sword & Shield promo')).toContain('Sword & Shield');
  });

  it('returns nothing for a text with no set names', () => {
    expect(extractSetHints('Aggron "a0 @\nweakness resistance retreat cost')).toEqual([]);
  });
});

describe('parseOcrText', () => {
  it('prioriza el nombre completo sobre fragmentos del OCR de IMG_4987', () => {
    const text = ['CTY EE - Ls Sy n', 'STAGE] of oT.', '7 Sal preon &X',
      '3 ~~ Ca', 'V7. VL ——', '=X Umbreon €X _',
      'gem qe 3 3 ’% : . SV', '7 2 L nbreon €X'].join('\n');
    expect(parseOcrText(text).nameGuess).toBe('Umbreon ex');
  });

  it('parses the full Charizard text', () => {
    const parsed = parseOcrText(textOf('base1-4'));

    expect(parsed.nameGuess).toBe('Charizard');
    expect(parsed.confidence).toBeGreaterThan(0);
    expect(parsed.confidence).toBeLessThanOrEqual(1);
    expect(parsed.numberGuess).toBe('4');
    expect(parsed.lines.length).toBeGreaterThan(5);
    expect(parsed.lines.length).toBeLessThanOrEqual(60);
  });

  it('guesses the name for every fixture', () => {
    for (const { id, name } of NAME_TRUTH) {
      expect(parseOcrText(textOf(id)).nameGuess, id).toBe(name);
    }
  });

  it('uses the per-line confidences when they are provided', () => {
    const lines = [
      { text: 'sthce , Evolves from Eon Put Charizard on the Stage | card', confidence: 72 },
      { text: '115% 4 Charizard &', confidence: 68 },
      { text: 'weakness resistance retreat cost', confidence: 90 },
    ];
    const parsed = parseOcrText('', lines);

    expect(parsed.nameGuess).toBe('Charizard');
    expect(parsed.lines).toEqual(lines.map((line) => line.text));
    expect(parsed.confidence).toBeCloseTo(0.7, 1);
  });

  it('returns an empty-ish parse for garbage input', () => {
    const parsed = parseOcrText(';;;\n&&\n@@@');
    expect(parsed.nameGuess).toBeNull();
    expect(parsed.numberGuess).toBeNull();
    expect(parsed.setHint).toBeNull();
    expect(parsed.confidence).toBe(0);
  });
});
