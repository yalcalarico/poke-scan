// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import card from '@/e2e/catalog.json';
import { formatPrice } from '@/lib/format';
import { CatalogSearch } from '../catalog-search';

const state = vi.hoisted(() => ({ price: null as number | null }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }), usePathname: () => '/buscar',
  useSearchParams: () => new URLSearchParams('q=synthetic'),
}));
vi.mock('@/hooks/use-currency', () => ({ useCurrency: () => ({ formatMoney: formatPrice }) }));
vi.mock('@/hooks/use-async', () => ({ useAsync: () => ({ status: 'ready', data: [] }) }));
vi.mock('@/hooks/use-infinite-list', () => ({ useInfiniteList: () => ({
  items: [{ ...card, marketPriceUsd: state.price }], total: 1, isLoading: false,
  isLoadingMore: false, error: null, hasMore: false,
}) }));
vi.mock('../search-controls', () => ({ SearchControls: ({ children }: { children: ReactNode }) => children }));

describe('Buscar pasa el precio recibido sin requests por carta', () => {
  it.each([12.5, 0, null])('muestra %s en el resultado', (price) => {
    state.price = price;
    render(<CatalogSearch />);
    const result = within(screen.getByRole('list', { name: 'Resultados de la búsqueda' }));
    if (price === null) expect(result.getByLabelText('Sin precio')).toHaveTextContent(/^--$/);
    else expect(result.getByText(formatPrice(price))).toBeVisible();
    expect(result.getByRole('link')).toHaveAttribute('href', `/carta/${card.id}?returnTo=%2Fbuscar%3Fq%3Dsynthetic`);
  });
});
