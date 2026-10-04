import { describe, expect, it } from 'vitest';
import { AutoVisualGate, hasAlignedCard } from '../auto-visual';
import { installCanvasShim } from './helpers/canvas-shim';
installCanvasShim();
const signature = (value: number) => Array<number>(192).fill(value);

describe('lectura visual automática', () => {
  it('espera estabilidad, no consulta mientras está ocupado y no repite la carta quieta', () => {
    const gate = new AutoVisualGate();
    expect(gate.observe(signature(100), true, false, 0).capture).toBe(false);
    expect(gate.observe(signature(100), true, false, 700).ready).toBe(false);
    expect(gate.observe(signature(100), true, true, 1000)).toEqual({ ready: true, capture: false });
    expect(gate.observe(signature(100), true, false, 1200).capture).toBe(true);
    expect(gate.observe(signature(100), true, false, 9000).capture).toBe(false);
  });
  it('reinicia estabilidad si hay movimiento y exige pausa entre cartas', () => {
    const gate = new AutoVisualGate();
    gate.observe(signature(20), true, false, 0);
    expect(gate.observe(signature(80), true, false, 1000).capture).toBe(false);
    expect(gate.observe(signature(80), true, false, 2000).capture).toBe(true);
    gate.observe(signature(140), true, false, 2200);
    expect(gate.observe(signature(140), true, false, 3200).capture).toBe(false);
    expect(gate.observe(signature(140), true, false, 4700).capture).toBe(true);
  });
  it('permite releer después de retirar la carta, pero ignora pérdidas breves del borde', () => {
    const gate = new AutoVisualGate();
    gate.observe(signature(100), true, false, 0);
    gate.observe(signature(100), true, false, 1000);
    gate.observe(signature(100), false, false, 4000);
    gate.observe(signature(100), true, false, 4200);
    expect(gate.observe(signature(100), true, false, 5200).capture).toBe(false);
    gate.observe(signature(100), false, false, 6000);
    gate.observe(signature(100), false, false, 7100);
    gate.observe(signature(100), true, false, 7200);
    expect(gate.observe(signature(100), true, false, 8200).capture).toBe(true);
  });
  it('detecta una carta centrada, pero no una imagen uniforme ni una carta lejos de la guía', () => {
    const makeImage = (left: number, top: number, width: number, height: number) => {
      const data = new Uint8ClampedArray(240 * 336 * 4);
      for (let y = 0; y < 336; y++) for (let x = 0; x < 240; x++) {
        const i = (y * 240 + x) * 4;
        const v = x >= left && x < left + width && y >= top && y < top + height ? 200 : 20;
        data[i] = data[i + 1] = data[i + 2] = v;
        data[i + 3] = 255;
      }
      return new ImageData(data, 240, 336);
    };
    expect(hasAlignedCard(makeImage(20, 28, 200, 280))).toBe(true);
    expect(hasAlignedCard(makeImage(100, 150, 60, 84))).toBe(false);
    expect(hasAlignedCard(makeImage(0, 0, 0, 0))).toBe(false);
  });
});
