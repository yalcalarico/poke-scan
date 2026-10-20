import { describe, expect, it } from 'vitest';

import { catalogReturnHref } from '../catalog-navigation';

describe('regreso al catálogo', () => {
  it('conserva texto, filtros, orden y página', () => {
    const href = '/buscar?q=ken+Sugimori&searchBy=artist&setId=base1&rarity=Rare&sort=price&direction=desc&page=3';
    expect(catalogReturnHref(href)).toBe(href);
  });

  it.each([undefined, ['/buscar?q=az'], 'https://example.com', '//example.com', '/ajustes', '/buscar/../ajustes']) (
    'usa el catálogo para un origen inválido: %s', (value) => {
      expect(catalogReturnHref(value)).toBe('/buscar');
    },
  );

  it('acepta el catálogo V2 y usa su regreso predeterminado sin permitir redirecciones', () => {
    expect(catalogReturnHref('/buscar-v2?q=mew&page=3')).toBe('/buscar-v2?q=mew&page=3');
    expect(catalogReturnHref(undefined, true)).toBe('/buscar-v2');
    expect(catalogReturnHref('//example.com/buscar-v2', true)).toBe('/buscar-v2');
    expect(catalogReturnHref('/buscar-v2/../ajustes', true)).toBe('/buscar-v2');
  });

  it('elimina el fragmento sin perder los filtros', () => {
    expect(catalogReturnHref('/buscar?setId=base1#contenido')).toBe('/buscar?setId=base1');
  });
});
