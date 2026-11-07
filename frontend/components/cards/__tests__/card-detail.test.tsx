// @vitest-environment jsdom
import React, { type ReactNode, type ReactElement } from 'react';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CardDetailPage, { generateMetadata } from '@/app/(app)/carta/[id]/page';
import Loading from '@/app/(app)/carta/[id]/loading';
import fixture from '../../../e2e/catalog.json';
import { formatDate } from '@/lib/format';

vi.mock('next/image', () => ({ default: (props: React.ComponentProps<'img'> & { priority?: boolean; unoptimized?: boolean }) => {
  const imageProps = { ...props };
  delete imageProps.priority;
  delete imageProps.unoptimized;
  return React.createElement('img', imageProps);
} }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND'); } }));
vi.mock('@/components/visual-preview/holo-card', () => ({ VisualCard: ({ children, variant = 'detail' }: { children: ReactNode; variant?: string }) => <div data-holo-card={variant}>{children}</div> }));
vi.mock('@/components/prices', () => ({ CardPriceSection: ({ cardId, showComparison }: { cardId: string; showComparison?: boolean }) => <section aria-label="Referencia de mercado" data-card-id={cardId} data-comparison={showComparison}>Precio real</section> }));
vi.mock('@/app/(app)/carta/[id]/actions', () => ({ CardActions: ({ cardId, cardName }: { cardId: string; cardName: string }) => <button data-card-id={cardId}>Añadir {cardName}</button> }));
vi.mock('@/components/cards/card-tile', () => ({ CardTile: ({ card, href }: { card: { name: string }; href: string }) => <a href={href}>{card.name}</a> }));

const card = { ...fixture, hp: '120', types: ['Fire'], subtypes: ['Basic'], rarity: 'Rare', artist: 'Artista sintético',
  set: { ...fixture.set, series: 'Serie sintética', releaseDate: '2000-01-01',
    logoUrl: 'https://images.pokemontcg.io/browser-set/logo.svg', symbolUrl: 'https://images.pokemontcg.io/browser-set/symbol.svg' } };
const related = { ...card, id: 'related-card', name: 'Otra carta sintética' };
const fetchMock = vi.fn();
const props = (returnTo: string = '/buscar?q=synthetic') => ({ params: Promise.resolve({ id: card.id }), searchParams: Promise.resolve({ returnTo }) });

// jsdom no es un renderer RSC: resolvemos únicamente los hijos async de servidor.
async function resolveServerChildren(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(resolveServerChildren));
  if (!React.isValidElement<{ children?: ReactNode }>(node)) return node;
  if (typeof node.type === 'function' && node.type.constructor.name === 'AsyncFunction') {
    const component = node.type as (props: unknown) => Promise<ReactNode>;
    return resolveServerChildren(await component(node.props));
  }
  if (!node.props.children) return node;
  return React.cloneElement(node, {}, await resolveServerChildren(node.props.children));
}
async function renderPage(returnTo?: string) {
  render(await resolveServerChildren(await CardDetailPage(props(returnTo))) as ReactElement);
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset().mockImplementation((url: string) => Promise.resolve({ ok: true, status: 200,
    json: async () => url.includes('/cards/search?') ? { data: [card, related], total: 2, page: 1, pageSize: 15, totalPages: 1 } : card }));
});

describe('Ficha editorial Viñeta', () => {
  it('compone un único encabezado y paneles de imagen, precio y acciones reales', async () => {
    await renderPage();
    const main = screen.getByRole('main');
    expect(within(main).getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText('Ficha editorial')).toBeVisible();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(card.name);
    expect(screen.getByRole('link', { name: 'Volver' })).toHaveAttribute('href', '/buscar?q=synthetic');
    const image = screen.getByRole('region', { name: 'Imagen de la carta' });
    expect(image.querySelector('[data-holo-card="detail"]')).toContainElement(screen.getByAltText(`Carta ${card.name} Rare del set ${card.set.name}`));
    expect(screen.getByAltText(`Carta ${card.name} Rare del set ${card.set.name}`)).toHaveAttribute('width', '420');
    expect(within(image).getByAltText(`Logo del set ${card.set.name}`)).toBeVisible();
    const prices = main.querySelector('[data-card-detail-prices]');
    expect(prices).toContainElement(screen.getByRole('region', { name: 'Referencia de mercado' }));
    expect(screen.getByRole('region', { name: 'Referencia de mercado' })).toHaveAttribute('data-comparison', 'true');
    const actions = screen.getByRole('region', { name: 'Elegí dónde guardarla' });
    expect(within(actions).getByRole('button', { name: `Añadir ${card.name}` })).toHaveAttribute('data-card-id', card.id);
  });

  it('preserva cada dato traducido, símbolos, caché y navegación relacionada', async () => {
    await renderPage();
    const data = screen.getByRole('region', { name: 'Datos de la carta' });
    for (const [label, value] of [['Set', `${card.set.name} · Serie sintética`], ['Número', '1 / 1'], ['Rareza', 'Rare'], ['Supertipo', 'Pokémon'], ['Tipo', 'Fuego'], ['HP', '120 HP'], ['Subtipos', 'Basic'], ['Artista', 'Artista sintético'], ['Lanzamiento', formatDate(card.set.releaseDate)]]) {
      const term = within(data).getByText(label, { selector: 'dt', exact: true });
      expect(term.parentElement?.querySelector('dd')).toHaveTextContent(value);
    }
    expect(within(data).getByText('Símbolo', { selector: 'dt' })).toBeVisible();
    expect(within(data).getByAltText(`Símbolo del set ${card.set.name}`)).toBeVisible();
    expect(screen.getByRole('link', { name: related.name })).toHaveAttribute('href', '/carta/related-card?returnTo=%2Fbuscar%3Fq%3Dsynthetic');
    expect(screen.getByRole('link', { name: 'Ver el set' })).toHaveAttribute('href', '/buscar?setId=browser-set');
    expect(screen.getByText(`${card.set.name} · carta`)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/cards/browser-card'), { headers: { Accept: 'application/json' }, next: { revalidate: 3600 } });
    expect(await generateMetadata({ params: props().params })).toMatchObject({ title: card.name, alternates: { canonical: '/carta/browser-card' } });
  });

  it('conserva omisiones, imagen ausente y retorno seguro sin inventar datos', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ...fixture, set: null, imageLarge: null, imageSmall: null, hp: null, types: [], subtypes: [], artist: null, rarity: null }) });
    await renderPage('https://example.invalid');
    expect(screen.getByRole('link', { name: 'Volver' })).toHaveAttribute('href', '/buscar');
    expect(screen.getByRole('img')).toHaveTextContent('Sin imagen');
    for (const label of ['Rareza', 'HP', 'Tipo', 'Subtipos', 'Artista', 'Símbolo']) expect(screen.queryByText(label, { selector: 'dt' })).not.toBeInTheDocument();
    expect(screen.getByText('Set', { selector: 'dt' }).parentElement).toHaveTextContent(fixture.setId);
    expect(screen.queryByRole('heading', { name: 'Otras de este set' })).not.toBeInTheDocument();
  });

  it('mantiene el nombre del set como fallback cuando no hay logo', async () => {
    fetchMock.mockImplementation((url: string) => Promise.resolve({ ok: true, status: 200,
      json: async () => url.includes('/cards/search?') ? [] : { ...card, set: { ...card.set, logoUrl: null, symbolUrl: null } } }));
    await renderPage();
    expect(within(screen.getByRole('region', { name: 'Imagen de la carta' })).getByText(card.set.name)).toBeVisible();
    expect(screen.queryByText('Símbolo', { selector: 'dt' })).not.toBeInTheDocument();
  });

  it('comparte encabezado y slots durante la carga con anuncio honesto', () => {
    render(<Loading />);
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText('Ficha editorial')).toBeVisible();
    expect(screen.getByRole('status', { name: 'Cargando la ficha de la carta' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Imagen de la carta' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Elegí dónde guardarla' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Datos de la carta' })).toBeInTheDocument();
    expect(screen.getByRole('main').querySelector('[data-card-detail-prices]')).not.toBeNull();
  });
});
