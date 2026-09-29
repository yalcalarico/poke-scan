'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Layers, Search, Settings2 } from 'lucide-react';

import { CardGrid, type CardGridEntry } from '@/components/cards/card-grid';
import { ScreenContainer } from '@/components/layout/screen-container';
import { ScreenHeader } from '@/components/layout/screen-header';
import {
  Alert,
  Button,
  CardGridSkeleton,
  EmptyState,
  ErrorState,
  IconButton,
  buttonVariants,
} from '@/components/ui';
import { useAsync } from '@/hooks/use-async';
import { useAuth } from '@/hooks/use-auth';
import { useInfiniteList } from '@/hooks/use-infinite-list';
import { ApiError } from '@/lib/api/api-client';
import {
  getCollection,
  getStats,
  listItems,
  type CollectionStatsResponse,
} from '@/lib/api/collections';
import { cn } from '@/lib/cn';
import { formatDate, pluralize } from '@/lib/format';
import type { CollectionDto, CollectionItemDto } from '@/types/api';

import { CollectionBottomBar, DETAIL_CONTENT_INSET } from './collection-bottom-bar';
import { CollectionFilters, type CollectionScope } from './collection-filters';
import { COLLECTION_PAGE_SIZE, formatCount } from './collection-options';
import { CollectionRenameSheet } from './collection-rename-sheet';
import { CollectionDetailSkeleton } from './collection-skeletons';
import { CollectionStats, CollectionSummary } from './collection-summary';
import { ItemSheet } from './item-sheet';

/**
 * El copy del filtro de intercambio, en un solo lugar.
 *
 * Antes decía "En esta página no hay cartas marcadas para intercambio", que es
 * la definición exacta del bug: la respuesta honesta es "no hay en **esta
 * página**", y el usuario la leía como "no hay en tu colección".
 */
const TRADE_FILTER_COPY = {
  title: 'Filtro sobre lo que cargaste',
  body: 'El filtro de intercambio se aplica a las cartas que ya están en pantalla, no a toda la colección. Cargá el resto para ver todas las que marcaste.',
} as const;

/**
 * Lo que devuelve el `Promise.all` del encabezado, con el 404 ya resuelto.
 *
 * `useAsync` convierte cualquier error en un string, así que el 404 se
 * distingue acá y no después: se devuelve como **dato**, y el error real (red,
 * 500) sigue propagando para que caiga en el `status === 'error'` del hook.
 * `anonymous` es el caso "no hay sesión": la función no pide nada, porque
 * `apiFetch` leería el 401 como un token vencido, intentaría un refresh y haría
 * un `window.location.assign('/login')` que recarga la pantalla entera.
 */
type CollectionOverview =
  | { kind: 'ready'; collection: CollectionDto; stats: CollectionStatsResponse }
  | { kind: 'missing' }
  | { kind: 'anonymous' };

export interface CollectionDetailScreenProps {
  collectionId: string;
}

/**
 * `/colecciones/[id]` — el detalle de una colección.
 *
 * ## Las tres requests
 *
 * Las **tres** se disparan juntas y con las mismas dependencias (`collectionId` +
 * sesión), pero la tercera cambió de dueño: la
 * lista es `useInfiniteList`, que ya sabe paginar, abortar y anexar. Meterla
 * además en el `Promise.all` significaría traer la página 1 dos veces y volver a
 * tener el estado de página repartido entre el hook y la pantalla — que es
 * exactamente el bug que el hook vino a eliminar. El `Promise.all` se queda para
 * el par que sí tiene que ser consistente: el nombre de la colección y sus
 * métricas no pueden ser de dos colecciones distintas.
 *
 * ## El filtro de "Para intercambio"
 *
 * Filtrar `isForTrade` en el cliente sobre los 20 items de la página actual da
 * "0 resultados" en la página 3 de una colección con 200 cartas para
 * intercambiar. El backend **no** tiene `forTradeOnly` y las otras dos salidas
 * no eran mejores:
 *
 * 1. *Sacarlo de la lista paginada y ofrecerlo aparte, consultando toda la
 *    colección.* No hay endpoint que devuelva todos los items: `listItems` está
 *    paginado y `getDuplicates` solo trae los duplicados. "Consultarla entera"
 *    desde el cliente es un bucle de requests, que es el N+1 que `AGENTS.md`
 *    prohíbe con otro nombre.
 * 2. *Pasar el parámetro igual y marcarlo como pendiente de backend.* El DTO no
 *    lo valida, así que el backend lo ignora en silencio (con `whitelist: true`
 *    lo tira) y el filtro vuelve a mentir, pero con más pasos.
 * 3. *Dejarlo en el cliente, pero sin mentir.* Es lo implementado: el chip
 *    muestra un `Alert` de que el filtro corre sobre lo cargado, el contador
 *    dice "N de M cargadas", y el estado vacío **nunca** afirma "0 resultados"
 *    mientras queden páginas — ofrece "Cargar más". Cuando el backend acepte el
 *    flag, el cambio es borrar el `Alert`, pasarlo a `listItems` y sacar el
 *    `.filter()`.
 *
 * ## El sort
 *
 * No hay control de orden en esta fase, a propósito: `ListItemsDto` no tiene
 * `sort` y el backend ordena por `addedAt DESC` (`listItems`), así que un
 * `StatRow` con un popover ordenaría **solo las 24 cartas cargadas** mientras
 * dice "ordenado por valor" — el mismo bug que acabamos de arreglar, con otro
 * nombre. El control entra cuando exista el parámetro; ahí son un `StatRow` y
 * un `sort` en el DTO.
 */
export function CollectionDetailScreen({ collectionId }: CollectionDetailScreenProps) {
  const { isLoading: isAuthLoading, isAuthenticated } = useAuth();

  const [scope, setScope] = useState<CollectionScope>('all');
  const [forTradeOnly, setForTradeOnly] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isItemSheetOpen, setIsItemSheetOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CollectionItemDto | null>(null);

  const overview = useAsync<CollectionOverview>(async () => {
    if (isAuthLoading || !isAuthenticated) return { kind: 'anonymous' };
    try {
      const [collection, stats] = await Promise.all([
        getCollection(collectionId),
        getStats(collectionId),
      ]);
      return { kind: 'ready', collection, stats };
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 404) return { kind: 'missing' };
      throw caught;
    }
  }, [collectionId, isAuthenticated, isAuthLoading]);

  const isMissing = overview.data?.kind === 'missing';

  /**
   * La grilla vive en un hijo aparte y se remonta con `key` cuando cambia un
   * filtro, el mismo patrón de `CatalogSearch` en `/buscar`: el estado viejo
   * de la lista se descarta con el nodo, así que no hace falta un efecto que
   * llame a `reload()` — que sería un `setState` en el camino síncrono de un
   * efecto, el anti-patrón de gotchas #9. De paso el contador de "cartas ya
   * cargadas", del que depende el scroll a la primera carta nueva, arranca en
   * cero con la lista.
   */
  const listKey = `${scope}|${forTradeOnly ? 'trade' : 'all'}`;

  const ready = overview.data?.kind === 'ready' ? overview.data : null;

  /**
   * El último encabezado que sí llegó, para que un `reload()` no vacíe la
   * pantalla.
   *
   * Editar o borrar un item cambia la cantidad, el valor y los sets, o sea
   * cosas de `/stats` y del `CollectionSummary`, así que el encabezado tiene que
   * volver a pedirlos. Pero `useAsync.reload()` pone el hook en `loading` con
   * `data: null`, y sin este buffer el skeleton taparía la grilla entera cada vez
   * que el usuario guarda un cambio en la `ItemSheet`: un parpadeo de pantalla
   * completa por tocar un número.
   *
   * Se ajusta en el render (no en un efecto) porque la identidad del objeto
   * cambia una vez por fetch, así que el setter corre una vez por request y
   * nunca en cascada.
   */
  const [lastGood, setLastGood] = useState<typeof ready>(null);
  if (ready && ready !== lastGood) setLastGood(ready);

  const collection = ready?.collection ?? lastGood?.collection ?? null;
  const stats = ready?.stats ?? lastGood?.stats ?? null;
  const missingPriceCount = stats?.cardsMissingPrice ?? 0;

  /**
   * Mientras no hay sesión o el encabezado todavía no resolvió **nunca**, esto
   * es "loading" y no el estado anónimo: `useAsync` devuelve `anonymous` en la
   * corrida que se dispara antes de que la sesión termine de resolverse, y sin
   * este chequeo la pantalla parpadearía del login a la colección. Un `reload()`
   * con datos previos ya en pantalla no cuenta como loading: para eso está
   * `lastGood`.
   */
  const isLoading = isAuthLoading || !isAuthenticated || (!ready && !lastGood);

  const handleOpenItem = useCallback((item: CollectionItemDto) => {
    setSelectedItem(item);
    setIsItemSheetOpen(true);
  }, []);

  const handleCloseItem = useCallback(() => setIsItemSheetOpen(false), []);

  const clearTradeFilter = useCallback(() => setForTradeOnly(false), []);

  return (
    <>
      <ScreenHeader
        title={
          /*
            El `ScreenHeader` pinta el título adentro de un `<p>`, así que el
            placeholder del loading tiene que ser un `<span>`: el `Skeleton` del
            design system es un `<div>` y un bloque adentro de un `<p>` es HTML
            inválido — el browser cierra la `<p>` antes de tiempo y el centrado
            del título se rompe. Mismo shimmer, otro elemento.
          */
          collection ? (
            collection.name
          ) : (
            <span
              aria-hidden="true"
              className="mx-auto block h-4 w-32 rounded-full bg-shimmer animate-shimmer"
            />
          )
        }
        back={{ href: `/colecciones`, label: 'las colecciones' }}
        action={
          collection ? (
            <IconButton
              icon={Settings2}
              label="Editar la colección"
              onClick={() => setIsSettingsOpen(true)}
            />
          ) : null
        }
      />

      <ScreenContainer labelledBy="titulo-coleccion" className={DETAIL_CONTENT_INSET}>
        <h1 id="titulo-coleccion" className="sr-only">
          {collection?.name ?? 'Colección'}
        </h1>

        {/* 1 · loading */}
        {isLoading ? <CollectionDetailSkeleton /> : null}

        {/*
          2 · 404. Nunca `notFound()`: esta pantalla es client y el token vive en
          el navegador, así que el servidor no puede saber si la colección existe
          (gotchas #10 y #12). Además un 404 de negocio no es un 404 de HTTP: un
          403 confirmaría que el recurso existe.
        */}
        {isMissing ? (
          <EmptyState
            kind="no-results"
            icon={Layers}
            title="Colección no encontrada"
            description="Puede que la hayas eliminado o que no te pertenezca."
            action={
              <Link
                href={"/colecciones"}
                className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'px-5')}
              >
                Ver mis colecciones
              </Link>
            }
          />
        ) : null}

        {/*
          3 · error. Solo a pantalla completa cuando no hay nada que mostrar: si
          ya había un encabezado cargado y lo que falló fue un refresco posterior
          (editar un item, renombrar), la colección se sigue viendo y el problema
          baja a un `Alert` arriba del resumen.
        */}
        {isAuthenticated && overview.status === 'error' && !collection ? (
          <ErrorState
            title="No pudimos cargar esta colección"
            message={overview.error ?? undefined}
            onRetry={overview.reload}
          />
        ) : null}

        {/* 4 · sin sesión */}
        {!isAuthLoading && !isAuthenticated ? (
          <EmptyState
            kind="first-use"
            icon={Layers}
            title="Iniciá sesión para ver tu colección"
            description="Necesitás una sesión activa para ver las cartas que guardaste."
            action={
              <Link
                href={"/login"}
                className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'px-5')}
              >
                Iniciar sesión
              </Link>
            }
          />
        ) : null}

        {/* 5 · listo */}
        {collection && stats ? (
          <div className="flex flex-col gap-6">
            {/*
              El error de refresco que no llegó a tumbar la pantalla. Sin esto,
              editar una carta y que falle el `reload` dejaría los totales viejo
              en silencio, que es peor que un aviso: el número se ve como
              verdadero y no lo es.
            */}
            {overview.status === 'error' ? (
              <Alert
                tone="warning"
                size="sm"
                title="No pudimos actualizar los totales"
                action={
                  <Button size="sm" variant="secondary" onClick={overview.reload}>
                    Reintentar
                  </Button>
                }
              >
                {overview.error ?? 'Revisá tu conexión y reintentá.'} Mientras tanto vas a ver los
                últimos valores que pudimos cargar.
              </Alert>
            ) : null}

            <CollectionSummary
              name={collection.name}
              subtitle={`${formatCount(collection.itemCount)} ${pluralize(
                collection.itemCount,
                'carta',
                'cartas',
              )} · creada el ${formatDate(collection.createdAt)}`}
              totalValueUsd={stats.totalValueUsd}
              isDefault={collection.isDefault}
            />

            <CollectionStats stats={stats} />

            {/*
              `warning` y no `error` (§2.3): las cartas sin precio están en la
              colección igual y el usuario puede seguir usando la pantalla. Lo que
              no puede es confiar en el total, y el copy lo dice. El backend las
              suma con el `LEFT JOIN` de `latestPriceJoin()`, así que un `market`
              nulo aporta cero al valor.

              `cardsMissingPrice` es opcional en `CollectionStatsResponse`
              (`?` en el tipo del cliente) porque no está en el `CollectionStatsDto`
              del contrato: el backend lo agrega en `getStats`, pero un cliente
              viejo hablando con un backend viejo no lo recibe. Por eso el
              `?? 0` y no un `!`.
            */}
            {missingPriceCount > 0 ? (
              <Alert tone="warning" size="sm" title="Te faltan precios">
                {formatCount(missingPriceCount)}{' '}
                {pluralize(
                  missingPriceCount,
                  'carta no tiene precio de mercado',
                  'cartas no tienen precio de mercado',
                )}{' '}
                y por eso no suman al valor.
              </Alert>
            ) : null}

            <CollectionFilters
              scope={scope}
              onScopeChange={setScope}
              forTradeOnly={forTradeOnly}
              onForTradeChange={setForTradeOnly}
              setsHref={`/colecciones/${encodeURIComponent(collectionId)}/sets`}
              showTradeNotice
            />

            <CollectionItems
              key={listKey}
              collectionId={collectionId}
              scope={scope}
              forTradeOnly={forTradeOnly}
              onClearTradeFilter={clearTradeFilter}
              selectedItem={selectedItem}
              isItemSheetOpen={isItemSheetOpen}
              onOpenItem={handleOpenItem}
              onCloseItem={handleCloseItem}
              onItemsChanged={overview.reload}
            />

            {/*
              El total de la barra y el de la `CollectionSummary` salen de la
              misma fila de `/stats`, así que no pueden desincronizarse: es el
              criterio de aceptación "el total de la barra coincide con el de la
              CollectionSummary", y se cumple por construcción y no por cuidado.
            */}
            <CollectionBottomBar totalCards={stats.totalCards} totalValueUsd={stats.totalValueUsd} />
          </div>
        ) : null}
      </ScreenContainer>

      {collection ? (
        <CollectionRenameSheet
          open={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          collection={collection}
          onRenamed={overview.reload}
        />
      ) : null}
    </>
  );
}

/* ─── La grilla ─── */

interface CollectionItemsProps {
  collectionId: string;
  scope: CollectionScope;
  forTradeOnly: boolean;
  onClearTradeFilter: () => void;
  selectedItem: CollectionItemDto | null;
  isItemSheetOpen: boolean;
  onOpenItem: (item: CollectionItemDto) => void;
  onCloseItem: () => void;
  onItemsChanged: () => void;
}

/**
 * La lista de cartas, el "Cargar más" y la `ItemSheet`.
 *
 * Va en un hijo propio para que se pueda remontar con `key` y el `scope` no
 * tenga que propagarse por un efecto. Es la misma separación que `CardResults`
 * en `/buscar`.
 */
function CollectionItems({
  collectionId,
  scope,
  forTradeOnly,
  onClearTradeFilter,
  selectedItem,
  isItemSheetOpen,
  onOpenItem,
  onCloseItem,
  onItemsChanged,
}: CollectionItemsProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  /** Cuántas cartas había la última vez que cambió el largo de la lista. */
  const previousCountRef = useRef(0);
  /** Solo el botón "Cargar más" pide el salto; el observer no. */
  const scrollToNewRef = useRef(false);

  const {
    items,
    total,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
    reload,
    sentinelRef,
  } = useInfiniteList<CollectionItemDto>(
    // `listItems` no acepta `signal`: `useInfiniteList` descarta la respuesta
    // vieja por número de corrida, así que la request que llega tarde no pisa la
    // nueva. Es el mismo criterio que usa `CatalogSearch` con `searchCards`.
    (page) =>
      listItems(collectionId, {
        page,
        pageSize: COLLECTION_PAGE_SIZE,
        // `duplicatesOnly` sí es server-side: el `where` del backend es
        // `quantity: { gt: 1 }` y el `total` viene del `count` con el mismo
        // filtro, así que el contador y el "Cargar más" son ciertos. El filtro de
        // intercambio, en cambio, es local — ver el JSDoc de la pantalla.
        duplicatesOnly: scope === 'duplicates',
      }),
    COLLECTION_PAGE_SIZE,
    // Sin `enabled: false`: `CollectionItems` solo se monta cuando el encabezado
    // resolvió, o sea con sesión y con la colección verificada, así que no hay
    // estado en el que la lista pueda dispararle un 401 a `apiFetch` — que lo
    // leería como token vencido, intentaría un refresh y haría un
    // `window.location.assign('/login')` que recarga la pantalla.
  );

  const handleLoadMore = useCallback(() => {
    scrollToNewRef.current = true;
    loadMore();
  }, [loadMore]);

  // Al entrar una página nueva por pedido, bajar a la primera carta nueva
  // (§8.13). Igual que en `/buscar`: el `IntersectionObserver` carga la misma
  // página sin marcar nada, y si también scrolleara, cada autoload le tiraría el
  // scroll al usuario mientras está scrolleando.
  useEffect(() => {
    const previous = previousCountRef.current;
    previousCountRef.current = items.length;

    // La página que se pidió falló: se gasta la intención de scrollear, o el
    // próximo autoload se llevaría el scroll sin que nadie lo haya pedido.
    if (error) {
      scrollToNewRef.current = false;
      return;
    }
    if (!scrollToNewRef.current) return;
    // Todavía no llegó la página nueva: se espera al próximo cambio de largo.
    if (items.length <= previous) return;
    scrollToNewRef.current = false;

    const target = gridRef.current?.querySelector<HTMLElement>(`[data-card-index="${previous}"]`);
    if (!target) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'start' });
  }, [error, items.length]);

  const visible = useMemo(
    () => (forTradeOnly ? items.filter((item) => item.isForTrade) : items),
    [forTradeOnly, items],
  );

  /**
   * Editar o borrar un item toca dos cosas: esta grilla y el encabezado
   * (`/stats`). Se recarga la lista **desde su propio hook** y no desde el padre
   * para que la grilla no se vacíe: `useInfiniteList` conserva los items
   * anteriores hasta que llega la página nueva, así que el swap es invisible
   * (por eso el skeleton de más abajo solo se dibuja con `items.length === 0`).
   *
   * El header se recarga aparte, con el buffer `lastGood` del padre, para que
   * tampoco parpadee. Un parcheo local en cambio de los dos deja el badge de
   * cantidad y el total diciendo cosas distintas del backend.
   */
  const handleItemChanged = useCallback(() => {
    reload();
    onItemsChanged();
  }, [onItemsChanged, reload]);

  const entries: CardGridEntry[] = useMemo(
    () =>
      visible.map((item) => ({
        card: item.card,
        quantity: item.quantity,
        // La misma carta puede estar dos veces con variantes distintas
        // (holofoil y normal) y la `key` sola las confunde: React reusa el nodo
        // y el primer hover se queda pegado al equivocado.
        key: `${item.variant}-${item.condition}-${item.id}`,
        /*
          Tocar la carta abre el `ItemSheet` de ese ítem. Antes era un
          `IconButton` de engranaje en el `action`: obligaba a apuntar a un
          ícono de 20 px en vez de a la carta, y la referencia de diseño no lo
          tiene. `/buscar` y `/carta/[id]` **no** cambian — ahí tocar la
          carta es ir a la ficha, que es lo que significa el gesto.
        */
        onSelect: () => {
          onOpenItem(item);
        },
      })),
    [onOpenItem, visible],
  );

  const isEmptyFilter = visible.length === 0 && items.length > 0;
  const isEmptyCollection = !isLoading && !error && items.length === 0;

  const loadedLabel = forTradeOnly
    ? `${formatCount(visible.length)} ${pluralize(visible.length, 'carta', 'cartas')} para intercambiar de ${formatCount(items.length)} cargadas`
    : `${formatCount(items.length)} de ${formatCount(total)} ${pluralize(total, 'carta', 'cartas')}`;

  return (
    <div className="flex flex-col gap-4">
      {/*
        `aria-live="polite"` y no `role="status"`: el texto cambia con cada
        "Cargar más", y `role="status"` en un elemento que ya se está anunciando
        hace que algunos lectores corten el anuncio a mitad.
      */}
      <p aria-live="polite" className="text-caption text-tertiary tabular-nums">
        {isLoading ? 'Cargando cartas…' : loadedLabel}
      </p>

      {forTradeOnly ? (
        <Alert
          tone="info"
          size="sm"
          id="aviso-intercambio"
          title={TRADE_FILTER_COPY.title}
        >
          {TRADE_FILTER_COPY.body}
        </Alert>
      ) : null}

      {/*
        1 · loading. El skeleton solo mientras no hay nada en pantalla: en un
        `reload()` la lista vieja sigue montada hasta que llega la nueva, y
        taparla con un skeleton sería un parpadeo gratis.
      */}
      {isLoading && items.length === 0 ? (
        <CardGridSkeleton count={COLLECTION_PAGE_SIZE} variant="collection" />
      ) : null}

      {/* 2 · error sin nada cargado */}
      {error && items.length === 0 ? (
        <ErrorState title="No pudimos cargar las cartas" message={error} onRetry={reload} />
      ) : null}

      {/* 3 · vacío: la colección entera no tiene cartas */}
      {isEmptyCollection ? (
        <EmptyState
          kind="first-use"
          icon={Layers}
          title="Esta colección está vacía"
          description="Buscá tu primera carta y agregala a esta colección."
          action={
            <Link
              href={"/buscar"}
              className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'px-5')}
            >
              <Search aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-5 w-5" />
              Buscar cartas
            </Link>
          }
        />
      ) : null}

      {/*
        3' · vacío **del filtro**, que es un estado distinto del anterior: hay
        cartas, pero ninguna de las cargadas pasa el filtro. El copy repite el
        criterio y ofrece las dos salidas —cargar el resto, o sacar el filtro— en
        vez de afirmar que la colección no tiene cartas para intercambiar. Es el
        criterio de la pantalla: el filtro no dice "0 resultados" teniendo
        cartas.
      */}
      {isEmptyFilter ? (
        <EmptyState
          kind="no-results"
          size="sm"
          icon={Search}
          title="Ninguna de las cargadas está para intercambiar"
          description={`De las ${formatCount(items.length)} cartas que ya cargaste, ninguna está marcada para intercambio. Puede que haya más en las páginas que todavía no viste.`}
          action={
            <>
              {hasMore ? (
                <Button
                  variant="secondary"
                  size="md"
                  onClick={handleLoadMore}
                  loading={isLoadingMore}
                  pendingLabel="Cargando…"
                >
                  Cargar más cartas
                </Button>
              ) : null}
              <Button variant="ghost" size="md" onClick={onClearTradeFilter}>
                Ver todas
              </Button>
            </>
          }
        />
      ) : null}

      {/* 5 · listo */}
      {visible.length > 0 ? (
        <div ref={gridRef}>
          <CardGrid variant="collection" entries={entries} label="Cartas de la colección" />
        </div>
      ) : null}

      {/* 4 · parcial: la primera página cargó y *la siguiente* falló. La grilla se
          queda en pantalla —el problema es de una página, no de la pantalla— y el
          reintento es el mismo `loadMore`. */}
      {error && items.length > 0 ? (
        <Alert
          tone="error"
          size="sm"
          title="No pudimos cargar más cartas"
          action={
            <Button size="sm" variant="secondary" onClick={loadMore} loading={isLoadingMore}>
              Reintentar
            </Button>
          }
        >
          {error}
        </Alert>
      ) : null}

      {hasMore && !error ? (
        <div ref={sentinelRef} className="flex justify-center pt-2">
          {/*
            El botón y el `IntersectionObserver` del hook apuntan al mismo
            `loadMore`: el observer adelanta la carga 600 px antes y el botón es
            el que queda si el browser no lo tiene, y el que el usuario puede
            apretar a propósito. Es un scroll infinito con freno de mano.
          */}
          <Button
            variant="secondary"
            size="lg"
            onClick={handleLoadMore}
            loading={isLoadingMore}
            pendingLabel="Cargando…"
          >
            Cargar más
          </Button>
        </div>
      ) : null}

      <ItemSheet
        item={selectedItem}
        open={isItemSheetOpen}
        onClose={onCloseItem}
        onUpdated={handleItemChanged}
        onDeleted={handleItemChanged}
      />
    </div>
  );
}
