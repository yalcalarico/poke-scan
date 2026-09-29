import { describe, expect, it } from 'vitest';

import { isOcrWorkerReady, toOcrResult, type RecognizeData } from '../ocr';

const flatData = {
  text: 'a\nb',
  confidence: 42,
  lines: [
    { text: ' a  \n', confidence: 60 },
    { text: '  ', confidence: 10 },
    { text: 'b', confidence: 40 },
  ],
} as unknown as RecognizeData;

const nestedData = {
  text: 'a\nb',
  confidence: 42,
  blocks: [
    { paragraphs: [{ lines: [{ text: 'a\n', confidence: 60 }, { text: 'b\n', confidence: 40 }] }] },
    { paragraphs: [{ lines: [{ text: 'c', confidence: 20 }] }] },
  ],
} as unknown as RecognizeData;

describe('toOcrResult', () => {
  it('normalises and drops empty lines', () => {
    const result = toOcrResult(flatData);
    expect(result.lines).toEqual([
      { text: 'a', confidence: 60 },
      { text: 'b', confidence: 40 },
    ]);
  });

  it('flattens the block/paragraph structure returned by tesseract v6+', () => {
    // Regression: tesseract only returns `data.lines` when explicitly asked;
    // with `{ text: true, blocks: true }` the lines live inside the blocks.
    const result = toOcrResult(nestedData);
    expect(result.lines.map((line) => line.text)).toEqual(['a', 'b', 'c']);
  });

  it('averages the per-line confidence on a 0..1 scale', () => {
    expect(toOcrResult(flatData).confidence).toBeCloseTo(0.5, 5);
  });

  it('falls back to the document confidence when there are no lines', () => {
    const result = toOcrResult({ text: '', confidence: 77 } as unknown as RecognizeData);
    expect(result.lines).toEqual([]);
    expect(result.confidence).toBeCloseTo(0.77, 5);
  });

  it('survives a completely empty response', () => {
    const result = toOcrResult({} as unknown as RecognizeData);
    expect(result).toEqual({ text: '', lines: [], confidence: 0 });
  });
});

describe('worker lifecycle', () => {
  it('has no worker until one is created', () => {
    expect(isOcrWorkerReady()).toBe(false);
  });
});
