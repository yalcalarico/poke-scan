// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PropsWithChildren } from 'react';

import type { PublicSharedCollection } from '@/lib/api/share';

vi.mock('next/image', () => ({ default: ({ alt, fill, priority }: { alt?: string; fill?: boolean; priority?: boolean }) => { void fill; void priority; return <span role="img" aria-label={alt} />; } }));
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: PropsWithChildren<{ href: string }>) => <a href={href} {...props}>{children}</a> }));

import { PublicCardGrid } from '../public-card-grid';

const card = {
  id: 'sv1-1', name: 'Pikachu', supertype: 'Pokémon', subtypes: [], hp: '60', types: ['Lightning'],
  number: '1', rarity: 'Common', artist: 'Artist', setId: 'sv1', imageSmall: '/small.png', imageLarge: '/large.png',
};

function item(variant: 'normal' | 'holofoil', condition: 'NM' | 'LP', quantity: number, market: number | null): PublicSharedCollection['items'][number] {
  return {
    card,
    variant,
    condition,
    quantity,
    price: { market, currency: 'USD', provider: 'Proveedor', source: 'mercado', fetchedAt: '2026-10-06T00:00:00.000Z' },
  };
}

describe('PublicCardGrid', () => {
  it('conserva grupos de la misma carta y muestra atributos, una copia y market cero', () => {
    render(<PublicCardGrid label="Cartas compartidas" items={[item('normal', 'NM', 1, 0), item('holofoil', 'LP', 3, null)]} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Normal · 1 copia')).toBeInTheDocument();
    expect(screen.getByText('Holo · 3 copias')).toBeInTheDocument();
    expect(screen.getByText(/Referencia internacional: USD \$0\.00 por copia/)).toBeInTheDocument();
    expect(screen.getAllByText(/Mercado: mercado · API: Proveedor/)).toHaveLength(2);
    expect(screen.getByText(/Sin referencia de precio para esta variante/)).toBeInTheDocument();
  });

  it('mantiene dos grupos idénticos sin colisiones de claves ni sumar sus copias', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      render(<PublicCardGrid label="Grupos repetidos" items={[item('normal', 'NM', 1, 10), item('normal', 'NM', 2, 10)]} />);
      expect(screen.getAllByRole('listitem')).toHaveLength(2);
      expect(screen.getByText('Normal · 1 copia')).toBeInTheDocument();
      expect(screen.getByText('Normal · 2 copias')).toBeInTheDocument();
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});

it('la procedencia pública conserva estructura de bloque sin elementos de bloque dentro de span', () => {
  const { container } = render(<PublicCardGrid label="Cartas" items={[item('normal', 'NM', 1, 10)]} />);
  expect(container.querySelector('span div, span p')).toBeNull();
});
