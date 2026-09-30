'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeftRight, Layers, ListChecks, Search, Settings2 } from 'lucide-react';

import { CardGrid, type CardGridEntry } from '@/components/cards/card-grid';
import { ScreenContainer } from '@/components/layout/screen-container';
import { ScreenHeader } from '@/components/layout/screen-header';
import {
  Alert,
  Button,
  CardGridSkeleton,
  Checkbox,
  EmptyState,
  ErrorState,
  IconButton,
  Select,
  Surface,
  buttonVariants,
  useToast,
} from '@/components/ui';
import { useAsync } from '@/hooks/use-async';
import { useAuth } from '@/hooks/use-auth';
import { useInfiniteList } from '@/hooks/use-infinite-list';
import { useChunkedList } from '@/components/set-progress/use-chunked-list';
import { ApiError } from '@/lib/api/api-client';
import {
  getCollection,
  getStats,
  listItems,
  updateItem,
  type CardSort,
  type CollectionStatsResponse,
} from '@/lib/api/collections';
import { cn } from '@/lib/cn';
import { formatDate, pluralize } from '@/lib/format';
import { conditionShort, variantLabel } from '@/lib/variants';
import type { CollectionDto, CollectionItemDto } from '@/types/api';

import { CollectionBottomBar, DETAIL_CONTENT_INSET } from './collection-bottom-bar';
import { CollectionFilters, type CollectionScope } from './collection-filters';
import { COLLECTION_CHUNK, COLLECTION_PAGE_SIZE, formatCount } from './collection-options';
import { CollectionRenameSheet } from './collection-rename-sheet';
import { CollectionDetailSkeleton } from './collection-skeletons';
import { CollectionStats, CollectionSummary } from './collection-summary';
import { ItemSheet } from './item-sheet';

/**
 * El copy de la acción masiva, en un solo lugar.
 *
 * El número de cartas que se **pidieron** cambiar y el número de cartas que
 * **quedaron** cambiadas no son el mismo, y el texto dice el segundo. Un "listo"
 * después de un bucle con errores sería la versión silenciosa de mentir.
 */
const BULK_TRADE_COPY = {
  marked: (count: number) =>
    `${formatCount(count)} ${pluralize(count, 'carta marcada', 'cartas marcadas')} para intercambio.`,
  unmarked: (count: number) =>
    `${formatCount(count)} ${pluralize(count, 'carta retirada', 'cartas retiradas')} del intercambio.`,
  failed: 'Algunas no se pudieron actualizar.',
} as const;

/**
 * Cuántas cartas se pueden marcar por tanda.
 *
 * **Es N requests y no una**, porque **no existe endpoint masivo**: el backend
 * expone `PATCH /items/:itemId` de a uno. Un `POST /collections/:id/items/bulk`
 * sería medio día de backend y es la solución correcta, así que el tope existe
 * para que el loop sea acotado y visible mientras tanto.
 *
 * El tope es de 60 y no de "todas": 60 `PATCH` son 60 requests a Postgres local
 * que no tocan pokemontcg.io (`AGENTS.md` §3.1), así que el presupuesto no es el
 * límite —el sentido común y la paciencia lo son—. Con más de 60 seleccionadas
 * la acción se deshabilita y **lo dice**, en vez de aceptarse y tardar medio
 * minuto sin explicación.
 *
 * La consequence honesta de que sean N requests: el progreso se muestra. Un
 * botón que se queda en `loading` veinte segundos sin decir cuánto lleva es
 * indistinguible de uno colgado.
 */
const MAX_BULK_ITEMS = 60;

/**
 * El orden, y lo que el API **no** tiene.
 *
 * ## `price` no tiene dirección
 *
 * El backend ordena por `quantity × market` **siempre de más a menos** y no
 * acepta un parámetro de sentido. Por eso el selector no ofrece uno: un control
 * de dirección que el servidor ignora en silencio es un control que miente, y es
 * el mismo bug que el filtro de intercambio tenía antes de volverse server-side
 * (ver el JSDoc de la pantalla).
 *
 * ## El orden es de **toda** la colección, no de lo cargado
 *
 * Esta es la diferencia con el filtro de intercambio, y es la razón por la que
 * acá sí hay un selector de orden y antes no: el `sort` viaja en el query y el
 * `ORDER BY` del backend corre **antes** del `LIMIT`, así que la página 1 de
 * "por precio" es la página 1 de las más caras de la colección entera. Un orden
 * del cliente ordenaría solo las 24 cartas que ya están en el DOM y anunciaría
 * un orden global que no es el que se ve.
 *
 * Lo que **sí** sigue siendo parcial, y por eso el contador no se toca, es el
 * filtro de intercambio: ese corre en el cliente sobre lo cargado (arriba).
 */
const SORTS: readonly { value: CardSort; label: string }[] = [
  { value: 'name', label: 'Nombre' },
  { value: 'rarity', label: 'Rareza' },
  { value: 'number', label: 'Número' },
  { value: 'price', label: 'Precio' },
];

/**
 * El valor del selector: un `sort` real, o `'none'` para "sin `sort`", que es
 * el `addedAt DESC` del backend.
 *
 * `'none'` es un valor **de la UI**, no del contrato: se traduce a `undefined`
 * antes de entrar al query string (ver `CollectionItems`), porque
 * `buildQueryString` saltea los `undefined` y `'none'` no está en
 * `CARD_SORT_FIELDS`, así que mandarlo sería un 400 del `ValidationPipe`.
 */
type SortValue = CardSort | 'none';

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
 * Filtrar `isForTrade` en el cliente sobre los items de la página actual daba
 * "0 resultados" en la página 3 de una colección con 200 cartas para
 * intercambiar. Cuando no había otra salida, el filtro se quedaba en el cliente
 * con un `Alert` que decía la verdad a medias —"se aplica a lo que ya
 * cargaste"—
 * y un estado vacío que no decía "0 resultados" mientras quedaban páginas.
 *
 * Hoy **es server-side**: `ListItemsDto` acepta `forTradeOnly`, compone con
 * `duplicatesOnly` en el mismo `where`, y el `total` sale del `count` con ese
 * mismo filtro. Eso permite borrar el `Alert`, borrar el `.filter()` y que el
 * contador y el "Cargar más" sean ciertos sobre la colección entera.
 *
 * Lo que el server-side cambia es la **distinción de vacíos**: antes una
 * respuesta vacía con filtro puesto significaba "no hay entre lo cargado", y
 * ahora significa "no hay en la colección". Por eso `isEmptyFilter` se separa de
 * `isEmptyCollection` por el filtro activo y no por `items.length`: sin eso,
 * activar el filtro sobre una colección sin cartas marcadas mostraba "Esta
 * colección está vacía" y mandaba a buscar una carta que el usuario ya tenía.
 *
 * ## El sort
 *
 * Server-side, desde que `ListItemsDto` acepta `sort`. Antes no había control
 * de orden **a propósito**, y el JSDOC lo explicaba: un `StatRow` con un popover
 * ordenaría **solo las cartas cargadas** mientras decía "ordenado por valor",
 * que es el mismo bug del filtro de intercambio con otro nombre. Con el
 * parámetro en el backend la razón desaparece, así que el control entra y deja
 * de hacerlo la siguiente: es un `Select` con los cuatro `CARD_SORT_FIELDS`, y
 * el `listKey` incluye el `sort` para que la lista se remonte y vuelva a la
 * página 1.
 *
 * No hay control de **dirección**: `price` es siempre descendente en el backend
 * y no acepta un parámetro de sentido (ver `SORTS`).
 */
export function CollectionDetailScreen({ collectionId }: CollectionDetailScreenProps) {
  const { isLoading: isAuthLoading, isAuthenticated } = useAuth();

  const [scope, setScope] = useState<CollectionScope>('all');
  const [forTradeOnly, setForTradeOnly] = useState(false);
  const [sort, setSort] = useState<SortValue>('none');
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
   *
   * `sort` entra en la `key` por lo mismo: cambiar el orden invalida las páginas
   * ya cargadas —la página 3 de "por precio" no es la página 3 de "por nombre"—,
   * y remontar es la forma de que eso no requiera un efecto.
   */
  const listKey = `${collectionId}|${scope}|${forTradeOnly ? 'trade' : 'all'}|${sort}`;

  const ready = overview.data?.kind === 'ready' ? overview.data : null;

  /**
   * El último encabezado que sí llegó, para que un `reload()` no vacíe la
   * pantalla.
   *
   * Editar o borrar un item cambia la cantidad, el valor y los sets, o sea
   * cosas de `/stats` y del `CollectionSummary`, así que el encabezado tiene que
   * volver a pedirlos. Pero `useAsync.reload()` pone el hook en `loading` con
   * `data: null`, y sin este buffer el skeleton taparía la grilla entera cada vez
   * que el usuario guarda un cambio en el `ItemSheet`: un parpadeo de pantalla
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

  /**
   * Sacar **todos** los filtros de la lista de una vez.
   *
   * El botón del vacío de filtro ofrece esto y no "sacar el de intercambio",
   * porque los dos filtros se combinan y el que está activo puede ser cualquiera
   * de los dos: sacar solo uno dejaría la pantalla en un estado vacío distinto
   * del que el usuario pidió.
   */
  const clearListFilters = useCallback(() => {
    setScope('all');
    setForTradeOnly(false);
  }, []);

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
                href="/colecciones"
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
                href="/login"
                className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'px-5')}
              >
                Iniciar sesión
              </Link>
            }
          />
        ) : null}

        {/* 5 · datos del encabezado */}
        <div className="flex flex-col gap-6">
          {collection && stats ? (
            <div className="flex flex-col gap-6">
              {/*
                El error de refresco que no llegó a tumbar la pantalla. Sin esto,
                editar una carta y que falle el `reload` dejaría los totales viejos
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

              <CollectionSortControl value={sort} onChange={setSort} />

            </div>
          ) : null}

          {/*
            Montar la lista apenas se resuelve la sesión solapa su request con
            colección + stats. Antes esperaba a que ambas terminaran y recién
            entonces pedía `/items`, un waterfall entero antes de ver una carta.
            La lista se conserva oculta hasta tener ownership/encabezado válidos;
            así no se muestra un 404 intermedio si el id no existe.
          */}
          {!isAuthLoading && isAuthenticated ? (
            <CollectionItems
              key={listKey}
              collectionId={collectionId}
              scope={scope}
              forTradeOnly={forTradeOnly}
              sort={sort}
              listKey={listKey}
              enabled={!isMissing && (overview.status !== 'error' || Boolean(lastGood))}
              isVisible={Boolean(collection && stats && !isMissing)}
              onClearListFilters={clearListFilters}
              selectedItem={selectedItem}
              isItemSheetOpen={isItemSheetOpen}
              onOpenItem={handleOpenItem}
              onCloseItem={handleCloseItem}
              onItemsChanged={overview.reload}
            />
          ) : null}

          {/*
            El total de la barra y el de la `CollectionSummary` salen de la
            misma fila de `/stats`, así que no pueden desincronizarse.
          */}
          {collection && stats && !isMissing ? (
            <CollectionBottomBar totalCards={stats.totalCards} totalValueUsd={stats.totalValueUsd} />
          ) : null}
        </div>
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

/* ─── El orden ─── */

/**
 * El selector de orden.
 *
 * ## Por qué un `Select` y no un `SegmentedControl`
 *
 * `SegmentedControl` es para 2 a 4 opciones que tienen que estar **todas
 * visibles** a la vez, y cuatro botones de "Nombre · Rareza · Número · Precio" no
 * entran en 390 px sin que cada uno sea de 80 px y con la etiqueta ilegible. El
 * `Select` con popover es el componente de una elección cerrada con labels
 * largos, y ya está probado con teclado y con `aria-activedescendant`.
 *
 * ## El default está explícito
 *
 * `'none'` es "sin `sort` en el query", o sea el `addedAt DESC` del backend. Se
 * muestra como "Agregadas" y no se esconde: un selector que arranca con un valor
 * invisible obliga a abrirlo para descubrir que hay un default.
 *
 * No hay control de dirección porque el API no lo tiene (ver `SORTS`).
 */
function CollectionSortControl({
  value,
  onChange,
}: {
  value: SortValue;
  onChange: (value: SortValue) => void;
}) {
  const options = useMemo(
    () => [{ value: 'none' as const, label: 'Agregadas' }, ...SORTS],
    [],
  );

  return (
    <div className="flex items-center gap-2">
      <span id="orden-coleccion" className="shrink-0 text-caption text-tertiary">
        Orden
      </span>
      {/*
        `aria-labelledby` y no `aria-label`: el texto "Orden" ya está en
        pantalla, y `Select` renderiza un `<button>`, así que un `<label
        htmlFor>` no lo nombraría (gotchas P0.4). Es el mismo patrón que usa
        `organize-sheet.tsx`.
      */}
      <Select
        size="sm"
        aria-labelledby="orden-coleccion"
        options={options}
        value={value}
        onChange={(next) => onChange(next as SortValue)}
      />
    </div>
  );
}

/* ─── La grilla ─── */

interface CollectionItemsProps {
  collectionId: string;
  enabled: boolean;
  isVisible: boolean;
  scope: CollectionScope;
  forTradeOnly: boolean;
  sort: SortValue;
  /**
   * La `key` del remontaje, reutilizada como `resetKey` del troceo.
   *
   * Va como prop y no se rearma en el hijo porque tiene que ser **la misma**
   * string: si las dos divergieran, un cambio de filtro podría dejar 60 filas del
   * resultado anterior pintadas al lado del nuevo.
   */
  listKey: string;
  /** Saca scope y forTradeOnly juntos. Lo usa el botón del vacío de filtro. */
  onClearListFilters: () => void;
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
  enabled,
  isVisible,
  scope,
  forTradeOnly,
  sort,
  listKey,
  onClearListFilters,
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

  const toast = useToast();

  /**
   * Ids seleccionados y si el modo selección está activo.
   *
   * Son **dos** estados y no uno a propósito. `selectedIds` puede estar vacío con
   * el modo activo —el usuario entró a seleccionar y todavía no eligió nada— y en
   * ese caso la grilla tiene que mostrar las casillas igual: sin la marca visual,
   * "tocar el card selecciona" no se puede descubrir. Un solo booleano
   * (`selected.size > 0`) haría aparecer las casillas recién después de la
   * primera selección, que es cuando ya no hacen falta para saber que existen.
   *
   * El `Set` vive **acá** y no en la pantalla porque el conjunto tiene que ser el
   * de las cartas **visibles**, y eso solo lo sabe esta lista. `Set` y no array:
   * `has`, `add` y `delete` son O(1), y con 240 cartas cargadas un `includes`
   * lineal por tile son 240 comparaciones por render.
   *
   * Se ajustan a la lista en el render y no en un efecto (el patrón de
   * `useChunkedList`): si una carta seleccionada desaparece —la borraste, o el
   * filtro la saca— el `Set` se poda acá, que es un render extra y no una
   * cascada.
   */
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [isBulkRunning, setIsBulkRunning] = useState(false);
  const [bulkDone, setBulkDone] = useState(0);

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
    // La lista pasa el AbortSignal hasta fetch: al cambiar colección, filtros o
    // sort, el request anterior se cancela en vez de seguir ocupando trabajo.
    (page, signal) =>
      listItems(collectionId, {
        page,
        pageSize: COLLECTION_PAGE_SIZE,
        // Los dos filtros son server-side: el `where` del backend compone
        // `quantity: { gt: 1 }` con `isForTrade: true`, y el `total` sale del
        // `count` con el mismo filtro. Antes el de intercambio se filtraba en el
        // cliente, lo que hacía que "0 resultados" en la página 3 no significara
        // que la colección no tuviera.
        duplicatesOnly: scope === 'duplicates',
        forTradeOnly,
        // `undefined` y no `'none'`: `buildQueryString` saltea los `undefined`, y
        // mandar un valor que no está en `CARD_SORT_FIELDS` haría que el
        // `ValidationPipe` lo rechace con un 400.
        sort: sort === 'none' ? undefined : sort,
    }, signal),
    COLLECTION_PAGE_SIZE,
    { enabled },
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

  /*
   * La poda de la selección, en el render.
   *
   * `items` es lo que se muestra: el filtro de intercambio ya lo hizo el
   * servidor, así que no hay una segunda lista "visible" que pueda discrepar de
   * lo que se está pintando.
   *
   * Es el mismo criterio que el reset de `useChunkedList`: si la lista cambió
   * —cambió el filtro, se borró una carta— y el `Set` tiene ids que ya no
   * existen, se podan acá. Es un render extra y no una cascada, y garantiza que
   * la barra de la acción masiva nunca cuente cartas que no están en pantalla.
   */
  const visible = items;

  const liveIdsKey = visible.map((item) => item.id).join('|');
  const [lastLiveKey, setLastLiveKey] = useState(liveIdsKey);
  if (lastLiveKey !== liveIdsKey) {
    setLastLiveKey(liveIdsKey);
    if (selectedIds.size > 0) {
      setSelectedIds((current) => {
        const live = new Set(visible.map((item) => item.id));
        const next = new Set([...current].filter((id) => live.has(id)));
        return next.size === current.size ? current : next;
      });
    }
  }

  const toggleSelected = useCallback((itemId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  /**
   * Entrar y salir del modo selección.
   *
   * Salir **descarta** la selección: las casillas desaparecen y las cartas vuelven
   * a abrir su `ItemSheet`. Conservarla sería un estado invisible que reaparece
   * la próxima vez que se entra al modo, y el usuario no tiene forma de saber qué
   * sigue seleccionado. Un "Cancelar" que no limpia no cancela nada.
   */
  const exitSelection = useCallback(() => {
    setIsSelecting(false);
    setSelectedIds(new Set());
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelectedIds(new Set(visible.map((item) => item.id)));
  }, [visible]);

  /**
   * Marcar o desmarcar varias cartas de un saque.
   *
   * ## Por qué un bucle y no un endpoint
   *
   * **No existe** un endpoint masivo: el backend expone `PATCH /items/:itemId` de
   * a uno, y `UpdateItemPayload` acepta `isForTrade`. La alternativa sería
   * inventar un `POST /collections/:id/items/bulk` que el backend no tiene, y
   * eso es peor que N requests: es una pantalla que dice "listo" sin haber hecho
   * nada.
   *
   * El bucle es secuencial a propósito, no en paralelo: 60 `PATCH` en paralelo
   * contra el mismo servidor son 60 conexiones abiertas y, en una red móvil, es la
   * forma más rápida de que la mitad timeoute. Secuencial son N requests
   * (~40 ms cada una con Postgres local), o sea ~2,5 s para 60 cartas, con
   * progreso visible.
   *
   * ## Por qué el resultado es por ítem y no "todo o nada"
   *
   * Si la carta 30 falla, las 29 anteriores están marcadas igual. Informar
   * "falló" y dejar el estado visual como estaba mentiría sobre las 29. Así que
   * el conteo es explícito: se recarga la lista desde el hook (que es la única
   * fuente de verdad de qué quedó marcado) y el toast dice cuántas quedaron.
   */
  const runBulkTrade = useCallback(
    async (isForTrade: boolean) => {
      const targets = items.filter((item) => selectedIds.has(item.id));
      if (targets.length === 0) return;

      setIsBulkRunning(true);
      setBulkDone(0);

      let done = 0;
      let failed = 0;
      try {
        for (const target of targets) {
          try {
            await updateItem(target.id, { isForTrade });
            done += 1;
          } catch {
            failed += 1;
          }
          // El setter por cada ítem, y no uno al final: sin esto el botón dice
          // "marcando…" treinta segundos sin decir nada. Es un `setState` desde
          // una promesa, no desde el cuerpo de un efecto, así que no dispara el
          // lint de `set-state-in-effect`.
          setBulkDone(done + failed);
        }
      } finally {
        setIsBulkRunning(false);
        /*
         * La lista se recarga desde su propio hook y no desde el padre, para que
         * la grilla no se vacíe: `useInfiniteList` conserva los items anteriores
         * hasta que llega la página nueva. Y es la única forma de que las
         * casillas reflejen lo que el backend aceptó: el estado local sería una
         * segunda fuente de verdad, y en un bucle de N requests es exactamente
         * donde divergiría.
         */
        reload();
        setSelectedIds(new Set());

        if (failed === 0) {
          toast.success(
            isForTrade ? BULK_TRADE_COPY.marked(done) : BULK_TRADE_COPY.unmarked(done),
          );
        } else {
          toast.warning(
            `${isForTrade ? BULK_TRADE_COPY.marked(done) : BULK_TRADE_COPY.unmarked(done)} ${
              BULK_TRADE_COPY.failed
            }`,
          );
        }
      }
    },
    [items, reload, selectedIds, toast],
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

  /*
   * Troceo de **render** sobre los items que ya están en memoria.
   *
   * `useInfiniteList` (arriba) pagina requests; este trocea filas. A la décima
   * página hay 240 tiles y 240 `next/image` en el DOM, con layout y paint de los
   * 220 que están fuera de pantalla.
   *
   * `content-visibility: auto` está descartado por el mismo motivo que en
   * `binder-view.tsx`: el grid deja de tener altura calculada (scroll con saltos)
   * y el find-in-page deja de encontrar las cartas que no se pintaron.
   *
   * ## Por qué no rompe el scroll a la primera carta nueva
   *
   * Porque el corte es un **prefijo** (`items.slice(0, limit)`): el `data-card-
   * index` de cada celda es su posición en lo pintado, y como lo pintado es el
   * comienzo de `visible`, que es el comienzo de `items`, ese índice **es** el
   * índice global. `visible` (el filtro de intercambio) va **dentro** del troceo
   * y no al revés, así que la propiedad se preserva en los dos casos.
   */
  const {
    visible: itemsToRender,
    hasMore: hasMoreChunks,
    showMore,
    sentinelRef: chunkSentinelRef,
  } = useChunkedList(visible, COLLECTION_CHUNK, listKey);

  /*
   * Las entradas se cortan con la grilla, no antes.
   *
   * `itemsToRender` es el prefijo que se pinta, y el `data-card-index` de cada
   * celda es su posición en eso. Como lo pintado es el comienzo de `visible`, ese
   * índice **es** el índice global: no hay offset que sumar ni `CardGrid` que
   * tocar. Es lo que hace que el troceo sea invisible para el scroll a la primera
   * carta nueva de más arriba.
   */
  const entries: CardGridEntry[] = useMemo(
    () =>
      itemsToRender.map((item) => ({
        card: item.card,
        quantity: item.quantity,
        // La misma carta puede estar dos veces con variantes distintas
        // (holofoil y normal) y la `key` sola las confunde: React reusa el nodo
        // y el primer hover se queda pegado al equivocado.
        key: `${item.variant}-${item.condition}-${item.id}`,
        isSelected: selectedIds.has(item.id),
        onToggleSelect: () => toggleSelected(item.id),
        // El texto que se anuncia cuando la celda está elegida. Va con la
        // variante y la condición porque en una colección la misma carta puede
        // aparecer dos veces (holofoil y normal), y "Charizard" a secas no
        // distinguiría una de otra.
        selectionLabel: `${variantLabel(item.variant)} ${conditionShort(item.condition)}, elegida`,
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
    [itemsToRender, onOpenItem, selectedIds, toggleSelected],
  );

  /*
   * Los dos filtros de la lista son **server-side**, así que una respuesta vacía
   * ya es la respuesta completa: `items.length === 0` con un filtro puesto no
   * significa que la colección esté vacía, sino que el filtro no	matchea nada.
   * Sin esta distinción, activar "para intercambiar" en una colección sin cartas
   * marcadas mostraba "Esta colección está vacía" y mandaba a buscar una carta
   * que el usuario ya tenía.
   */
  const hasFilter = scope !== 'all' || forTradeOnly;
  const isEmptyResult = !isLoading && !error && items.length === 0;
  const isEmptyCollection = isEmptyResult && !hasFilter;
  const isEmptyFilter = isEmptyResult && hasFilter;

  /**
   * El copy del vacío nombra el filtro que no matcheó.
   *
   * Los dos filtros se pueden combinar ("duplicadas para intercambiar"), así
   * que hay cuatro combinaciones y el texto tiene que decir la correcta. Decir
   * "no hay resultados" sin decir por qué deja al usuario adivinando si el
   * botón que acaba de tocar funcionó.
   */
  const emptyFilterCopy = (() => {
    if (scope === 'duplicates' && forTradeOnly) {
      return {
        filterLabel: 'los filtros',
        title: 'Ninguna duplicada está para intercambiar',
        description:
          'Buscaste las cartas que tienen más de una copia y que marcaste para intercambiar, y no hay ninguna en esta colección.',
      };
    }
    if (scope === 'duplicates') {
      return {
        filterLabel: 'el filtro',
        title: 'No tenés cartas duplicadas',
        description:
          'Ninguna carta de esta colección tiene más de una copia. Agregá la misma carta dos veces y va a aparecer acá.',
      };
    }
    return {
      filterLabel: 'el filtro',
      title: 'Ninguna está para intercambiar',
      description:
        'Ninguna de las cartas de esta colección está marcada para intercambiar. Abrí una carta y activá el intercambio para sumar una.',
    };
  })();

  /*
   * El `total` es el del filtro puesto, porque viene del mismo `where` que la
   * lista. Con el filtro de intercambio server-side, "12 de 40 cartas para
   * intercambiar" cuenta sobre la colección entera y no sobre la página.
   */
  const loadedLabel = `${formatCount(items.length)} de ${formatCount(total)} ${pluralize(
    total,
    'carta',
    'cartas',
  )}${forTradeOnly ? ' para intercambiar' : ''}`;

  const selectedCount = selectedIds.size;
  /*
   * El botón de entrar al modo selección.
   *
   * No se puede resolver solo con "cuando haya selección": el primer toque es
   * justamente lo que no tiene selección todavía. Y un botón que aparece solo
   * cuando ya se seleccionó algo no se puede usar para empezar.
   *
   * Es un `Button` `ghost` y no un `Chip` de la fila de filtros por dos razones:
   * los `Chip` de esa fila son **filtros** de un conjunto que scrollea (§8.4) y
   * esto no filtra nada, y el `Chip` no tiene estado deshabilitado, que hace
   * falta acá porque con una sola carta no tiene sentido entrar al modo.
   */
  const canSelect = visible.length > 1 && !isLoading && error === null;

  return (
    <div hidden={!isVisible} className="flex flex-col gap-4">
      {/*
        `aria-live="polite"` y no `role="status"`: el texto cambia con cada
        "Cargar más", y `role="status"` en un elemento que ya se está anunciando
        hace que algunos lectores corten el anuncio a mitad.
      */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p aria-live="polite" className="text-caption text-tertiary tabular-nums">
          {isLoading ? 'Cargando cartas…' : loadedLabel}
        </p>

        {canSelect ? (
          <Button variant="ghost" size="sm" onClick={() => setIsSelecting(true)}>
            <ListChecks
              aria-hidden="true"
              focusable="false"
              strokeWidth={1.75}
              className="h-4 w-4"
            />
            Seleccionar
          </Button>
        ) : null}
      </div>

      {/*
        La barra de la acción masiva aparece **arriba** de la grilla y no abajo,
        aunque la `CollectionBottomBar` de totales esté fija al pie.

        Es una decisión de reachability: la acción se aplica a lo que se ve, así
        que tiene que estar donde se decide, que es arriba de la lista. Abajo
        tendría que competir con la barra de totales (que además se posiciona
        sobre la `BottomNav`) y el usuario tendría que scrollear hasta abajo para
        confirmar una selección que hizo arriba.
      */}
      {isSelecting ? (
        <BulkTradeBar
          selectedCount={selectedCount}
          totalVisible={visible.length}
          isRunning={isBulkRunning}
          done={bulkDone}
          onSelectAll={selectAllVisible}
          onMark={() => void runBulkTrade(true)}
          onUnmark={() => void runBulkTrade(false)}
          onClear={() => setSelectedIds(new Set())}
          onCancel={exitSelection}
        />
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
              href="/buscar"
              className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'px-5')}
            >
              <Search aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-5 w-5" />
              Buscar cartas
            </Link>
          }
        />
      ) : null}

      {/*
        Vacío **del filtro**. Con los filtros server-side el backend ya devolvió
        la respuesta completa, así que el copy puede nombrar el criterio que no
        matchea y ofrecer sacarlo. Antes tenía que pedir "cargar más", porque
        con el filtrado en el cliente la respuesta vacía no distinguía "no hay"
        de "todavía no cargaste".
      */}
      {isEmptyFilter ? (
        <EmptyState
          kind="no-results"
          size="sm"
          icon={Search}
          title={emptyFilterCopy.title}
          description={emptyFilterCopy.description}
          action={
            <Button variant="ghost" size="md" onClick={onClearListFilters}>
              Quitar {emptyFilterCopy.filterLabel}
            </Button>
          }
        />
      ) : null}

      {/* 5 · listo */}
      {itemsToRender.length > 0 ? (
        <div ref={gridRef}>
          <CardGrid
            variant="collection"
            entries={entries}
            label="Cartas de la colección"
            showSelection={selectedCount > 0 || isBulkRunning}
          />
        </div>
      ) : null}

      {/*
        El sentinel del troceo va **entre** la grilla y el "Cargar más", en ese
        orden y no al revés.

        Es lo que hace que los dos hooks sean independientes de verdad: el corte de
        render se resuelve primero (el sentinel está más arriba) y la request solo
        se dispara cuando el usuario llegó al final de **todo** lo pintado. Al
        revés, cada autoload traería una página nueva que quedaría detrás del corte
        sin verse, y el usuario vería la grilla quieta mientras el contador de
        "24 de 300" sube.
      */}
      {hasMoreChunks ? (
        <div ref={chunkSentinelRef} className="flex justify-center">
          <Button variant="ghost" size="md" onClick={showMore}>
            Ver {formatCount(visible.length - itemsToRender.length)} cartas más
          </Button>
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

/**
 * La barra de la acción masiva.
 *
 * Va arriba de la grilla y no en la `CollectionBottomBar` fija: el
 * `CollectionBottomBar` es de totales y está anclado al piso, sobre la
 * `BottomNav`. Poner acciones ahí las pondría a 8 rem del contenido, que es
 * exactamente donde el usuario no está mirando cuando acaba de seleccionar
 * treinta casillas en la grilla.
 *
 * ## El `indeterminate` del checkbox
 *
 * "Seleccionar todas" es un `Checkbox` con tercer estado, y el estado
 * indeterminado **no** es decorativo: es lo que dice "hay 12 de 48". Un botón
 * que dice "Seleccionar todas" con 12 seleccionadas miente sobre lo que va a
 * pasar; el `aria-checked="mixed"` del `Checkbox` es lo que lo hace honesto, y es
 * un camino del componente que ya existía y que ninguna pantalla usaba.
 */
function BulkTradeBar({
  selectedCount,
  totalVisible,
  isRunning,
  done,
  onSelectAll,
  onMark,
  onUnmark,
  onClear,
  onCancel,
}: {
  selectedCount: number;
  totalVisible: number;
  isRunning: boolean;
  done: number;
  onSelectAll: () => void;
  onMark: () => void;
  onUnmark: () => void;
  /** Vacía la selección sin salir del modo (la casilla "seleccionar todas"). */
  onClear: () => void;
  /** Sale del modo selección (el botón "Listo"). */
  onCancel: () => void;
}) {
  const allSelected = totalVisible > 0 && selectedCount === totalVisible;

  /*
   * El tope se **aplica**, no solo se avisa.
   *
   * Un `Alert` que dice "son N requests" arriba de un botón que acepta 300 cartas
   * deja la decisión en el usuario sin darle la opción deecommerce: acepta algo
   * que va a tardar dos minutos. Así que por encima del tope las dos acciones
   * quedan apagadas, y el aviso pasa a `warning` diciendo qué hacer en su lugar.
   *
   * "Seleccionar todas" **no** se apaga por el tope: es el atajo para llegar
   * rápido al tope, y deshabilitarlo obligaría a tocar 60 casillas una por una
   * para descubrir que el límite existe.
   */
  const isOverLimit = selectedCount > MAX_BULK_ITEMS;
  const actionsDisabled = isRunning || isOverLimit;

  return (
    <Surface className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {/*
          El `<label>` es real y apunta al `id` del input: envolver el checkbox
          sin `id` deja el control sin nombre programático y el lector de
          pantalla no anuncia nada (el mismo motivo que el `Checkbox` de
          `item-sheet.tsx`).
        */}
        <Checkbox
          id="seleccionar-todas"
          checked={allSelected}
          indeterminate={selectedCount > 0 && !allSelected}
          onCheckedChange={(checked) => {
            if (checked) onSelectAll();
            else onClear();
          }}
          label="Seleccionar todas las que están cargadas"
        />

        <span className="text-caption text-secondary tabular-nums">
          {formatCount(selectedCount)} de {formatCount(totalVisible)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="md"
          onClick={onMark}
          disabled={actionsDisabled || selectedCount === 0}
          loading={isRunning}
          pendingLabel={`Marcando ${done} de ${selectedCount}…`}
        >
          <ArrowLeftRight
            aria-hidden="true"
            focusable="false"
            strokeWidth={1.75}
            className="h-4 w-4"
          />
          Marcar para intercambio
        </Button>

        <Button variant="ghost" size="md" onClick={onUnmark} disabled={actionsDisabled}>
          Quitar marca
        </Button>

        <Button variant="ghost" size="md" onClick={onCancel} disabled={isRunning}>
          Listo
        </Button>
      </div>

      {/*
        El aviso de que son N requests. Va **siempre visible** mientras hay
        selección, no solo cuando supera el tope: si el usuario elige 30 cartas y
        la acción tarda tres segundos, tiene que saber de antemano que va a
        tardar y por qué. Un pedido que se hace explícito y se anuncia es un
        pedido que el usuario puede aceptar o no apretando otra cosa.

        Y cuando la selección supera `MAX_BULK_ITEMS` el aviso cambia de `info` a
        `warning` y dice qué hacer, porque el botón ya no está disponible y un
        botón deshabilitado sin motivo es un mueble (§0.5).
      */}
      <Alert
        tone={selectedCount > MAX_BULK_ITEMS ? 'warning' : 'info'}
        size="sm"
        title={
          selectedCount > MAX_BULK_ITEMS
            ? 'Demasiadas cartas para una sola vez'
            : 'Esto hace una request por carta'
        }
      >
        {selectedCount > MAX_BULK_ITEMS
          ? `Llegaste a ${formatCount(MAX_BULK_ITEMS)} seleccionadas y el máximo por tanda es ese. Marcá las que quieras y después repetí con el resto.`
          : 'El backend todavía no tiene una acción masiva, así que vamos a guardar las cambios de a una. Tardamos un poco más, pero no tocamos nada que no hayas elegido.'}
      </Alert>
    </Surface>
  );
}
