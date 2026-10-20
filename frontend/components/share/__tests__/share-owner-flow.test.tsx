// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ImgHTMLAttributes } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollectionDto, CollectionItemDto, Paginated, UserDto } from '@/types/api';
import type { ShareLink } from '@/lib/api/share';
import { ApiError } from '@/lib/api/api-client';
import { ShareLinkCreator } from '../share-link-creator';
import { ShareLinksSection } from '../share-links-section';
import { formatExpiration } from '../share-preview';

const mocks = vi.hoisted(() => ({
  auth: { userId: 'owner-a', displayName: 'Ada', authenticated: true },
  listCollections: vi.fn(), listItems: vi.fn(), listShareLinks: vi.fn(), createShareLink: vi.fn(), updateShareLink: vi.fn(), revokeShareLink: vi.fn(),
  success: vi.fn(), copy: vi.fn(),
}));
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: mocks.auth.userId, displayName: mocks.auth.displayName, email: 'private-email-centinel@example.test' } as UserDto, isAuthenticated: mocks.auth.authenticated, isLoading: false }) }));
vi.mock('@/components/ui', async (original) => ({ ...(await original<typeof import('@/components/ui')>()), useToast: () => ({ success: mocks.success }) }));
vi.mock('@/lib/api/collections', () => ({ listCollections: mocks.listCollections, listItems: mocks.listItems }));
vi.mock('@/lib/api/share', () => ({ listShareLinks: mocks.listShareLinks, createShareLink: mocks.createShareLink, updateShareLink: mocks.updateShareLink, revokeShareLink: mocks.revokeShareLink }));
vi.mock('../use-copy-to-clipboard', () => ({ useCopyToClipboard: () => mocks.copy }));
vi.mock('next/image', () => ({ default: (props: ImgHTMLAttributes<HTMLImageElement>) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img {...props} alt={props.alt ?? ''} />
) }));

function collection(id: string, itemCount = 1): CollectionDto {
  return { id, userId: mocks.auth.userId, name: `Colección ${id}`, isDefault: false, itemCount, uniqueCount: itemCount, duplicateCount: 0, totalValueUsd: 0, totalValueArs: null, cover: [], createdAt: '2026-10-01T00:00:00Z' };
}
function item(name = 'Carta A'): CollectionItemDto {
  return { id: 'private-item-centinel', collectionId: 'private-collection-centinel', variant: 'normal', condition: 'NM', quantity: 2, notes: 'private-notes-centinel', isForTrade: true, addedAt: '2026-10-01', price: null,
    card: { id: 'catalog-card', name, setId: 'catalog-set', number: '1', supertype: 'Pokémon', subtypes: [], hp: null, types: [], rarity: 'Common', artist: 'Artista', imageSmall: 'https://images.pokemontcg.io/base1/1.png', imageLarge: 'https://images.pokemontcg.io/base1/1_hires.png' } };
}
function page(name = 'Carta A'): Paginated<CollectionItemDto> {
  return { data: [item(name)], total: 1, page: 1, pageSize: 1, totalPages: 1 };
}
function link(overrides: Partial<ShareLink> = {}): ShareLink {
  return { id: 'link-created', slug: 'fresh-slug', url: 'https://example.test/share/fresh-slug', collectionId: null, collectionName: null, isActive: true, viewCount: 0, createdAt: '2026-10-07T12:00:00Z', expiresAt: null, ...overrides };
}
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}
async function select(label: string, value: string) {
  const user = userEvent.setup();
  const combo = screen.getByRole('combobox', { name: label });
  await user.click(combo);
  const options = document.getElementById(combo.getAttribute('aria-controls') ?? '');
  const option = [...(options?.querySelectorAll('[role="option"]') ?? [])].find((node) => node.textContent?.includes(value));
  expect(option).toBeTruthy();
  fireEvent.click(option as HTMLElement);
}
function creator(open = true) {
  const props = { open, onClose: vi.fn(), onCreated: vi.fn() };
  return { ...props, view: render(<ShareLinkCreator {...props} />) };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.userId = 'owner-a'; mocks.auth.displayName = 'Ada'; mocks.auth.authenticated = true;
  mocks.listCollections.mockResolvedValue([collection('a')]);
  mocks.listItems.mockResolvedValue(page());
  mocks.listShareLinks.mockResolvedValue([]);
  mocks.createShareLink.mockResolvedValue(link());
  mocks.updateShareLink.mockImplementation(async (id: string, payload: { isActive: boolean }) => link({ id, isActive: payload.isActive }));
  mocks.revokeShareLink.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe('flujo privado de compartir', () => {
  it('preview rendered proyecta campos públicos y pide exactamente una fila de una colección', async () => {
    mocks.listCollections.mockResolvedValue([collection('vacía', 0), collection('a'), collection('b')]);
    creator();
    await screen.findByText('Carta A');
    expect(screen.getByText('De Ada')).toBeInTheDocument();
    expect(screen.getByText('Todas las colecciones')).toBeInTheDocument();
    expect(screen.getByText(/las que agregues después/)).toBeInTheDocument();
    expect(screen.getByText(/Tus notas privadas no se comparten/)).toBeInTheDocument();
    for (const centinel of ['private-notes-centinel', 'private-item-centinel', 'private-collection-centinel', 'private-email-centinel']) expect(document.body.textContent).not.toContain(centinel);
    expect(mocks.listItems).toHaveBeenCalledTimes(1);
    expect(mocks.listItems).toHaveBeenCalledWith('a', { page: 1, pageSize: 1 }, expect.any(AbortSignal));
    expect(mocks.createShareLink).not.toHaveBeenCalled();
  });

  it('carga/error de muestra no bloquea crear; fecha previa es estimada y la final proviene del servidor', async () => {
    mocks.listItems.mockRejectedValueOnce(new ApiError(503, 'Muestra sin conexión.'));
    const serverDate = '2030-01-02T15:44:00Z';
    mocks.createShareLink.mockResolvedValue(link({ expiresAt: serverDate }));
    const mounted = creator();
    await screen.findByText('Muestra sin conexión.');
    await select('Expiración', '7 días');
    expect(screen.getByText(/Vencimiento estimado:/)).toHaveTextContent('El servidor confirma la fecha al crear.');
    fireEvent.click(screen.getByRole('button', { name: 'Crear enlace' }));
    await screen.findByRole('button', { name: 'Copiar enlace' });
    expect(screen.getByText(/^Vence /).textContent).toBe(`Vence ${formatExpiration(serverDate)} (hora local).`);
    expect(mounted.onCreated).toHaveBeenCalledWith(expect.objectContaining({ expiresAt: serverDate }));
    expect(mocks.createShareLink).toHaveBeenCalledWith({ collectionId: undefined, expiresInDays: 7 });
  });

  it('scope race cancela lo anterior y nunca muestra una carta vieja como parte de otro alcance', async () => {
    const first = deferred<Paginated<CollectionItemDto>>();
    const second = deferred<Paginated<CollectionItemDto>>();
    mocks.listCollections.mockResolvedValue([collection('a'), collection('b')]);
    mocks.listItems.mockImplementation((id: string) => id === 'a' ? first.promise : second.promise);
    creator();
    await waitFor(() => expect(mocks.listItems).toHaveBeenCalledTimes(1));
    const firstSignal = mocks.listItems.mock.calls[0]![2] as AbortSignal;
    await select('Colección', 'Colección b');
    expect(firstSignal.aborted).toBe(true);
    await act(async () => first.resolve(page('Carta de A vieja')));
    expect(screen.queryByText('Carta de A vieja')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Colección' })).toHaveTextContent('Colección b');
    await act(async () => second.resolve(page('Carta B vigente')));
    await screen.findByText('Carta B vigente');
    expect(mocks.listItems).toHaveBeenCalledTimes(2);
  });

  it('muestra cargada no reaparece durante carga/error de otro scope y se puede reintentar', async () => {
    mocks.listCollections.mockResolvedValue([collection('a'), collection('b')]);
    mocks.listItems.mockResolvedValueOnce(page('Carta A')).mockRejectedValueOnce(new ApiError(503, 'Error B')).mockResolvedValueOnce(page('Carta B'));
    creator(); await screen.findByText('Carta A');
    await select('Colección', 'Colección b');
    await screen.findByText('Error B');
    expect(screen.queryByText('Carta A')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear enlace' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar muestra' }));
    await screen.findByText('Carta B');
    expect(mocks.listItems).toHaveBeenCalledTimes(3);
  });

  it('sin colecciones no hace muestra y crea scope global dinámico sin vencimiento', async () => {
    mocks.listCollections.mockResolvedValue([]);
    creator();
    await screen.findByText(/Hoy no hay colecciones/);
    expect(screen.getByText(/Sin vencimiento: el enlace sigue activo/)).toBeInTheDocument();
    expect(mocks.listItems).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Crear enlace' }));
    await screen.findByRole('button', { name: 'Copiar enlace' });
    expect(mocks.createShareLink).toHaveBeenCalledWith({ collectionId: undefined, expiresInDays: undefined });
  });

  it('error de colecciones se recupera y un create fallido conserva formulario con reintento', async () => {
    mocks.listCollections.mockRejectedValueOnce(new ApiError(503, 'Listas no disponibles.')).mockResolvedValueOnce([collection('a')]);
    mocks.createShareLink.mockRejectedValueOnce(new ApiError(503, 'Creación no disponible.')).mockResolvedValueOnce(link());
    creator(); await screen.findByText('Listas no disponibles.');
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    await screen.findByText('Carta A');
    fireEvent.click(screen.getByRole('button', { name: 'Crear enlace' }));
    await screen.findByText('Creación no disponible.');
    expect(screen.getByRole('button', { name: 'Crear enlace' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Crear enlace' }));
    await screen.findByRole('button', { name: 'Copiar enlace' });
    expect(mocks.createShareLink).toHaveBeenCalledTimes(2);
  });

  it('creación pendiente serializa clicks, fija selectores y no se cierra por Escape', async () => {
    const pending = deferred<ShareLink>(); mocks.createShareLink.mockReturnValue(pending.promise);
    const mounted = creator(); await screen.findByText('Carta A');
    const primary = screen.getByRole('button', { name: 'Crear enlace' });
    fireEvent.click(primary); fireEvent.click(primary);
    expect(mocks.createShareLink).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('combobox', { name: 'Colección' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Expiración' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(mounted.onClose).not.toHaveBeenCalled();
    await act(async () => pending.resolve(link()));
    await screen.findByRole('button', { name: 'Copiar enlace' });
  });

  it('cerrar aborta muestra y reabrir vuelve a pedir una sola muestra fresca', async () => {
    const first = deferred<Paginated<CollectionItemDto>>();
    mocks.listItems.mockReturnValueOnce(first.promise).mockResolvedValueOnce(page('Carta nueva'));
    const mounted = creator(); await waitFor(() => expect(mocks.listItems).toHaveBeenCalledTimes(1));
    const signal = mocks.listItems.mock.calls[0]![2] as AbortSignal;
    mounted.view.rerender(<ShareLinkCreator {...mounted} open={false} />);
    expect(signal.aborted).toBe(true);
    await act(async () => first.resolve(page('Carta vieja')));
    mounted.view.rerender(<ShareLinkCreator {...mounted} open />);
    await screen.findByText('Carta nueva');
    expect(mocks.listItems).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Carta vieja')).not.toBeInTheDocument();
  });

  it('crear → DELETE → reactivar se refleja en tarjeta y contador sin recargar la lista', async () => {
    render(<ShareLinksSection />);
    await screen.findByText('Todavía no compartiste tu colección');
    fireEvent.click(screen.getAllByRole('button', { name: 'Crear enlace' })[0]!);
    await screen.findByText('Carta A');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Crear enlace' }));
    await screen.findByRole('button', { name: 'Copiar enlace' });
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));
    await screen.findByText('1 enlace creado · 1 activo');
    fireEvent.click(screen.getByRole('button', { name: 'Revocar' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('No podemos retractar páginas');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Revocar' }));
    await screen.findByText('1 enlace creado · 0 activos');
    expect(screen.getByText('Desactivado')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Activar' }));
    await screen.findByText('1 enlace creado · 1 activo');
    expect(screen.getByText('Activo')).toBeInTheDocument();
    expect(mocks.listShareLinks).toHaveBeenCalledTimes(1);
    expect(mocks.updateShareLink).toHaveBeenCalledWith('link-created', { isActive: true });
  });

  it('cambiar de cuenta autenticada no conserva overlays, muestra ni respuestas de la cuenta anterior', async () => {
    const delayedA = deferred<ShareLink[]>();
    mocks.listShareLinks.mockReturnValueOnce(delayedA.promise).mockResolvedValueOnce([link({ id: 'link-b', collectionName: 'Colección de B' })]);
    const view = render(<ShareLinksSection />);
    await waitFor(() => expect(mocks.listShareLinks).toHaveBeenCalledTimes(1));
    mocks.auth.userId = 'owner-b'; mocks.auth.displayName = 'Bea';
    view.rerender(<ShareLinksSection />);
    await screen.findByText('Colección de B');
    await act(async () => delayedA.resolve([link({ collectionName: 'Privada de A' })]));
    expect(screen.queryByText('Privada de A')).not.toBeInTheDocument();
    expect(mocks.listShareLinks).toHaveBeenCalledTimes(2);
  });

  it('sin sesión no consulta datos privados ni abre creación', async () => {
    mocks.auth.authenticated = false;
    render(<ShareLinksSection />);
    await screen.findByText('Todavía no compartiste tu colección');
    for (const button of screen.getAllByRole('button', { name: 'Crear enlace' })) expect(button).toBeDisabled();
    expect(mocks.listShareLinks).not.toHaveBeenCalled();
    expect(mocks.listCollections).not.toHaveBeenCalled();
  });

  it('lista con error permite reintentar sin perder la explicación de revocación reversible', async () => {
    mocks.listShareLinks.mockRejectedValueOnce(new ApiError(503, 'Error de enlaces')).mockResolvedValueOnce([link()]);
    render(<ShareLinksSection />);
    await screen.findByText('Error de enlaces');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByText('1 enlace creado · 1 activo');
    expect(screen.getByText(/Ninguna de estas acciones/)).toBeInTheDocument();
  });

  it('una creación pendiente de otra cuenta no se agrega al cambiar de usuario', async () => {
    const pending = deferred<ShareLink>();
    mocks.createShareLink.mockReturnValueOnce(pending.promise);
    const mounted = creator();
    await screen.findByText('Carta A');
    fireEvent.click(screen.getByRole('button', { name: 'Crear enlace' }));
    mocks.auth.userId = 'owner-b'; mocks.auth.displayName = 'Bea';
    mounted.view.rerender(<ShareLinkCreator {...mounted} />);
    await screen.findByText('De Bea');
    await act(async () => pending.resolve(link({ collectionName: 'Privada de A' })));
    expect(mounted.onCreated).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Copiar enlace' })).not.toBeInTheDocument();
  });

  it('el vencimiento actualiza tarjeta y contador sin recargar ni habilitar activar', async () => {
    const start = Date.now();
    mocks.listShareLinks.mockResolvedValue([link({ expiresAt: new Date(start + 1000).toISOString() })]);
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(start);
    render(<ShareLinksSection />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByText('1 enlace creado · 1 activo')).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(1002));
    expect(screen.getByText('Vencido')).toBeInTheDocument();
    expect(screen.getByText('1 enlace creado · 0 activos')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desactivar' })).not.toBeInTheDocument();
    expect(mocks.listShareLinks).toHaveBeenCalledTimes(1);
    expect(mocks.updateShareLink).not.toHaveBeenCalled();
  });

  it('teclado abre y cierra la hoja, que devuelve foco al disparador', async () => {
    const user = userEvent.setup();
    render(<ShareLinksSection />);
    await screen.findByText('Todavía no compartiste tu colección');
    const trigger = screen.getAllByRole('button', { name: 'Crear enlace' })[0]!;
    trigger.focus();
    await user.keyboard('{Enter}');
    await screen.findByText('Carta A');
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('crear con destino inicial ajeno/inexistente no manda POST a ese ID', async () => {
    render(<ShareLinkCreator open initialCollectionId="absent" onClose={vi.fn()} onCreated={vi.fn()} />);
    await screen.findByText('Vista previa');
    expect(screen.getByRole('button', { name: 'Crear enlace' })).toBeDisabled();
    expect(mocks.createShareLink).not.toHaveBeenCalled();
  });
});
