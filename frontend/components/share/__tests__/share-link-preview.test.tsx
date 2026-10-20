// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ImgHTMLAttributes } from 'react';

import type { SharePreviewItem } from '../share-preview';
import { ShareLinkPreview } from '../share-link-preview';

vi.mock('next/image', () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...props} alt={props.alt ?? ''} />
  ),
}));

const baseItem: SharePreviewItem = {
  card: {
    name: 'Sprigatito',
    number: '1',
    rarity: 'Common',
    artist: 'Artist',
    imageSmall: 'https://images.pokemontcg.io/sv1/1.png',
    setName: 'Scarlet & Violet',
    setSeries: 'Scarlet & Violet',
  },
  variant: 'normal',
  condition: 'NM',
  quantity: 1,
  price: { market: 0, currency: 'USD', provider: null, source: 'tcgplayer', fetchedAt: '2026-10-01T00:00:00Z' },
};

function props(item: SharePreviewItem | null, state: 'loading' | 'error' | 'empty' | 'ready' = 'ready') {
  return {
    ownerName: 'Ada',
    title: 'Todas las colecciones',
    sampleCollectionName: 'Mi colección',
    state,
    item,
    error: null,
    allScope: true,
    hasCollections: true,
    expirationText: 'Sin vencimiento',
    onRetry: vi.fn(),
  };
}

describe('ShareLinkPreview', () => {
  it('muestra título, dueño, alcance, campos públicos y market cero como conocido', () => {
    render(<ShareLinkPreview {...props(baseItem)} />);
    expect(screen.getByText('Todas las colecciones')).toBeInTheDocument();
    expect(screen.getByText('De Ada')).toBeInTheDocument();
    expect(screen.getByText(/incluye las colecciones actuales y las que agregues después/i)).toBeInTheDocument();
    expect(screen.getByText(/Referencia por copia: USD \$0.00/)).toBeInTheDocument();
    expect(screen.getByText(/Tus notas privadas no se comparten/)).toBeInTheDocument();
    expect(screen.queryByText(/nota privada centinela/i)).not.toBeInTheDocument();
  });

  it('muestra precio desconocido como Sin referencia y explica colección vacía', () => {
    const itemUnknown = { ...baseItem, price: { ...baseItem.price!, market: null } };
    const { rerender } = render(<ShareLinkPreview {...props(itemUnknown)} />);
    expect(screen.getByText('Sin referencia de mercado')).toBeInTheDocument();

    rerender(<ShareLinkPreview {...props(null, 'empty')} />);
    expect(screen.getByText(/Hoy no hay una fila disponible para esta muestra/)).toBeInTheDocument();
  });

  it('deja la muestra en error recuperable sin ocultar el resto de la preview', () => {
    render(<ShareLinkPreview {...props(null, 'error')} error="Red sin conexión" />);
    expect(screen.getByText('Red sin conexión')).toBeInTheDocument();
    expect(screen.getByText('No se comparte')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar muestra' })).toBeInTheDocument();
  });
});
