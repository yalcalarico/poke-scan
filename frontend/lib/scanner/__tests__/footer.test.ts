import { describe, expect, it } from 'vitest';
import { installCanvasShim, ShimImageData } from './helpers/canvas-shim';
import { cleanOutlinedText, extractFooterNumber, extractFooterCode, renderCodePatches } from '../regions';
import type { OcrResult } from '../types';
installCanvasShim();
const reading = (text: string, confidence = 95): OcrResult => ({ text, confidence: confidence / 100, lines: [{ text, confidence }] });
describe('evidencia del pie', () => {
  it('conserva denominador y prefijos, normalizando ceros para comparar', () => {
    expect(extractFooterNumber([reading('092/128'), reading('92/128')])).toBe('92/128');
    expect(extractFooterNumber([reading('TG02/TG30')])).toBe('TG02/TG30');
  });
  it('rechaza contradicciones del numerador y del denominador', () => {
    expect(extractFooterNumber([reading('092/128'), reading('093/128')])).toBeNull();
    expect(extractFooterNumber([reading('092/128'), reading('092/129')])).toBeNull();
  });
  it('rechaza baja confianza, dígitos unidos a ruido y proporciones ajenas al catálogo', () => {
    for (const text of ['092/128', 'g45/128', '1/2', '1/999']) {
      expect(extractFooterNumber([reading(text, text === '092/128' ? 40 : 95)])).toBeNull();
    }
  });
  it('usa la confianza de la palabra sin heredar la del artista o la regla', () => {
    const result: OcrResult = { text: 'ruido 092/128', confidence: 0.3, lines: [{ text: 'ruido 092/128', confidence: 30, words: [{ text: 'ruido', confidence: 0 }, { text: '092/128', confidence: 96 }] }] };
    expect(extractFooterNumber([result])).toBe('092/128');
    expect(extractFooterCode({ ...result, lines: [{text: 'ruido 30C', confidence: 30, words: [{text: '30C',confidence: 95}]}] }, ['30C'])).toBe('30C');
  });
  it('recupera un número aislado con confianza cero sólo con texto legible en el mismo recorte', () => {
    const isolatedNumber: OcrResult = {
      text: 'uv YAS TTIW\n137/128\nLe.', confidence: 0.23,
      lines: [
        { text: 'uv YAS TTIW', confidence: 37 },
        { text: '137/128', confidence: 0, words: [{ text: '137/128', confidence: 0 }] },
        { text: 'Le.', confidence: 33 },
      ],
    };
    const explicitLowWord: OcrResult = {
      text: '108/108', confidence: 0.34,
      lines: [{ text: '108/108', confidence: 34, words: [{ text: '108/108', confidence: 14 }] }],
    };
    expect(extractFooterNumber([isolatedNumber], 30)).toBeNull();
    expect(extractFooterNumber([isolatedNumber], 30, true)).toBe('137/128');
    expect(extractFooterNumber([explicitLowWord], 30)).toBeNull();
  });
});
describe('limpieza de texto contorneado', () => {
  it('sólo propone bloques interiores para el código, sin tomar el fondo', () => {
    const pixels = new Uint8ClampedArray(200 * 280 * 4).fill(255);
    const source = new ShimImageData(pixels, 200, 280) as ImageData;
    expect(renderCodePatches(source, null)).toHaveLength(0);
    for (let y = 260; y < 268; y++) for (let x = 25; x < 55; x++) {
      const p = (y * 200 + x) * 4; pixels[p] = 0; pixels[p + 1] = 0; pixels[p + 2] = 0;
    }
    expect(renderCodePatches(source, null)).toHaveLength(1);
    pixels.fill(0);
    expect(renderCodePatches(source, null)).toHaveLength(0);
  });
  it('elimina fondo conectado al borde y conserva tinta encerrada sin modificar la fuente', () => {
    const pixels = new Uint8ClampedArray(7 * 7 * 4);
    for (let p = 0; p < 49; p++) pixels[p * 4 + 3] = 255;
    for (let y = 1; y <= 5; y++) for (let x = 1; x <= 5; x++) if (x === 1 || x === 5 || y === 1 || y === 5) {
      const p = (y * 7 + x) * 4; pixels[p] = 255; pixels[p + 1] = 255; pixels[p + 2] = 255;
    }
    const source = new ShimImageData(pixels, 7, 7) as ImageData;
    const cleaned = cleanOutlinedText(source);
    expect(cleaned.data[0]).toBe(255);
    expect(cleaned.data[(3 * 7 + 3) * 4]).toBe(0);
    expect(source.data[0]).toBe(0);
  });
});
