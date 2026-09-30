// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CollectionCard, type CollectionCoverItem } from '../collection-card';
import type { CollectionDto } from '@/types/api';

// `next/image` no corre en jsdom: se reemplaza por un `img` con el mismo `src`
// para poder contar las miniaturas del mosaico.
vi.mock('next/image', () => ({
  default: ({ src, alt, ...rest }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} data-testid="cover-image" {...rest} />
  ),
}));

/*
 * `Money` vive dentro del `CurrencyProvider`, que a su vez depende de `useAuth`
 * y de una request de cotización. Montar los tres para contar cuatro `<img>`
 * sería probar la cadena de providers, que ya tiene su propia cobertura, y
 * dejaría estos tests fallando cada vez que cambie el bootstrap de sesión.
 */
vi.mock('@/components/cards/money', () => ({
  Money: () => <span data-testid="money" />,
}));

function collection(overrides: Partial<CollectionDto> = {}): CollectionDto {
  return {
    id: 'col-1',
    userId: 'user-1',
    name: 'Mi colección',
    isDefault: false,
    itemCount: 12,
    uniqueCount: 9,
    duplicateCount: 3,
    totalValueUsd: 340.5,
    totalValueArs: null,
    cover: [],
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

const image = (n: number): CollectionCoverItem => ({
  imageSmall: `https://example.test/${n}.png`,
});

function coverOf(count: number): CollectionCoverItem[] {
  return Array.from({ length: count }, (_, i) => image(i + 1));
}

describe('CollectionCard: el mosaico de portada', () => {
  /*
   * El bug que estos tests cubren es de integración, no de componente: el
   * backend ya armaba `cover` con un `$queryRaw` agregado y el tipo del
   * frontend ya lo declaraba, pero `collections-screen.tsx` no lo pasaba. La
   * tarjeta caía siempre al fallback de marca y ninguna prueba de tipos lo
   * detectaba, porque pasar o no una prop opcional compila igual.
   *
   * Estos tests no comprueban que la pantalla pase la prop —eso es una línea de
   * lectura—, comprueban que la tarjeta **la usa** cuando llega.
   */

  it('pinta una miniatura por item del cover', () => {
    render(<CollectionCard collection={collection()} cover={coverOf(4)} />);

    expect(screen.getAllByTestId('cover-image')).toHaveLength(4);
  });

  it('cae al fallback de marca cuando la colección no tiene cartas', () => {
    render(<CollectionCard collection={collection()} cover={[]} />);

    expect(screen.queryAllByTestId('cover-image')).toHaveLength(0);
    // El link principal se sigue nombrando con el título de la colección, así
    // que el fallback no rompe la navegación por nombre accesible.
    expect(screen.getByRole('link', { name: 'Mi colección' })).toBeInTheDocument();
  });

  it('cae al fallback también cuando no le pasan cover', () => {
    render(<CollectionCard collection={collection()} />);

    expect(screen.queryAllByTestId('cover-image')).toHaveLength(0);
  });

  it('recorta a 4 aunque el backend mande más', () => {
    render(<CollectionCard collection={collection()} cover={coverOf(9)} />);

    expect(screen.getAllByTestId('cover-image')).toHaveLength(4);
  });

  it('las miniaturas son decorativas: el nombre ya está en el texto', () => {
    render(<CollectionCard collection={collection()} cover={coverOf(2)} />);

    for (const image of screen.getAllByTestId('cover-image')) {
      // Un `alt` con la carta haría leer la misma pantalla dos veces.
      expect(image).toHaveAttribute('alt', '');
    }
  });

  it('el mosaico no agrega enlaces: no se anida un <a> dentro del link principal', () => {
    render(<CollectionCard collection={collection()} cover={coverOf(4)} />);

    // El link de la portada y el del pie son hermanos, no anidados.
    const links = screen.getAllByRole('link');
    for (const link of links) {
      expect(link.querySelector('a')).toBeNull();
    }
    // Y siguen siendo los dos destinos esperados.
    expect(screen.getByRole('link', { name: /Progreso por set de Mi colección/ })).toHaveAttribute(
      'href',
      '/colecciones/col-1/sets',
    );
  });

  it('el link principal apunta a la colección y se nombra con su título', () => {
    render(<CollectionCard collection={collection({ name: 'Holo Base' })} cover={coverOf(1)} />);

    const main = screen.getByRole('link', { name: 'Holo Base' });
    expect(main).toHaveAttribute('href', '/colecciones/col-1');
  });
});
