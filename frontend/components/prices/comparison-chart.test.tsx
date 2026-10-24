import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ComparisonChart } from './comparison-chart';

describe('ComparisonChart', () => {
  it('mantiene cero, corta null y fechas ausentes, y dibuja un punto aislado', () => {
    const html = renderToStaticMarkup(<ComparisonChart series={[
      { provider: 'tcgdex', points: [{ date: '2026-10-10', value: 0 }, { date: '2026-10-11', value: null }, { date: '2026-10-12', value: 2 }, { date: '2026-10-14', value: 3 }] },
      { provider: 'tcgcsv', points: [{ date: '2026-10-12', value: 0 }, { date: '2026-10-13', value: 1 }] },
    ]} />);
    expect(html).toContain('circle');
    expect(html).toContain('stroke-dasharray="6 4"');
    const groups = [...html.matchAll(/<g\b[^>]*>(.*?)<\/g>/g)].map((match) => match[1]).filter((group) => group?.includes('<polyline') || group?.includes('<circle'));
    expect(groups[0]).not.toContain('<polyline');
    expect((groups[0]?.match(/<circle/g) ?? []).length).toBe(3);
    expect((groups[1]?.match(/<polyline/g) ?? []).length).toBe(1);
    expect((html.match(/<polyline/g) ?? []).length).toBe(1);
    expect((html.match(/<circle/g) ?? []).length).toBe(5);
  });
  it('ajusta el eje al rango observado para que las variaciones sean legibles', () => {
    const html = renderToStaticMarkup(<ComparisonChart series={[{ provider: 'tcgcsv', points: [
      { date: '2026-10-13', value: 5.96 }, { date: '2026-10-14', value: 5.36 }, { date: '2026-10-15', value: 5.8 },
    ] }]} />);
    expect(html).toContain('<polyline');
    expect(html).toContain('Escala ajustada');
    expect(html).not.toContain('Rango de US$ 0,00');
    expect((html.match(/<text /g) ?? []).length).toBe(5);
  });
  it('explica los huecos sin inventar una línea entre precios aislados', () => {
    const html = renderToStaticMarkup(<ComparisonChart series={[{ provider: 'tcgcsv', points: [
      { date: '2026-10-13', value: 5.96 }, { date: '2026-10-16', value: 5.36 },
    ] }]} />);
    expect(html).not.toContain('<polyline');
    expect(html).toContain('Los días sin datos quedan separados');
    expect(html).toContain('pocas observaciones');
  });
  it('no dibuja ceros ni tendencias cuando todas las observaciones son desconocidas', () => {
    const html = renderToStaticMarkup(<ComparisonChart series={[{ provider: 'tcgcsv', points: [{ date: '2026-10-12', value: null }] }]} />);
    expect(html).not.toContain('<svg');
    expect(html).toContain('Todavía no hay observaciones');
  });
  it('distingue cambios de composición de una línea de precio', () => {
    const html = renderToStaticMarkup(<ComparisonChart series={[{ provider: 'tcgcsv', points: [{ date: '2026-10-12', value: 0, compositionChanged: true }] }]} />);
    expect(html).toContain('<rect');
    expect(html).toContain('Cambió la composición');
    expect(html).not.toContain('<polyline');
  });
});
