// @vitest-environment jsdom
import type { ReactNode } from 'react';
import Link from 'next/link';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CardGridEntry } from '@/components/cards/card-grid';
import type { CollectionDto, CollectionItemDto } from '@/types/api';
import type { ListItemsParams } from '@/lib/api/collections';

const mocks = vi.hoisted(() => ({
  authenticated: true,
  list: vi.fn(), get: vi.fn(), stats: vi.fn(), items: vi.fn(), update: vi.fn(),
  success: vi.fn(), warning: vi.fn(), replace: vi.fn(),
}));
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ isLoading: false, isAuthenticated: mocks.authenticated }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }), usePathname: () => '/colecciones/album-local' }));
vi.mock('@/lib/api/collections', () => ({
  listCollections: mocks.list, getCollection: mocks.get, getStats: mocks.stats,
  listItems: mocks.items, updateItem: mocks.update,
}));
vi.mock('@/hooks/use-currency', () => ({ useCurrency: () => ({ currency: 'USD', formatMoney: () => '—' }) }));
vi.mock('@/components/ui', async (original) => ({
  ...await original<typeof import('@/components/ui')>(),
  useToast: () => ({ success: mocks.success, warning: mocks.warning }),
}));
vi.mock('next/image', () => ({ default: ({ src, alt }: { src: string; alt: string }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img src={src} alt={alt} />
) }));
// Se conservan los hooks de lectura y los controles reales. Sólo los límites
// ajenos a esta composición se simulan, sin red, providers ni datos de cuenta.
vi.mock('../portfolio-overview', () => ({ PortfolioOverview: () => <section aria-label="Portafolio">Resumen del portafolio</section> }));
vi.mock('@/components/prices/comparison-panel', () => ({ CollectionComparisonPanel: () => <section aria-label="Evolución del valor">Sin historial disponible</section> }));
vi.mock('../collection-price-refresh', () => ({ CollectionPriceRefresh: ({ onRefresh }: { onRefresh: () => void }) => <button onClick={onRefresh}>Actualizar precios</button> }));
vi.mock('@/components/goals/home-goal-panel', () => ({ CollectionGoalPanel: () => <section aria-label="Objetivos"><h2>Tu próximo objetivo</h2><Link href="/colecciones/album-local/objetivos">Ver objetivos</Link></section> }));
vi.mock('@/components/share/share-link-creator', () => ({ ShareLinkCreator: ({ open }: { open: boolean }) => open ? <div role="dialog" aria-label="Compartir colección" /> : null }));
vi.mock('../collection-create-sheet', () => ({ CollectionCreateSheet: ({ open }: { open: boolean }) => open ? <div role="dialog" aria-label="Crear colección" /> : null }));
vi.mock('../collection-rename-sheet', () => ({ CollectionRenameSheet: ({ open }: { open: boolean }) => open ? <div role="dialog" aria-label="Renombrar colección" /> : null }));
vi.mock('../collection-delete-sheet', () => ({ CollectionDeleteSheet: ({ open }: { open: boolean }) => open ? <div role="dialog" aria-label="Eliminar colección" /> : null }));
vi.mock('../item-sheet', () => ({ ItemSheet: ({ open, item }: { open: boolean; item: CollectionItemDto | null }) => open ? <div role="dialog" aria-label={`Editar ${item?.card.name}`} /> : null }));
vi.mock('@/components/visual-preview/effects', () => ({ MotionGrid: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/components/cards/card-grid', () => ({ CardGrid: ({ entries, label, showSelection }: { entries: CardGridEntry[]; label: string; showSelection: boolean }) => (
  <section aria-label={label}>{entries.map((entry) => <div key={entry.key}>
    <button onClick={showSelection ? entry.onToggleSelect : entry.onSelect}>{entry.card.name}</button>
    {entry.action}
  </div>)}</section>
) }));

import { CollectionsScreen } from '../collections-screen';
import { CollectionDetailScreen } from '../collection-detail';
import CollectionsLoading from '@/app/(app)/colecciones/loading';
import CollectionDetailLoading from '@/app/(app)/colecciones/[id]/loading';

const album: CollectionDto = {
  id: 'album-local', userId: 'usuario-sintetico', name: 'Álbum de prueba', isDefault: true,
  itemCount: 4, uniqueCount: 3, duplicateCount: 1, totalValueUsd: 0, totalValueArs: null,
  cover: [{ cardId: 'carta-local-1', imageSmall: '/portada-sintetica.png' }],
  createdAt: '2026-01-01T00:00:00.000Z',
};
const emptyAlbum: CollectionDto = { ...album, id: 'vacio-local', name: 'Otro álbum', isDefault: false, itemCount: 0, uniqueCount: 0, duplicateCount: 0, cover: [] };
const items: CollectionItemDto[] = [1, 2, 3].map((n) => ({
  id: `item-local-${n}`, collectionId: album.id,
  card: { id: `carta-local-${n}`, name: `Carta sintética ${n}`, supertype: 'Pokémon', subtypes: [], hp: null, types: [], number: String(n), rarity: null, artist: null, setId: 'set-local', imageSmall: '/carta-sintetica.png', imageLarge: '/carta-sintetica.png' },
  variant: 'normal', condition: 'NM', quantity: n === 1 ? 2 : 1,
  isForTrade: n === 1, notes: null, addedAt: album.createdAt, price: null,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticated = true;
  mocks.list.mockResolvedValue([album, emptyAlbum]);
  mocks.get.mockResolvedValue(album);
  mocks.stats.mockResolvedValue({ totalCards: 4, uniqueCards: 3, duplicateCards: 1, setsCount: 1, totalValueUsd: 0, totalValueArs: null });
  mocks.items.mockImplementation(async (_id: string, params: ListItemsParams) => {
    const filtered = items.filter((item) => (!params.duplicatesOnly || item.quantity > 1)
      && (!params.forTradeOnly || item.isForTrade)
      && (!params.search || item.card.name.includes(params.search)));
    const page = params.page ?? 1;
    return { data: filtered.slice((page - 1) * 2, page * 2), page, pageSize: 2, total: filtered.length, totalPages: Math.ceil(filtered.length / 2) };
  });
  mocks.update.mockResolvedValue({ ...items[0], isForTrade: true });
});

function expectBefore(first: Element, second: Element) {
  expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
}

async function openDetail() {
  render(<CollectionDetailScreen collectionId={album.id} />);
  await screen.findByRole('button', { name: 'Carta sintética 1' });
}

async function choose(name: string, option: string) {
  fireEvent.click(screen.getByRole('combobox', { name }));
  fireEvent.click(await screen.findByRole('option', { name: option }));
}

describe('Colecciones Viñeta: marcos de carga (S1, S2)', () => {
  it('mantiene el encabezado editorial y anuncia la carga del listado', () => {
    render(<CollectionsLoading />);
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Coleccioná a tu manera.');
    expect(screen.getByRole('status', { name: 'Cargando tus colecciones' })).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('conserva el retorno y las columnas de espera sin inventar el nombre del detalle', () => {
    render(<CollectionDetailLoading />);
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Colección');
    expect(screen.getByRole('link', { name: 'Todas las colecciones' })).toHaveAttribute('href', '/colecciones');
    expect(screen.getByRole('status', { name: 'Cargando la colección' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Objetivos, valor e intercambio' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: album.name })).not.toBeInTheDocument();
  });
});

describe('Colecciones Viñeta: álbumes primero (S1, S2, S4)', () => {
  it('abre con el encabezado editorial y permite crear sin copiar etiquetas demo', async () => {
    render(<CollectionsScreen />);
    await screen.findByRole('link', { name: album.name });
    expect(screen.getByText('Tus colecciones')).toBeInTheDocument();
    const heading = screen.getByRole('heading', { level: 1, name: 'Coleccioná a tu manera.' });
    expect(heading).not.toHaveClass('sr-only');
    fireEvent.click(screen.getByRole('button', { name: 'Crear colección' }));
    expect(screen.getByRole('dialog', { name: 'Crear colección' })).toBeInTheDocument();
    expect(screen.queryByText(/álbumes de muestra|ilustraciones de muestra/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Por Pokémon', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText('Por expansión', { exact: true })).not.toBeInTheDocument();
  });

  it('muestra portadas y cantidades reales antes de las finanzas secundarias', async () => {
    render(<CollectionsScreen />);
    await screen.findByRole('link', { name: album.name });
    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText('4 cartas')).toBeInTheDocument();
    expect(within(cards[0]).getByText('3 únicas · 1 duplicadas')).toBeInTheDocument();
    expect(cards[0].querySelector('img')).toHaveAttribute('src', album.cover[0].imageSmall);
    expect(within(cards[1]).getByText('Colección vacía')).toBeInTheDocument();
    for (const finance of [screen.getByRole('region', { name: 'Portafolio' }), screen.getByRole('region', { name: 'Evolución del valor' }), screen.getByRole('button', { name: 'Actualizar precios' })]) {
      expectBefore(cards[1], finance);
    }
  });

  it('conserva búsqueda, orden y el vacío de filtro sin esconder accesos financieros', async () => {
    render(<CollectionsScreen />);
    await screen.findByRole('link', { name: album.name });
    await choose('Ordenar', 'Nombre');
    expect(screen.getAllByRole('article')[0]).toHaveTextContent(album.name);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar colecciones' }), { target: { value: 'Otro' } });
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('link', { name: emptyAlbum.name })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar colecciones' }), { target: { value: 'Sin coincidencia' } });
    expect(screen.getByRole('status')).toHaveTextContent('No encontramos colecciones con ese nombre.');
    expect(screen.getByRole('button', { name: 'Actualizar precios' })).toBeEnabled();
  });

  it('preserva estados anónimo, vacío y error en lugar de álbumes de ejemplo', async () => {
    mocks.authenticated = false;
    const view = render(<CollectionsScreen />);
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    view.unmount();
    mocks.authenticated = true;
    mocks.list.mockResolvedValue([]);
    const empty = render(<CollectionsScreen />);
    await screen.findByText('Todavía no tenés colecciones');
    expect(screen.getByRole('link', { name: 'Buscar cartas' })).toHaveAttribute('href', '/buscar');
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    empty.unmount();
    mocks.list.mockRejectedValue(new Error('Error sintético'));
    render(<CollectionsScreen />);
    await screen.findByText('No pudimos cargar tus colecciones');
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeEnabled();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });
});

describe('Detalle Viñeta: cartas y panel lateral (S2, S4)', () => {
  it('conserva sesión requerida, error y colección vacía sin cartas demo', async () => {
    mocks.authenticated = false;
    const anonymous = render(<CollectionDetailScreen collectionId={album.id} />);
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('button', { name: /Carta sintética/ })).not.toBeInTheDocument();
    anonymous.unmount();
    mocks.authenticated = true;
    mocks.get.mockRejectedValue(new Error('Error sintético'));
    const error = render(<CollectionDetailScreen collectionId={album.id} />);
    await screen.findByText('No pudimos cargar esta colección');
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Carta sintética/ })).not.toBeInTheDocument();
    error.unmount();
    mocks.get.mockResolvedValue(emptyAlbum);
    mocks.items.mockResolvedValue({ data: [], page: 1, pageSize: 24, total: 0, totalPages: 0 });
    render(<CollectionDetailScreen collectionId={emptyAlbum.id} />);
    await screen.findByText('Esta colección está vacía');
    expect(screen.getByRole('link', { name: 'Buscar cartas' })).toHaveAttribute('href', '/buscar');
    expect(screen.queryByRole('button', { name: /Carta sintética/ })).not.toBeInTheDocument();
  });

  it('usa el nombre real visible y mantiene navegación, compartir, editar y borrar', async () => {
    await openDetail();
    expect(screen.getByRole('heading', { level: 1, name: album.name })).not.toHaveClass('sr-only');
    expect(screen.getByRole('link', { name: 'Todas las colecciones' })).toHaveAttribute('href', '/colecciones');
    expect(screen.getByRole('link', { name: /Sumar cartas|Escanear carta/ })).toHaveAttribute('href', '/escanear');
    expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Compartir' }));
    expect(screen.getByRole('dialog', { name: 'Compartir colección' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(screen.getByRole('dialog', { name: 'Renombrar colección' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar colección' }));
    expect(screen.getByRole('dialog', { name: 'Eliminar colección' })).toBeInTheDocument();
  });

  it('agrupa objetivos, valor e intención de intercambio en un aside separado de las cartas', async () => {
    await openDetail();
    const aside = screen.getByRole('complementary');
    expect(within(aside).getByRole('heading', { name: 'Tu próximo objetivo' })).toBeInTheDocument();
    expect(within(aside).getByText('Valor', { exact: true })).toBeInTheDocument();
    expect(within(aside).getByRole('button', { name: 'Actualizar precios' })).toBeEnabled();
    expect(within(aside).getByRole('heading', { name: 'Repetida no es disponible' })).toBeInTheDocument();
    expect(within(aside).queryByRole('button', { name: 'Preparar mesa' })).not.toBeInTheDocument();
    expect(aside).not.toContainElement(screen.getByRole('region', { name: 'Cartas de la colección' }));
    expect(screen.queryByText(/colección de muestra|guardadas demo|modo encuentro/i)).not.toBeInTheDocument();
  });

  it('conserva búsqueda, filtros combinables, orden, progreso por sets y precios desconocidos', async () => {
    await openDetail();
    expect(screen.getByRole('link', { name: 'Sets' })).toHaveAttribute('href', '/colecciones/album-local/sets');
    expect(screen.getAllByText('Sin referencia de precio para esta variante.')).toHaveLength(2);
    await choose('Orden', 'Precio');
    await screen.findByRole('button', { name: 'Carta sintética 2' });
    fireEvent.click(screen.getByRole('button', { name: 'Duplicadas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Intercambio' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Carta sintética 2' })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Duplicadas' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Intercambio' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar cartas en esta colección' }), { target: { value: 'Inexistente' } });
    await screen.findByText('No encontramos esas cartas');
    fireEvent.click(screen.getByRole('button', { name: 'Quitar la búsqueda y los filtros' }));
    await screen.findByRole('button', { name: 'Carta sintética 2' });
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  it('mantiene la paginación, apertura del editor y selección masiva sin publicar duplicadas', async () => {
    await openDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Carta sintética 1' }));
    expect(screen.getByRole('dialog', { name: 'Editar Carta sintética 1' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    await screen.findByRole('button', { name: 'Carta sintética 3' });
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar' }));
    const mark = screen.getByRole('button', { name: 'Marcar para intercambio' });
    expect(mark).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar todas las que están cargadas' }));
    expect(mark).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Quitar marca' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));
    expect(screen.queryByRole('button', { name: 'Marcar para intercambio' })).not.toBeInTheDocument();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
