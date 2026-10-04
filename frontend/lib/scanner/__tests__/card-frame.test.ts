import { describe, expect, it } from 'vitest';

import { CARD_ASPECT, fitCardFrame, frameMargin } from '../camera';

const ASPECT = CARD_ASPECT; // 0.7159...

describe('fitCardFrame', () => {
  it('deja espacio alrededor de la carta en el celular', () => {
    const frame = fitCardFrame(390, 570, frameMargin(390, 570))!;
    expect(frame.width).toBeLessThan(390 * 0.7);
    expect(frame.height).toBeLessThan(570 * 0.7);
    expect(frame.x).toBeGreaterThan(50);
  });
  it('respeta siempre la proporción de la carta', () => {
    const casos: Array<[number, number]> = [
      [390, 695],   // iPhone
      [360, 640],   // Android chico
      [1440, 760],  // laptop
      [1920, 900],  // monitor grande
      [2560, 1400], // 4K
      [800, 1000],  // portrait
    ];
    for (const [w, h] of casos) {
      const m = frameMargin(w, h);
      const f = fitCardFrame(w, h, m);
      expect(f, `sin resultado para ${w}x${h}`).not.toBeNull();
      expect(f!.width / f!.height).toBeCloseTo(ASPECT, 1);
    }
  });

  it('usa casi todo el alto disponible en pantallas apaisadas', () => {
    // El bug reportado: el marco usaba `h-[68%] max-h-[520px]`, así que en un
    // monitor quedaba en ~340px de ancho y había que alejar la carta para que
    // entrara, perdiendo nitidez.
    const w = 1920;
    const h = 900;
    const m = frameMargin(w, h);
    const f = fitCardFrame(w, h, m)!;

    const available = h - m * 2;
    // El alto es el factor limitante (carta vertical en ventana apaisada) y
    // ahora se aprovecha casi por completo, en vez del 68% de antes.
    expect(available - f.height).toBeLessThanOrEqual(2);

    // Contra el comportamiento viejo: 68% de 900, con tope de 520px.
    const viejo = Math.min(h * 0.68, 520);
    expect(f.height).toBeGreaterThan(viejo);
    expect(f.width / (viejo * ASPECT)).toBeGreaterThan(1.3);
  });

  it('crece monótonamente con la pantalla', () => {
    const areas = [
      [390, 695],
      [1440, 760],
      [1920, 900],
      [2560, 1400],
    ].map(([w, h]) => {
      const f = fitCardFrame(w, h, frameMargin(w, h))!;
      return f.width * f.height;
    });
    for (let i = 1; i < areas.length; i++) {
      expect(areas[i]).toBeGreaterThan(areas[i - 1]);
    }
  });

  it('se limita por el ancho en pantallas verticales angostas', () => {
    const w = 300;
    const h = 900;
    const m = frameMargin(w, h);
    const f = fitCardFrame(w, h, m)!;
    expect(f.width).toBeLessThanOrEqual(w - m * 2);
  });

  it('nunca se pasa del contenedor', () => {
    for (const [w, h] of [
      [100, 100],
      [500, 200],
      [200, 500],
      [1, 1],
    ]) {
      const m = frameMargin(w, h);
      const f = fitCardFrame(w, h, m);
      if (!f) continue;
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.x + f.width).toBeLessThanOrEqual(w);
      expect(f.y + f.height).toBeLessThanOrEqual(h);
    }
  });

  it('devuelve null con contenedor o margen degenerados', () => {
    expect(fitCardFrame(0, 600, 10)).toBeNull();
    expect(fitCardFrame(600, 0, 10)).toBeNull();
    expect(fitCardFrame(20, 20, 40)).toBeNull();
  });
});

describe('frameMargin', () => {
  it('es más chico en pantallas chicas', () => {
    const movil = frameMargin(390, 695);
    const monitor = frameMargin(2560, 1400);
    expect(movil).toBeGreaterThanOrEqual(10);
    expect(monitor).toBeGreaterThan(movil);
    expect(monitor).toBeLessThanOrEqual(56);
  });

  it('nunca deja el marco pegado al borde', () => {
    for (const [w, h] of [
      [390, 695],
      [1440, 760],
      [3840, 2160],
    ]) {
      expect(frameMargin(w, h)).toBeGreaterThanOrEqual(10);
    }
  });
});
