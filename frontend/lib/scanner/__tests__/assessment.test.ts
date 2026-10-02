import { describe, expect, it } from 'vitest';
import { assessCandidates } from '../assessment';
import type { CandidateSignalsDto } from '@/types/api';

const empty: CandidateSignalsDto = { numberHint: null, setName: null, setCode: null,
  printedNumber: null, hp: null, artist: null, rarity: null };
const candidate = (rawScore: number, signals: Partial<CandidateSignalsDto> = {}) =>
  ({ score: Math.min(1, rawScore), rawScore, signals: { ...empty, ...signals } });

describe('evidencia de edición', () => {
  it('un score saturado no confirma la edición', () => {
    expect(assessCandidates([candidate(1.4)])).toBe('ambiguous');
  });
  it('necesita corroboración y separación entre los candidatos', () => {
    expect(assessCandidates([candidate(1.4, { printedNumber: true }), candidate(1.38)])).toBe('ambiguous');
    expect(assessCandidates([candidate(1.4, { printedNumber: true }), candidate(1.1)])).toBe('confident');
  });
  it('una contradicción de impresión obliga a confirmar', () => {
    expect(assessCandidates([candidate(1.4, { printedNumber: true, setCode: false })])).toBe('ambiguous');
    expect(assessCandidates([candidate(1.4, { setCode: true, numberHint: true, printedNumber: false })])).toBe('ambiguous');
  });
  it('código y número corroboran y una lectura débil no confirma', () => {
    expect(assessCandidates([candidate(1.4, { setCode: true, numberHint: true })])).toBe('confident');
    expect(assessCandidates([candidate(0.5, { printedNumber: true })])).toBe('low');
    expect(assessCandidates([])).toBe('low');
  });
});
