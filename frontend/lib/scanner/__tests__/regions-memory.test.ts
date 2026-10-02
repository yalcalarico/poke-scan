// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { extractFooterCode } from '../regions';
import { clearRememberedCards, findRememberedCard, rememberCard } from '../memory';
import { collectNumberCandidates } from '../parser';
import type { OcrResult, ParsedScan } from '../types';

function footer(text: string, confidence = 90): OcrResult {
  return { text, confidence: confidence / 100, lines: [{ text, confidence }] };
}

describe('código del pie', () => {
  it('acepta sólo tokens completos del vocabulario del catálogo', () => {
    expect(extractFooterCode(footer('30C EN 145/128'), ['30C'])).toBe('30C');
    expect(extractFooterCode(footer('EVOLVES'), ['EVO'])).toBeNull();
    expect(extractFooterCode(footer('LONGTOKEN30C'), ['30C'])).toBeNull();
  });
  it('rechaza baja confianza y códigos contradictorios', () => {
    expect(extractFooterCode(footer('30C', 40), ['30C'])).toBeNull();
    expect(extractFooterCode(footer('30C PAR'), ['30C', 'PAR'])).toBeNull();
  });
  it('preserva los prefijos del número de coleccionista', () => {
    expect(collectNumberCandidates('TG02/TG30')[0]?.value).toBe('TG2');
    expect(collectNumberCandidates('SV004/SV122')[0]?.value).toBe('SV4');
  });
});

describe('correcciones con consentimiento', () => {
  const parsed: ParsedScan = { lines: ['Hisuian Zorua 145/128 30C EN'], nameGuess: null, numberGuess: '145', setCode: '30C', setHint: null, confidence: 0.8 };
  beforeEach(() => localStorage.clear());
  it('recuerda la lectura exacta y separa usuarios', () => {
    expect(rememberCard('alice', parsed, 'me55-145')).toBe(true);
    expect(findRememberedCard('alice', parsed)).toBe('me55-145');
    expect(findRememberedCard('bob', parsed)).toBeNull();
    expect(findRememberedCard('alice', { ...parsed, lines: ['Hisuian Zorua 146/128 30C EN'] })).toBeNull();
    clearRememberedCards('alice');
    expect(findRememberedCard('alice', parsed)).toBeNull();
  });
  it('reemplaza una corrección y rechaza patrones demasiado cortos', () => {
    rememberCard('alice', parsed, 'wrong');
    rememberCard('alice', parsed, 'correct');
    expect(findRememberedCard('alice', parsed)).toBe('correct');
    expect(rememberCard('alice', { ...parsed, lines: ['Pikachu'] }, 'x')).toBe(false);
  });
});
