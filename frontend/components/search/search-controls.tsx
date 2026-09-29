'use client';

import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useId, useMemo, useState } from 'react';

import { RarityFilter } from './rarity-filter';

import {
  Badge,
  Button,
  IconButton,
  Input,
  SegmentedControl,
  Select,
  Sheet,
  type SelectOptionItem,
} from '../ui';
import type { SetDto } from '@/types/api';

export type SearchMode = 'name' | 'number' | 'artist';

/**
 * Los campos contra los que el backend puede matchear `q`
 * (`SearchCardsDto.searchBy`, espejado en `CardSearchField`).
 *
 * `available` no es "existe en el backend" sino "el usuario puede activarlo
 * desde acá". Hoy los tres existen, así que los tres están disponibles; el
 * campo queda igual porque es el que evita tener que tocar la pantalla entera
 * si uno vuelve a quedar deshabilitado.
 *
 * Antes de que el backend tuviera los tres campos, `number` y `artist` estaban
 * `available: false` con un chip visible, tabulable y deshabilitado, y un
 * hint que decía que faltaban. Era preferible a un chip que fingiera
 * filtrar y devolviera resultados por nombre — pero ahora que el backend
 * responde de verdad, mostrar un control apagado es un defecto: la función
 * existe y la app no la ofrece.
 */
export const SEARCH_MODES = [
  { id: 'name', label: 'Nombre', available: true },
  { id: 'number', label: 'Número', available: true },
  { id: 'artist', label: 'Artista', available: true },
] as const satisfies readonly { id: SearchMode; label: string; available: boolean }[];

/**
 * Placeholder por modo. Un input que dice "Buscá por nombre" mientras el chip
 * activo es "Artista" hace dudar de los dos: de si el chip cambió algo y de qué
 * se espera que escribas.
 */
const SEARCH_PLACEHOLDERS: Record<SearchMode, string> = {
  name: 'Buscá por nombre: Charizard, Pikachu…',
  number: 'Buscá por número: 4, 25/102, 4a…',
  artist: 'Buscá por artista: Sugimori, Ken…',
};

/** Para el `sr-only` del label, que no lleva punto y coma. */
const MODE_LABELS: Record<SearchMode, string> = {
  name: 'Nombre',
  number: 'Número',
  artist: 'Artista',
};

export interface SearchControlsProps {
  /** Valor controlado del input. Lo maneja `catalog-search`, no este bloque. */
  value: string;
  onValueChange: (value: string) => void;
  /** Enter en el input o submit del form: empuja la query ya, sin esperar el debounce. */
  onSubmit: () => void;
  searchBy: SearchMode;
  onSearchByChange: (value: SearchMode) => void;
  setId: string;
  onSetIdChange: (value: string) => void;
  rarity: string;
  onRarityChange: (value: string) => void;
  sets: SetDto[];
  setsLoading?: boolean;
  setsError?: string | null;
  /** Limpia los tres filtros del `Sheet`. Lo provee `catalog-search`. */
  onClearFilters: () => void;
  className?: string;
}

/**
 * La barra del buscador, y **una sola fila**.
 *
 * ## Por qué los filtros viven en un `Sheet` y no acá arriba
 *
 * Antes esta pantalla apilaba cuatro cosas en vertical: el input, tres chips de
 * modo, un chip de set y una fila de doce rarezas. Medido en 390 px, eso son
 * unos 200 px de controles antes de la primera carta — más de la mitad de la
 * primera pantalla, y el usuario que ya conoce la app paga ese costo en cada
 * búsqueda.
 *
 * El precio de eso no es solo altura: es que el filtro **parece** el contenido.
 * Un bloque de controles del alto de media pantalla hace que la grilla —que es
 * lo que la gente vino a ver— parezca un afterthought debajo de un formulario.
 *
 * La salida es tratar la búsqueda como lo que es: **una barra con un input y un
 * botón**, y los filtros detrás de ese botón, que es además el patrón que ya
 * usa el resto de la app para lo que no cabe en pantalla (`ItemSheet`,
 * `SetFilterSheet`, `AddToCollectionSheet`). En mobile el `Sheet` entra desde
 * abajo, que es el gesto que ya está en el pulgar de cualquiera que use la app.
 *
 * El input **no** entra al `Sheet`: escribir es la acción principal y tiene que
 * quedar a la vista, con el teclado abierto y sin un tap de por medio.
 *
 * ## Lo que se ve sin abrir nada
 *
 * El botón dice cuántos filtros hay activos. Un filtro invisible es un filtro
 * que el usuario olvida que puso y después se pregunta por qué la grilla no
 * muestra lo que busca.
 */
export function SearchControls({
  value,
  onValueChange,
  onSubmit,
  searchBy,
  onSearchByChange,
  setId,
  onSetIdChange,
  rarity,
  onRarityChange,
  sets,
  setsLoading = false,
  setsError = null,
  onClearFilters,
}: SearchControlsProps) {
  const generatedId = useId();
  const inputId = `${generatedId}-q`;
  const filtersId = `${generatedId}-filters`;
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const unavailableModes = SEARCH_MODES.filter((mode) => !mode.available);

  const setOptions = useMemo<SelectOptionItem<string>[]>(
    () => [
      { value: '', label: 'Todos los sets' },
      ...sets.map((set) => ({ value: set.id, label: set.name, description: set.series ?? undefined })),
    ],
    [sets],
  );

  /**
   * Cuántos filtros están puestos. El modo `name` no cuenta: es el estado sin
   * filtro, igual que "Todas" en la lista de rarezas, y contarlo haría que el
   * badge dijera "1" en una búsqueda pelada.
   */
  const activeCount =
    (setId !== '' ? 1 : 0) + (rarity !== '' ? 1 : 0) + (searchBy !== 'name' ? 1 : 0);

  const setName = setId !== '' ? (sets.find((set) => set.id === setId)?.name ?? null) : null;

  const activeSummary = [
    searchBy !== 'name' ? MODE_LABELS[searchBy] : null,
    setName,
    rarity !== '' ? rarity : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' · ');

  /*
   * Un fragment, y no un `<div>`: el `position: sticky` de la barra se mueve
   * **dentro de su padre**, así que si la barra estuviera envuelta en una caja
   * que mide lo mismo que ella, no tendría dónde viajar. Medido: el padre daba
   * 73 px y la barra 73 px, y con `scrollTo(0, 1500)` la barra subía con el
   * contenido en vez de quedar pegada. Sin el wrapper, la barra pasa a ser
   * hija directa del contenedor de la pantalla —que mide toda la grilla— y ahí
   * sí se pega.
   *
   * El `Sheet` no se ve afectado: va por portal a `document.body`.
   */
  return (
    <>
      {/*
        La barra es **la** cabecera de la pantalla: se pegó arriba, con el
        mismo tratamiento que la `BottomNav` (`bg-surface/90` + `backdrop-blur`),
        y el `ScreenHeader` con el título "Buscar" desapareció.

        Eso no es una cuestión de espacio: el título repetía la etiqueta de la
        pestaña que ya está marcada en la `BottomNav` más abajo, sin botón de
        volver ni acción al lado. Era chrome que no informaba nada y empujaba
        la grilla 56 px hacia abajo.

        Pegarla, en cambio, no es decoración: `/buscar` es una grilla larga, y
        sin barra fija hay que subir 300 cartas hasta el input para cambiar una
        letra de la búsqueda. El `z-sticky` es el que usaba el header, así que
        no hay colisión nueva con la nav.

        El `env(safe-area-inset-top)` va acá porque el `ScreenHeader` era el
        que lo daba. Sin él, en iPhone con notch la barra queda bajo la muesca.
      */}
      <div className="sticky top-0 z-sticky -mx-4 flex items-stretch gap-2 border-b border-line-subtle bg-surface/90 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur-lg sm:-mx-6 sm:px-6">
        <form
          role="search"
          aria-label="Buscar cartas"
          className="min-w-0 flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <label htmlFor={inputId} className="sr-only">
            Buscar cartas por {MODE_LABELS[searchBy].toLowerCase()}
          </label>

          {/*
            `type="search"` por la semántica y por el teclado virtual, con el
            botón de limpiar de WebKit escondido: el nuestro va en el
            `trailingSlot`, y tener dos "x" en el mismo input es un bug, no una
            consecuencia de usar la plataforma.
          */}
          <Input
            id={inputId}
            size="lg"
            type="search"
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            placeholder={SEARCH_PLACEHOLDERS[searchBy]}
            leadingIcon={Search}
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={80}
            className="[&_input::-webkit-search-cancel-button]:appearance-none"
            trailingSlot={
              value ? (
                <IconButton
                  icon={X}
                  label="Limpiar búsqueda"
                  size="sm"
                  onClick={() => onValueChange('')}
                />
              ) : null
            }
          />
        </form>

        <Button
          id={filtersId}
          type="button"
          variant="secondary"
          size="lg"
          aria-haspopup="dialog"
          onClick={() => setIsFiltersOpen(true)}
          className="shrink-0"
        >
          <SlidersHorizontal aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-5 w-5" />
          <span className="hidden min-[380px]:inline">Filtros</span>
          {activeCount > 0 ? (
            /*
              El badge va con `aria-hidden` porque el nombre accesible del botón
              lo arma el `aria-label` de abajo: sin eso, un lector de pantalla
              anunciaría "Filtros 2 dos" y el número dos veces.
            */
            <Badge tone="brand" aria-hidden="true" className="tabular-nums">
              {activeCount}
            </Badge>
          ) : null}
          <span className="sr-only">
            {activeCount > 0 ? `Filtros: ${activeCount} activos (${activeSummary})` : 'Filtros'}
          </span>
        </Button>
      </div>

      {/*
        Los modos no disponibles no se anuncian acá: viven en el `Sheet`, y el
        hint solo se escribe cuando hay algo que avisar. Con los tres campos
        disponibles no dice nada, y una línea que reitera lo que el control
        activo ya muestra es ruido en cada carga.
      */}

      <Sheet
        open={isFiltersOpen}
        onClose={() => setIsFiltersOpen(false)}
        title="Filtros"
        subtitle={activeCount > 0 ? activeSummary : 'Sin filtros activos'}
        size="lg"
        footer={
          activeCount > 0 ? (
            <Button variant="ghost" size="md" onClick={onClearFilters} className="w-full">
              Limpiar filtros
            </Button>
          ) : null
        }
      >
        <div className="flex flex-col gap-6">
          {/*
            `SegmentedControl` y no chips: los tres modos son excluyentes y
            encajan en tres segmentos, que es exactamente para lo que existe.
            Los chips de filtro se reservan para las rarezas, que sí son un
            conjunto que se puede dejar en "Todas" o no.
          */}
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="text-overline text-tertiary">Buscá por</legend>
            <SegmentedControl
              label="Campo de búsqueda"
              value={searchBy}
              options={SEARCH_MODES.map((mode) => ({ value: mode.id, label: mode.label }))}
              onChange={onSearchByChange}
            />
            {unavailableModes.length > 0 ? (
              <p className="text-caption text-tertiary">
                Buscar por {unavailableModes.map((m) => m.label.toLowerCase()).join(' y por ')}{' '}
                llega más adelante.
              </p>
            ) : null}
          </fieldset>

          <div className="flex min-w-0 flex-col gap-2">
            {/*
              `Select` y no otro `Sheet`: el `Sheet` es una capa y no se anida
              (`registerLayer` cierra el que está abierto), así que un `Sheet`
              de sets adentro de este cerraría los filtros y tiraría al usuario
              de vuelta al `Sheet` anterior a dos toques. El `Select` es un
              popover, y con 176 sets se vuelve buscable solo (`> 12` opciones).
            */}
            <p className="text-overline text-tertiary" id={`${filtersId}-set`}>
              Set
            </p>
            <Select
              options={setOptions}
              value={setId === '' ? '' : setId}
              onChange={onSetIdChange}
              disabled={setsLoading || setsError !== null}
              aria-labelledby={`${filtersId}-set`}
              placeholder="Todos los sets"
            />
            {setsError !== null ? (
              <p className="text-caption text-tertiary">
                No pudimos cargar los sets. Podés seguir buscando por nombre y por rareza.
              </p>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-overline text-tertiary">Rareza</p>
            {/*
              Sin clase de sangría propia: `RarityFilter` **ya** trae
              `-mx-4 px-4`, que es lo que compensa el `px-4` del `SheetBody` para
              que la fila llegue al borde y el corte se lea como "hay más a la
              derecha". Agregar otro `-mx-4` acá suma los negativos y deja el
              primer chip a la mitad de la pantalla.
            */}
            <RarityFilter value={rarity} onChange={onRarityChange} />
          </div>
        </div>
      </Sheet>
    </>
  );
}
