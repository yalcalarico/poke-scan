import { describe, expect, it } from 'vitest';
import { isVisualVersionEnabled, visualVersionHref } from './navigation';
import { previewHref } from './preview-link';

// No hay contexto de React en estos helpers: las URLs pueden validarse aisladas.
describe('Apariencia predeterminada y URLs visuales', () => {
  it('activa V2 en enlaces normales y antiguos; clásica requiere selección explícita', () => {
    expect(isVisualVersionEnabled(null)).toBe(true);
    expect(previewHref('/carta/base1-4?returnTo=%2Fbuscar', undefined)).toBe('/carta/base1-4?returnTo=%2Fbuscar');
    expect(isVisualVersionEnabled('v2')).toBe(true);
    expect(isVisualVersionEnabled('classic')).toBe(false);
    expect(previewHref('/buscar-v2?q=mew&page=2#contenido', false)).toBe('/buscar?q=mew&page=2&visual=classic#contenido');
  });
  it('cambia de catálogo conservando la consulta completa y descartando solo la marca visual', () => {
    expect(visualVersionHref('/buscar', 'q=gengar&setId=base1&sort=price&page=3', true))
      .toBe('/buscar-v2?q=gengar&setId=base1&sort=price&page=3');
    expect(visualVersionHref('/buscar-v2', 'q=gengar&visual=v2', false)).toBe('/buscar?q=gengar&visual=classic');
  });
  it('cambia la vista de una ficha sin perder su id ni el contexto de regreso', () => {
    const query = new URLSearchParams({ returnTo: '/buscar-v2?q=mew&page=2', visual: 'v2' }).toString();
    const actual = visualVersionHref('/carta/base1-4', query, false);
    expect(actual).toBe('/carta/base1-4?returnTo=%2Fbuscar-v2%3Fq%3Dmew%26page%3D2&visual=classic');
    expect(previewHref(actual, true)).toBe(`/carta/base1-4?returnTo=%2Fbuscar-v2%3Fq%3Dmew%26page%3D2&visual=v2`);
  });
  it('mantiene V2 al seguir vínculos internos, y conserva fragmentos', () => {
    expect(previewHref('/buscar?setId=base1#contenido', true)).toBe('/buscar-v2?setId=base1#contenido');
    expect(previewHref('/colecciones/abc?sort=name', true)).toBe('/colecciones/abc?sort=name&visual=v2');
    expect(previewHref('/carta/base1-4', false)).toBe('/carta/base1-4?visual=classic');
  });
  it.each(['https://example.com', '//example.com', '/\\example.com'])('no reescribe orígenes externos: %s', (href) => {
    expect(previewHref(href, true)).toBe(href);
  });
});
