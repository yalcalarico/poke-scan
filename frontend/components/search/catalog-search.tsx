'use client';

import { Compass, Search, SearchX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { CardGrid } from '@/components/cards/card-grid';
import {
  Alert,
  Button,
  CardGridSkeleton,
  EmptyState,
  ErrorState,
} from '@/components/ui';
import { useAsync } from '@/hooks/use-async';
import { useInfiniteList } from '@/hooks/use-infinite-list';
import { useChunkedList } from '@/components/set-progress/use-chunked-list';
import { getSets, searchCards } from '@/lib/api';
import type { CardSearchField as SearchField } from '@/lib/api';
import { toUserFacingMessage } from '@/lib/api/user-message';
import { pluralize } from '@/lib/format';
import { applySearchParamChanges } from '@/lib/search-params';
import type { CardDto, CardSort, CardSortDirection, SetDto } from '@/types/api';

import { CATALOG_PAGE_SIZE, SEARCH_DEBOUNCE_MS } from './catalog-options';
import { SearchControls } from './search-controls';

/**
 * `Intl.NumberFormat` en el módulo y no en el render: el constructor es caro y
 * se puede cachear. Va acá y no en `lib/format.ts` porque ese formatea moneda y
 * fechas, y esto es un conteo de cartas.
 */
const COUNT_FORMAT = new Intl.NumberFormat('es-AR');

/**
 * Cuántas cartas se **pintan** por tanda, una vez que ya están en memoria.
 *
 * Es independiente de `CATALOG_PAGE_SIZE` (que pagina requests). 60 es el mismo
 * número que el binder usa para sus slots y por el mismo motivo: el viewport de
 * 390 × 844 muestra ~20 tiles de esta grilla, así que 60 deja tres pantallas de
 * margen para que el sentinel de 600 px traiga la tanda siguiente antes de que el
 * usuario llegue al final.
 *
 * Con esto el pico del DOM son 120 tiles (una tanda entrando) en vez de los 240
 * que había a la décima página.
 */
const RESULTS_CHUNK = 60;

/**
 * Todo el cuerpo de `/buscar`.
 *
 * ## La URL es la fuente de verdad
 *
 * `q`, `setId`, `rarity` y `page` salen de `useSearchParams` y no del estado.
 * Un link a `/buscar?q=charizard&setId=sv3&page=2` reproduce la pantalla
 * exacta, y el botón atrás del browser deshace un cambio de filtro sin que
 * haya que mantener una pila de filtros en el estado.
 *
 * ## Por qué la lista se remonta con `key`
 *
 * `<CardResults key={listKey}>` se remonta cuando cambia cualquier criterio.
 * La alternativa — un efecto que llame a `reload()`— es exactamente el
 * anti-patrón de `docs/gotchas.md` #9: un `setState` en el camino síncrono de
 * un efecto, que dispara un render en cascada y que con el doble montaje de
 * `StrictMode` puede pedir dos veces. Con `key` el estado viejo se descarta con
 * el nodo y no hay nada que sincronizar. De paso el contador de "cartas ya
 * cargadas" —del que depende el scroll a la primera carta nueva— arranca en
 * cero con la lista, sin que haya que resetearlo a mano.
 */
export function CatalogSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlQuery = searchParams.get('q') ?? '';
  const urlSetId = searchParams.get('setId') ?? '';
  const urlRarity = searchParams.get('rarity') ?? '';
  const urlPage = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  /**
   * El campo contra el que matchea `q`. Va en la URL para que un link a
   * `/buscar?q=ken%20sugimori&searchBy=artist` reproduzca la búsqueda por
   * artista y no una por nombre que no encuentra nada.
   *
   * El default es `name` y **no** se escribe en la URL: `/buscar?q=gengar` es
   * la URL que se comparte y tiene que seguir siendo corta. Solo aparece el
   * parámetro cuando el usuario elige un modo que no es el de partida.
   */
  const rawSearchBy = searchParams.get('searchBy');
  const urlSearchBy: SearchField =
    rawSearchBy === 'number' || rawSearchBy === 'artist' ? rawSearchBy : 'name';

  /**
   * Orden y sentido, también en la URL por la misma razón que el resto: un link
   * a `/buscar?sort=price&direction=desc` tiene que abrir exactamente esa
   * pantalla, y el botón atrás deshace un cambio de orden sin pila de filtros.
   *
   * `name` es el default y no se escribe, igual que `searchBy=name`: la URL que
   * se comparte tiene que seguir siendo corta.
   */
  const rawSort = searchParams.get('sort');
  const urlSort: CardSort =
    rawSort === 'price' || rawSort === 'rarity' || rawSort === 'number' ? rawSort : 'name';
  const urlDirection: CardSortDirection =
    searchParams.get('direction') === 'desc' ? 'desc' : 'asc';

  const [inputValue, setInputValue] = useState(urlQuery);

  /**
   * El último valor que NOSOTROS escribimos en la URL. Distingue "la URL cambió
   * porque el usuario llegó por un link o apretó atrás" de "la URL cambió
   * porque vos mismo escribiste en el input": en el segundo caso no hay que
   * pisarle el input al usuario.
   *
   * Sin esto, escribir la primera letra dispara el efecto URL → input en la
   * misma pasada y el carácter desaparece. Es el bug de `docs/gotchas.md` #3,
   * y por eso la sincronización vive acá y no repartida en tres componentes.
   */
  const pushedQueryRef = useRef<string | null>(null);

  /**
   * La query string efectiva va en un ref, para que `updateUrl` sea **estable**
   * y varias acciones seguidas compongan sobre el último cambio solicitado.
   *
   * No es una micro-optimización: `pushQuery` entra en las deps del efecto del
   * debounce, y si su identidad cambiara en cada render el timer se rearma
   * perpetuamente y la query nunca llega a la URL. Con el ref, `updateUrl` (y
   * `pushQuery`) no dependen de nada y el efecto solo se rearma cuando cambia
   * lo que el usuario escribe o lo que hay en la URL.
   *
   * `updateUrl` actualiza el ref sincrónicamente; el efecto lo reconcilia cuando
   * Next confirma la navegación. Así el segundo click no parte de un
   * `useSearchParams()` anterior mientras el primer RSC sigue en vuelo.
   */
  const searchParamsRef = useRef(searchParams.toString());
  const pendingSearchParamsRef = useRef<string | null>(null);
  useEffect(() => {
    const committed = searchParams.toString();
    if (pendingSearchParamsRef.current === committed) {
      pendingSearchParamsRef.current = null;
      searchParamsRef.current = committed;
      return;
    }

    // Las navegaciones de `router.push` pueden resolver fuera de orden. Seguir
    // componiendo desde la última URL solicitada evita que una respuesta RSC
    // anterior borre un filtro más nuevo.
    if (pendingSearchParamsRef.current !== null) {
      searchParamsRef.current = pendingSearchParamsRef.current;
      return;
    }

    searchParamsRef.current = committed;
  }, [searchParams]);

  useEffect(() => {
    const syncAfterHistoryNavigation = () => {
      const committed = window.location.search.slice(1);
      pendingSearchParamsRef.current = null;
      searchParamsRef.current = committed;
    };
    window.addEventListener('popstate', syncAfterHistoryNavigation);
    return () => window.removeEventListener('popstate', syncAfterHistoryNavigation);
  }, []);

  const updateUrl = useCallback(
    (next: Record<string, string | null>) => {
      const queryString = applySearchParamChanges(searchParamsRef.current, next);
      if (queryString === searchParamsRef.current) return;
      // `useSearchParams` only updates after the RSC navigation commits. Update
      // synchronously so rapid control changes compose instead of losing the
      // first change while that request is in flight.
      searchParamsRef.current = queryString;
      pendingSearchParamsRef.current = queryString;
      // `scroll: false` es obligatorio: sin eso, cada tecla que pasa el debounce
      // saltaba al top de la página.
      router.push(queryString ? `/buscar?${queryString}` : `/buscar`, {
        scroll: false,
      });
    },
    [router],
  );

  /** Escribe la query en la URL marcando que el cambio es nuestro. */
  const pushQuery = useCallback(
    (value: string) => {
      pushedQueryRef.current = value;
      updateUrl({ q: value || null, page: null });
    },
    [updateUrl],
  );

  // input -> URL, con debounce.
  useEffect(() => {
    if (inputValue === urlQuery) return;
    const timer = setTimeout(() => pushQuery(inputValue.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [inputValue, urlQuery, pushQuery]);

  // URL -> input, solo cuando el cambio vino de afuera (link, atrás/adelante).
  useEffect(() => {
    if (pushedQueryRef.current !== null && urlQuery === pushedQueryRef.current) {
      pushedQueryRef.current = null;
      return;
    }
    setInputValue(urlQuery);
  }, [urlQuery]);

  const setChange = useCallback(
    (setId: string) => {
      updateUrl({ setId: setId || null, page: null });
    },
    [updateUrl],
  );

  const rarityChange = useCallback(
    (rarity: string) => {
      updateUrl({ rarity: rarity || null, page: null });
    },
    [updateUrl],
  );

  /**
   * Cambiar el campo de búsqueda **conserva el texto**. Si estabas buscando
   * "gengar" por nombre, cambiás a Número y el input sigue diciendo "gengar":
   * eso es lo que esperás, y borrar el texto para que pruebes otra cosa es
   * decidir por vos.
   *
   * No cambia `q` pero sí resetea `page`: la página 7 de una búsqueda por
   * nombre no es la página 7 de una por artista.
   */
  const searchByChange = useCallback(
    (searchBy: SearchField) => {
      updateUrl({ searchBy: searchBy === 'name' ? null : searchBy, page: null });
    },
    [updateUrl],
  );

  /**
   * El orden resetea `page` por la misma razón que los filtros: la página 7 de
   * un catálogo ordenado por nombre no es la página 7 del mismo catálogo
   * ordenado por precio.
   *
   * Cambiar el `sort` pone la dirección en `desc` cuando el criterio es `price`
   * o `number`, porque "las más caras primero" es lo que se busca y "la más
   * barata primero" es la lectura literal de un `asc`. El nombre sigue en `asc`
   * porque alfabético descendente no lo pide nadie.
   */
  const sortChange = useCallback(
    (sort: CardSort) => {
      const direction: CardSortDirection = sort === 'price' || sort === 'number' ? 'desc' : 'asc';
      updateUrl({ sort: sort === 'name' ? null : sort, direction, page: null });
    },
    [updateUrl],
  );

  const directionChange = useCallback(
    (direction: CardSortDirection) => {
      // `asc` es el default del backend: no hace falta mandarlo.
      updateUrl({ direction: direction === 'asc' ? null : direction, page: null });
    },
    [updateUrl],
  );

  const hasCriteria = urlQuery.trim() !== '' || urlSetId !== '' || urlRarity !== '';

  const clearFilters = useCallback(() => {
    // La marca va **antes** de limpiar, por la misma razón que en `pushQuery`:
    // si no, el efecto URL → input le pisa el `''` al input recién vaciado con
    // la query vieja.
    pushedQueryRef.current = '';
    setInputValue('');
    updateUrl({ q: null, setId: null, rarity: null, page: null });
  }, [updateUrl]);

  /**
   * Limpiar **solo** los filtros, sin tocar lo que la persona escribió.
   *
   * Es el botón del `Sheet` de filtros, y son dos cosas distintas: la query es
   * lo que alguien tecleó para encontrar algo concreto, y vaciarla desde un
   * botón que dice "limpiar filtros" tira el trabajo de tipeo sin avisar. El
   * `q` tampoco se marca, porque acá no se toca el input y no hay carrera entre
   * el efecto URL → input y un estado local recién escrito.
   */
  const clearFilterParams = useCallback(() => {
    updateUrl({ searchBy: null, setId: null, rarity: null, sort: null, direction: null, page: null });
  }, [updateUrl]);

  const sets = useAsync<SetDto[]>(() => getSets(), []);

  const listKey = `${urlSearchBy}|${urlQuery}|${urlSetId}|${urlRarity}|${urlSort}|${urlDirection}|${urlPage}`;

  return (
    <div className="flex flex-col gap-6">
      {/*
        Estado parcial de §9.1 #4: los sets no son un filtro opcional, pero su
        carga tampoco puede tumbar la pantalla. Si fallan, el catálogo sigue
        funcionando por nombre y por rareza, así que es `warning` y no `error`
        (§2.3: el usuario **puede** seguir haciendo lo que quería).
      */}
      {sets.status === 'error' ? (
        <Alert
          tone="warning"
          size="sm"
          title="No pudimos cargar los sets"
          action={
            <Button size="sm" variant="secondary" onClick={sets.reload}>
              Reintentar
            </Button>
          }
        >
          Podés buscar por nombre y filtrar por rareza igual.
        </Alert>
      ) : null}

      <SearchControls
        value={inputValue}
        onValueChange={setInputValue}
        onSubmit={() => pushQuery(inputValue.trim())}
        searchBy={urlSearchBy}
        onSearchByChange={searchByChange}
        setId={urlSetId}
        onSetIdChange={setChange}
        rarity={urlRarity}
        onRarityChange={rarityChange}
        sort={urlSort}
        onSortChange={sortChange}
        direction={urlDirection}
        onDirectionChange={directionChange}
        hasQuery={urlQuery.trim() !== ''}
        sets={sets.data ?? []}
        setsLoading={sets.status === 'loading'}
        setsError={sets.status === 'error' ? sets.error : null}
        onClearFilters={clearFilterParams}
      />

      <CardResults
        key={listKey}
        query={urlQuery.trim()}
        searchBy={urlSearchBy}
        setId={urlSetId}
        rarity={urlRarity}
        initialPage={urlPage}
        sort={urlSort}
        direction={urlDirection}
        hasCriteria={hasCriteria}
        listKey={listKey}
        onClearFilters={clearFilters}
      />
    </div>
  );
}

interface CardResultsProps {
  query: string;
  searchBy: SearchField;
  setId: string;
  rarity: string;
  initialPage: number;
  sort: CardSort;
  direction: CardSortDirection;
  hasCriteria: boolean;
  /**
   * La identidad del criterio, que es la `key` del remontaje.
   *
   * Se pasa como prop y no se vuelve a armar acá porque el `useChunkedList` la
   * necesita como `resetKey` y las dos tienen que ser **la misma** string: si el
   * troceo se resetea con una clave y la lista con otra, un cambio de criterio
   * puede dejar 60 filas del resultado anterior pintadas al lado del nuevo. La
   * fuente única es la `listKey` de `CatalogSearch`, y que la pase evita que las
   * dos se desincronicen.
   */
  listKey: string;
  onClearFilters: () => void;
}

/**
 * Los resultados y sus cinco estados (§9.1), en orden de código: skeleton,
 * error, vacío, parcial, listo.
 *
 * Vive aparte de `CatalogSearch` y se remonta con `key`: así el estado de la
 * lista no sobrevive a un cambio de criterio y no hace falta un efecto que lo
 * invalide.
 */
function CardResults({
  query,
  searchBy,
  setId,
  rarity,
  initialPage,
  sort,
  direction,
  hasCriteria,
  listKey,
  onClearFilters,
}: CardResultsProps) {
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
  } = useInfiniteList<CardDto>(
    // El `signal` se pasa tal cual: el fetcher de `useInfiniteList` lo encadena
    // hasta `fetch`, así que cambiar de filtro o de página **cancela** el
    // request anterior en vez de dejarlo occupying trabajo hasta que responde.
    // La query se sigue armando en un solo lugar —acá— para que "un link
    // reproduce la pantalla" siga siendo cierto.
    (page, signal) =>
      searchCards({
        q: query || undefined,
        searchBy,
        setId: setId || undefined,
        rarity: rarity || undefined,
        page,
        pageSize: CATALOG_PAGE_SIZE,
        // Con texto el backend ignora `sort` y `direction` (manda el score de
        // relevancia) y con `price` cae en el `ORDER BY` de precio de mercado.
        // Se mandan igual porque el filtro de la UI ya está apagado en ese caso
        // y la URL sigue reproducida: mandar lo que el usuario eligió es lo que
        // hace que la pantalla y la URL digan lo mismo.
        sort,
        direction,
      }, signal),
    CATALOG_PAGE_SIZE,
    { initialPage },
  );

  /**
   * Troceo de **render** sobre los items que ya están en memoria.
   *
   * ## Por qué dos capas de paginación
   *
   * `useInfiniteList` (arriba) pagina **requests**; esta pagina **filas** de un
   * array que ya está en el cliente. Lo que duele es lo segundo: a la décima
   * "Cargar más" hay 240 tiles y 240 `next/image` en el DOM, con layout y paint
   * de los 220 que están fuera de pantalla.
   *
   * ## Por qué no `content-visibility: auto`
   *
   * Es el argumento que `binder-view.tsx` escribe para sus 300 slots, y aplica
   * igual: el grid deja de tener altura calculada hasta que cada celda entra en
   * pantalla (el scroll da saltos), y el **find-in-page deja de encontrar** las
   * cartas que no se pintaron. En `/buscar` eso es peor que en el binder:
   * buscar "Charizard" es la razón de que exista la pantalla, y un resultado de
   * cero sin explicación es el peor resultado posible.
   *
   * ## Por qué el corte es acumulativo
   *
   * `useChunkedList` devuelve `items.slice(0, limit)`, o sea un **prefijo**, no
   * una ventana. Eso es lo que hace que el `data-card-index` de cada celda siga
   * siendo el índice global: `visible[48] === items[48]`, así que el scroll a la
   * primera carta nueva de más abajo no necesita un offset y no se toca el
   * `CardGrid`.
   *
   * ## 60, y no CATALOG_PAGE_SIZE
   *
   * El viewport de 390 × 844 muestra ~20 tiles de la grilla de catálogo (2
   * columnas en mobile, 6 en `xl:`), así que 60 son tres pantallas de margen. Con
   * el sentinel de 600 px de `rootMargin`, la tanda siguiente entra antes de que
   * el usuario llegue al final del corte, así que nunca ve un hueco.
   */
  const {
    visible: itemsToRender,
    hasMore: hasMoreChunks,
    showMore,
    sentinelRef: chunkSentinelRef,
  } = useChunkedList(items, RESULTS_CHUNK, listKey);

  /**
   * El botón marca que esta carga fue pedida a propósito. El `IntersectionObserver`
   * carga la misma página sin marcar nada: si también scrolleara, cada autoload
   * le tiraría el scroll al usuario mientras está scrolleando, que es la forma
   * más rápida de hacer que odie el scroll infinito.
   *
   * Los dos hooks son **independientes** a propósito: el troceo se revela solo,
   * con su sentinel, y la request se pide sola, con el suyo. Atarlos haría que
   * cada "Cargar más" creciera el corte en 60 por 24 que se piden, y a las pocas
   * páginas el troceo no trocearía nada.
   */
  const handleLoadMore = useCallback(() => {
    scrollToNewRef.current = true;
    loadMore();
  }, [loadMore]);


  /**
   * Al entrar una página nueva por pedido, bajar a la primera carta nueva (§8.13).
   *
   * Sin esto, cargar más en una grilla de 2 columnas deja al usuario en el mismo
   * lugar de la pantalla mirando las mismas cartas, y no tiene forma de saber
   * si algo nuevo entró. Se busca por `data-card-index`, que es el índice que
   * tenía la lista antes de crecer.
   *
   * El largo anterior se actualiza **siempre**, se scrollee o no, porque es lo
   * que separa "las cartas de antes" de "la primera carta nueva" y tiene que
   * dar bien tanto después de un autoload como después de un click.
   *
   * ## Por qué el troceo no rompe esto
   *
   * Porque el corte es un **prefijo** (`items.slice(0, limit)`): el índice de la
   * celda es su posición en el array que se pinta, y como lo que se pinta es el
   * comienzo de la lista completa, ese índice **es** el índice global. Por eso
   * `data-card-index="48"` sigue siendo la carta 48 y no la carta 8 de la segunda
   * tanda.
   *
   * Y si la carta nueva todavía **no** llegó a pintarse (el corte estaba más
   * atrás que la página que acaba de entrar), el `querySelector` devuelve `null`
   * y no hay scroll: que es el comportamiento correcto, porque esa carta no está
   * en pantalla. Cuando el sentinel revele la tanda que la contiene, el usuario
   * la va a ver igual al seguir scrolleando — y el efecto ya gastó su intención,
   * así que no le va a robar el scroll mientras navega.
   */
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

  const counter = useMemo(
    () => `${COUNT_FORMAT.format(total)} ${pluralize(total, 'carta', 'cartas')}`,
    [total],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        {/*
          `aria-live="polite"` y no `role="status"`: el texto cambia con cada
          tecla que pasa el debounce, y `role="status"` en un elemento que ya
          se está anunciando hace que algunos lectores corten el anuncio a
          mitad. `polite` sola espera a que se calle.
        */}
        <p aria-live="polite" className="text-caption text-tertiary tabular-nums">
          {isLoading ? 'Buscando cartas…' : counter}
        </p>

        {hasCriteria ? (
          <Button variant="ghost" size="sm" onClick={onClearFilters}>
            Limpiar filtros
          </Button>
        ) : null}
      </div>

      {/* 1 · loading — el skeleton tiene la forma real de la grilla, no la de un
          rectángulo (§9.1). */}
      {isLoading ? <CardGridSkeleton count={CATALOG_PAGE_SIZE} /> : null}

      {/* 2 · error */}
      {error !== null && items.length === 0 ? (
        <ErrorState
          title="No pudimos cargar las cartas"
          message={toUserFacingMessage(error) ?? undefined}
          onRetry={reload}
          retrying={isLoading}
        />
      ) : null}

      {/* 3 · vacío */}
      {!isLoading && !error && items.length === 0 && hasCriteria ? (
        <EmptyState
          kind="no-results"
          icon={query ? SearchX : Search}
          title={query ? `Sin resultados para «${query}»` : 'Sin resultados con esos filtros'}
          description={
            query
              ? undefined
              : 'Probá con otro set o quitá el filtro de rareza y buscá de nuevo.'
          }
          query={query || undefined}
          action={
            <Button variant="secondary" onClick={onClearFilters}>
              Limpiar filtros
            </Button>
          }
        />
      ) : null}

      {/* Sin filtros y sin query no hay "sin resultados": hay que explicar qué
          es esta pantalla (kind="first-use", §8.11). */}
      {!isLoading && !error && items.length === 0 && !hasCriteria ? (
        <EmptyState
          kind="first-use"
          icon={Compass}
          title="Buscá tu primera carta"
          description="Explorá el catálogo por nombre y filtrá por set o por rareza."
        />
      ) : null}

      {/* 5 · ready */}
      {itemsToRender.length > 0 ? (
        <div ref={gridRef}>
          <CardGrid cards={itemsToRender} label="Resultados de la búsqueda" />
        </div>
      ) : null}

      {/*
        El sentinel del troceo va **entre** la grilla y el "Cargar más", en ese
        orden y no al revés.

        Es lo que hace que los dos hooks sean independientes de verdad: el corte de
        render se resuelve primero (el sentinel está más arriba), y la request
        solo se dispara cuando el usuario llegó al final de **todo** lo pintado.
        Al revés, cada autoload traería una página nueva que quedaría detrás del
        corte sin verse, y el usuario vería la grilla quieta mientras el contador
        de resultados sube.
      */}
      {hasMoreChunks ? (
        <div ref={chunkSentinelRef} className="flex justify-center">
          <Button variant="ghost" size="md" onClick={showMore}>
            Ver {COUNT_FORMAT.format(items.length - itemsToRender.length)} cartas más
          </Button>
        </div>
      ) : null}

      {/*
        4 · parcial: la primera página cargó y *la siguiente* falló. La grilla se
        queda en pantalla — el problema es de una página, no de la pantalla — y
        el reintento es el mismo `loadMore`. El otro parcial de §9.1 #4 de esta
        pantalla (los sets que no cargaron) vive arriba, en `CatalogSearch`.
      */}
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

      {/*
        Con el botón del alert alcanza: dos CTAs idénticos al mismo `loadMore`
        en la misma pantalla es ruido. Y sin sentinel no hay autoload, que es lo
        correcto —no tiene sentido reintentar solo cada 600 px con el mismo
        error— y el botón del alert queda como la acción explícita.
      */}
      {hasMore && !error ? (
        <div ref={sentinelRef} className="flex justify-center pt-2">
          {/*
            El botón y el `IntersectionObserver` del hook apuntan al mismo
            `loadMore`: el observer adelanta la carga 600 px antes y el botón
            es el que queda si el browser no lo tiene, y el que el usuario
            puede apretar a propósito. Es un scroll infinito con freno de mano.
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
    </div>
  );
}
