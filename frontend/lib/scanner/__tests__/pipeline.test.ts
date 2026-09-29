import { describe, expect, it } from 'vitest';

import {
  mergeBandAttempts,
  mergeLines,
  mergeParsed,
  pickBestAttempt,
  scoreAttempt,
  type ScanAttempt,
} from '../pipeline';
import type { OcrResult, ParsedScan } from '../types';

function attempt(confidence: number, nameGuess: string | null): ScanAttempt {
  const ocr: OcrResult = { text: 'x', lines: [], confidence };
  const parsed: ParsedScan = {
    lines: ['x'],
    nameGuess,
    numberGuess: null,
    setHint: null,
    setCode: null,
    confidence,
  };
  return { variant: 'grayscale', ocr, parsed };
}

function parse(over: Partial<ParsedScan> = {}): ParsedScan {
  return { lines: [], nameGuess: null, numberGuess: null, setHint: null, setCode: null, confidence: 0.5, ...over };
}

describe('scoreAttempt', () => {
  it('prefers the higher OCR confidence between two reads that both got a name', () => {
    expect(scoreAttempt(attempt(0.8, 'Pikachu'))).toBeGreaterThan(
      scoreAttempt(attempt(0.7, 'Pikachu')),
    );
  });

  it('rewards a name guess over a nameless read of the same confidence', () => {
    expect(scoreAttempt(attempt(0.8, 'Pikachu'))).toBeGreaterThan(
      scoreAttempt(attempt(0.8, null)),
    );
  });

  it('lets a name guess win over a much more confident read without one', () => {
    // El caso que motivó el cambio: la confianza de la carta entera la domina el
    // cuerpo de texto (poder, ataques, flavor), que se lee perfecto, mientras que
    // el nombre es lo que Tesseract se come. Confianza alta = "no leyó el nombre".
    expect(scoreAttempt(attempt(0.3, 'Pikachu'))).toBeGreaterThan(
      scoreAttempt(attempt(0.95, null)),
    );
  });
});

describe('pickBestAttempt', () => {
  it('keeps the first attempt on a tie (the safer, cheaper variant)', () => {
    const first = attempt(0.8, 'Pikachu');
    const second = { ...attempt(0.8, 'Pikachu'), variant: 'threshold' as const };
    expect(pickBestAttempt([first, second])).toBe(first);
  });

  it('returns null for an empty list', () => {
    expect(pickBestAttempt([])).toBeNull();
  });

  it('picks the read that produced a name, not the most confident one', () => {
    const withName = attempt(0.55, 'Pikachu');
    const withoutName = attempt(0.82, null);
    expect(pickBestAttempt([withoutName, withName])).toBe(withName);
  });
});

describe('mergeBandAttempts', () => {
  const band = (lines: string[], nameGuess: string | null, confidence: number): ScanAttempt => ({
    variant: 'nameband',
    ocr: { text: lines.join('\n'), lines: [], confidence },
    parsed: { lines, nameGuess, numberGuess: null, setHint: null, setCode: null, confidence },
  });

  it('devuelve la pasada única sin tocarla', () => {
    const only = band(['Charizard'], 'Charizard', 0.8);
    expect(mergeBandAttempts([only])).toBe(only);
  });

  it('devuelve null sin pasadas', () => {
    expect(mergeBandAttempts([])).toBeNull();
  });

  it('une las líneas de todas las pasadas y se desduplica', () => {
    const merged = mergeBandAttempts([
      band(['STAGE2', 'Chandclugel'], null, 0.4),
      band(['chandelure', 'Evolves from Lampent'], 'chandelure', 0.7),
    ]);

    expect(merged!.parsed.lines).toEqual([
      'STAGE2',
      'Chandclugel',
      'chandelure',
      'Evolves from Lampent',
    ]);
  });

  it('toma el nombre de la pasada con más confianza del parser', () => {
    const merged = mergeBandAttempts([
      band(['jiu ZUR'], 'jiu ZUR', 0.2),
      band(['Umbreon ex'], 'Umbreon ex', 0.9),
    ]);

    expect(merged!.parsed.nameGuess).toBe('Umbreon ex');
  });

  it('con una pasada sin nombre, usa el nombre de la que sí tiene', () => {
    const merged = mergeBandAttempts([
      band(['ceses'], null, 0.9),
      band(['Alolan Marowak'], 'Alolan Marowak', 0.3),
    ]);

    expect(merged!.parsed.nameGuess).toBe('Alolan Marowak');
  });

  it('no revienta cuando NINGUNA pasada saca nombre', () => {
    // Regresión: con las 3 bandas sin nombre (carta full-art con el nombre en
    // contorno blanco) el reduce de la lista filtrada reventaba con
    // "reduce of empty array with no initial value" y mataba el escaneo.
    const merged = mergeBandAttempts([
      band(['ASIC ye'], null, 0.2),
      band(['> HEIR'], null, 0.4),
      band(['ZO RUA'], null, 0.3),
    ]);

    expect(merged).not.toBeNull();
    expect(merged!.parsed.nameGuess).toBeNull();
    expect(merged!.parsed.lines).toEqual(['ASIC ye', '> HEIR', 'ZO RUA']);
  });
});

describe('mergeLines', () => {
  it('keeps the order of the groups and drops case-insensitive duplicates', () => {
    expect(mergeLines(['Charizard', 'BASIC'], ['basic', 'Charizard', '120 HP'])).toEqual([
      'Charizard',
      'BASIC',
      '120 HP',
    ]);
  });

  it('drops blank lines', () => {
    expect(mergeLines(['  ', 'Alakazam'], [''])).toEqual(['Alakazam']);
  });
});

describe('mergeParsed', () => {
  const band = parse({ lines: ['Charizard', '120 HP'], nameGuess: 'Charizard', confidence: 0.6 });
  const full = parse({
    lines: ['115% 4 Charizard', '4/102'],
    nameGuess: 'Charizard &',
    numberGuess: '4/102',
    setHint: 'Base',
    confidence: 0.8,
  });

  it('takes the name from the band and the number/set from the full card', () => {
    const merged = mergeParsed(band, full);
    expect(merged.nameGuess).toBe('Charizard');
    expect(merged.numberGuess).toBe('4/102');
    expect(merged.setHint).toBe('Base');
    expect(merged.confidence).toBe(0.8);
  });

  it('puts the band lines first so the name is never truncated away', () => {
    expect(mergeParsed(band, full).lines).toEqual([
      'Charizard',
      '120 HP',
      '115% 4 Charizard',
      '4/102',
    ]);
  });

  it('falls back to the full card when the band got no name', () => {
    const merged = mergeParsed(parse({ lines: ['STAGE'] }), full);
    expect(merged.nameGuess).toBe('Charizard &');
    expect(merged.lines).toEqual(['STAGE', '115% 4 Charizard', '4/102']);
  });

  it('returns the full parse untouched when there is no band', () => {
    expect(mergeParsed(null, full)).toBe(full);
  });
});
