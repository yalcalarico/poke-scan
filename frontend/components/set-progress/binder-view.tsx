'use client';

import { memo, useCallback, useMemo, useState } from 'react';

import { CardTile } from '@/components/cards/card-tile';
import { Money } from '@/components/cards/money';
import { SetLogo } from '@/components/cards/set-media';
import { AddToCollectionSheet, ItemSheet } from '@/components/collections/item-sheet';
import { Badge, Button, Chip, EmptyState, Progress, Surface } from '@/components/ui';
import { cn } from '@/lib/cn';
import { pluralize } from '@/lib/format';
import { variantShort } from '@/lib/variants';
import type { CollectionItemDto } from '@/types/api';

import { buildBinderSlots, type BinderSlot, type BinderSnapshot } from './set-progress-source';
import { useChunkedList } from './use-chunked-list';

const COUNT_FORMAT = new Intl.NumberFormat('es-AR');
const PERCENT_FORMAT = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

/**
 * 5 columnas en mobile, no las 3 de §7.2.
 *
 * La colección usa 3 porque su tile es la imagen sola y se lee de a 3; el binder
 * es al revés: el dato que importa es **el número de carta adentro del slot**,
 * y a 3 columnas (114 px de ancho) hay lugar de sobra y el set entero se
 * convierte en 100 filas de 160 px. A 5 el slot mide 65 × 91 px, que sigue
 * por encima del mínimo de 44 px de §0.5, y un set de 102 cartas son 21 filas en
 * vez de 34.
 */
const BINDER_GRID = 'grid grid-cols-5 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10';

/**
 * El `sizes` del binder, que no puede ser el de `variant="collection"`.
 *
 * `CardTile` resuelve su `sizes` por variante y el de `collection` (31vw) está
 * calculado para la grilla de 3 columnas de §7.2. El binder va a **5** columnas
 * en 390 px: el slot mide 65 px (≈17vw), así que el `srcset` que genera `31vw`
 * pide imágenes 2,4 veces más grandes que el slot y nunca se muestran a pantalla
 * completa. Con 300 slots en un set largo es la deuda de performance más grande
 * de la pantalla.
 *
 * Los tres cortes están calculados para que **nunca subestimen** el ancho real,
 * que es lo que hace que una imagen se vea borrosa:
 *
 * - `<640` → 5 col en `(100vw − 32 − 4×8)/5`. A 639 px da 115 px = 18vw.
 * - `<768` → 6 col en `(100vw − 48 − 5×8)/6`. A 767 px da 113 px = 15vw.
 * - `<1024` → 8 col en `(100vw − 48 − 7×8)/8`. A 1023 px da 115 px = 12vw.
 * - `≥1024` → 10 col, tope de `max-w-6xl`: 116 px, que es el slot más ancho
 *   que llega a existir (a 1280 px en adelante la grilla deja de crecer).
 */
const BINDER_SIZES =
  '(max-width: 639px) 18vw, (max-width: 767px) 15vw, (max-width: 1023px) 12vw, 116px';

/**
 * Cuántos slots se pintan por tanda.
 *
 * 300 slots son ~1.800 nodos de React (cada `CardTile` son 5 elementos: celda,
 * link, caja de imagen, `img` y la fila de acción) y ~300 `<img>` para
 * `next/image`. El viewport de 390 × 844 muestra **20**: el resto está fuera de
 * pantalla, pero si está en el DOM igual se le calcula layout, que es lo que
 * hace que un iPhone de gama media (A13, 2019) dequee al scrollear.
 *
 * 60 slots son 12 filas de 145 px ≈ 1.750 px: 2 pantallas de 844 px. Con el
 * sentinel (600 px de margen) la tanda siguiente entra antes de que el usuario
 * llegue al final, así que nunca ve un hueco.
 *
 * El corte es acumulativo a propósito, no una ventana deslizante: una ventana
 * que descarta las filas de arriba rompe el scroll de golpe, que es peor que
 * tener 300 nodos.
 *
 * ## Por qué trocear y no `content-visibility: auto`
 *
 * Se evaluaron las dos. `content-visibility: auto` con `contain-intrinsic-size`
 * sobre cada slot hace que el browser se salte layout y paint de lo que está
 * fuera de pantalla, y es la respuesta obvia; el problema es que el grid deja de
 * tener una altura calculada hasta que cada celda entra en pantalla, así que
 * Chrome y Safari recalculan el `scrollHeight` de a 20 celdas por vez y el
 * scroll da saltos en un set de 300 (el "scroll anchoring" pelea con el
 * `contain-intrinsic-size`), y el find-in-page deja de encontrar las cartas que
 * no se pintaron. Trocear resuelve el mismo problema de forma predecible: el
 * DOM nunca pasa de 120 slots y la altura de cada fila está siempre calculada.
 * Con `memo` abajo, cambiar de chip no vuelve a dibujar los slots que no
 * cambian, que es el otro 80 % del costo.
 */
const BINDER_CHUNK = 60;

type BinderMode = 'all' | 'missing' | 'duplicates';

const MODES: readonly { id: BinderMode; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'missing', label: 'Faltantes' },
  { id: 'duplicates', label: 'Duplicadas' },
];

export interface BinderViewProps {
  /**
   * La colección que se está mirando. Va al `AddToCollectionSheet` como
   * `defaultCollectionId`: sin esto, agregar desde el binder de una colección
   * que no es la principal mandaba la carta a otra y el usuario no se enteraba
   * hasta ver el número de otra colección cambiar.
   */
  collectionId: string;
  snapshot: BinderSnapshot;
  /** Un item cambió (agregado, editado o borrado): hay que volver a pedir el set. */
  onChanged: () => void;
}

/**
 * La Vista 2: el binder de un set.
 *
 * ## Los chips son estado local y no query string
 *
 * Todas / Faltantes / Duplicadas cambian **qué se ve adentro de la misma
 * pantalla**, no la URL (§11: si cambia la URL es un link, si no, es un chip con
 * `aria-pressed`). Lo que sí es query string es `?set=`, que es la Vista 2
 * completa: un link a `/colecciones/x/sets?set=swsh4` abre este set y sobrevive
 * a un refresh y al botón atrás.
 *
 * ## El filtro es local y no una request por chip
 *
 * Las tres vistas se derivan del mismo array de slots. "Faltantes" es
 * `slots.filter(s => !s.item)` y no un `?missingOnly=1` al backend: son 300 filas
 * que ya están en memoria, y mandarlas otra vez en cada toque es una request
 * para devolver exactamente lo mismo.
 */
export function BinderView({ collectionId, snapshot, onChanged }: BinderViewProps) {
  const { set, total } = snapshot;
  const name = set?.name ?? snapshot.setId;

  const [mode, setMode] = useState<BinderMode>('all');
  const [selectedItem, setSelectedItem] = useState<CollectionItemDto | null>(null);
  const [addCardId, setAddCardId] = useState<string | null>(null);

  const slots = useMemo(
    () => buildBinderSlots(snapshot.cards, snapshot.items),
    [snapshot.cards, snapshot.items],
  );

  const owned = useMemo(() => slots.reduce((total, slot) => total + (slot.item ? 1 : 0), 0), [slots]);
  const missingCount = Math.max(0, total - owned);
  const percent = total > 0 ? Math.min(100, (owned / total) * 100) : null;

  const counts = useMemo(
    () => ({ all: total, missing: missingCount, duplicates: snapshot.duplicateCards }),
    [missingCount, snapshot.duplicateCards, total],
  );

  const filtered = useMemo(() => {
    if (mode === 'missing') return slots.filter((slot) => slot.item === null);
    if (mode === 'duplicates') return slots.filter((slot) => slot.isDuplicate);
    return slots;
  }, [mode, slots]);

  /*
   * Desestructurado y no como un objeto `visible`: el objeto que devuelve el
   * hook tiene una callback ref adentro, y el compilador de React marca el
   * objeto entero como valor de ref si se leen sus propiedades en el render
   * (`react-hooks/refs`). Es lo mismo que hace `useInfiniteList` en `/buscar`.
   */
  const {
    visible: slotsToRender,
    hasMore,
    showMore,
    sentinelRef,
  } = useChunkedList(filtered, BINDER_CHUNK, `${snapshot.setId}|${mode}`);

  const openItem = useCallback((item: CollectionItemDto) => {
    setSelectedItem(item);
  }, []);

  const openAdd = useCallback((cardId: string) => {
    setAddCardId(cardId);
  }, []);

  const closeSheets = useCallback(() => {
    setSelectedItem(null);
    setAddCardId(null);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <BinderSummary
        logoUrl={set?.logoUrl ?? null}
        name={name}
        owned={owned}
        total={total}
        valueUsd={snapshot.valueUsd}
        percent={percent}
        missingCount={missingCount}
        duplicateCards={snapshot.duplicateCards}
      />

      {/*
        Fila de chips con scroll propio: tres pills de 36 px no entran en 390 px
        con los gaps, y sin el `-mx-4` el scroll cortaría el pill contra el
        borde. El `py-1` evita que el anillo de foco quede recortado.
      */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:px-0">
        {MODES.map((option) => {
          const count = counts[option.id];
          return (
            <Chip
              key={option.id}
              active={mode === option.id}
              onClick={() => setMode(option.id)}
              aria-label={`${option.label} (${COUNT_FORMAT.format(count)})`}
            >
              {option.label}
              <span className="tabular-nums">{COUNT_FORMAT.format(count)}</span>
            </Chip>
          );
        })}
      </div>

      {slotsToRender.length === 0 ? (
        <BinderEmptyState mode={mode} name={name} total={total} />
      ) : (
        <div className={BINDER_GRID}>
          {slotsToRender.map((slot) => (
            <BinderSlotCell key={slot.card.id} slot={slot} onOpen={openItem} onAdd={openAdd} />
          ))}
        </div>
      )}

      {hasMore ? (
        <div ref={sentinelRef} className="flex justify-center">
          <Button variant="secondary" size="lg" onClick={showMore}>
            {COUNT_FORMAT.format(filtered.length - slotsToRender.length)} cartas más
          </Button>
        </div>
      ) : null}

      {/*
        Tocar un slot lleno abre la administración del item y uno vacío el alta.
        El alta preselecciona **esta** colección y no la principal: el usuario
        está mirando el binder de una colección puntual, y mandarle la carta a
        otra es el peor resultado posible de un toque bien hecho.
      */}
      <AddToCollectionSheet
        cardId={addCardId ?? ''}
        open={addCardId !== null}
        defaultCollectionId={collectionId}
        onClose={() => setAddCardId(null)}
        onAdded={onChanged}
      />

      <ItemSheet
        item={selectedItem}
        open={selectedItem !== null}
        onClose={closeSheets}
        onUpdated={onChanged}
        onDeleted={() => {
          setSelectedItem(null);
          onChanged();
        }}
      />
    </div>
  );
}

/**
 * El estado vacío del binder, que son **tres** cosas distintas y no una.
 *
 * `no-results` con el criterio repetido (§8.11, §10.2), nunca un bloque vacío:
 * el usuario tiene que poder distinguir "lo terminaste" de "no hay nada que
 * mostrar" de "este set no existe en el catálogo".
 */
function BinderEmptyState({
  mode,
  name,
  total,
}: {
  mode: BinderMode;
  name: string;
  total: number;
}) {
  if (total === 0) {
    return (
      <EmptyState
        kind="no-results"
        size="sm"
        title={`No hay cartas de ${name}`}
        description="El catálogo no devuelve ninguna carta para este set. Probá con otro."
      />
    );
  }

  if (mode === 'duplicates') {
    return (
      <EmptyState
        kind="no-results"
        size="sm"
        title={`No tenés duplicadas de ${name}`}
        description="Cada carta que tengas repetida aparece acá con su cantidad."
      />
    );
  }

  return (
    <EmptyState
      kind="no-results"
      size="sm"
      title={`Completaste ${name}`}
      description="No te falta ninguna carta de este set. Buscá otro set para seguir completando."
    />
  );
}

/**
 * El resumen del set: logo, cuántas cartas, cuánto vale y cuánto falta.
 *
 * `SetDto.logoUrl` es un campo del contrato que casi no se usaba. Si el logo no
 * se puede mostrar, `SetLogo` cae al nombre del set, que es lo que hay que leer
 * igual.
 */
function BinderSummary({
  logoUrl,
  name,
  owned,
  total,
  valueUsd,
  percent,
  missingCount,
  duplicateCards,
}: {
  logoUrl: string | null;
  name: string;
  owned: number;
  total: number;
  valueUsd: number;
  percent: number | null;
  missingCount: number;
  duplicateCards: number;
}) {
  return (
    <Surface className="flex flex-col gap-3">
      <SetLogo logoUrl={logoUrl} name={name} className="max-h-8 w-auto max-w-40" />

      <div className="flex items-baseline justify-between gap-3">
        <p className="text-h3 text-primary tabular-nums">
          {COUNT_FORMAT.format(owned)} / {COUNT_FORMAT.format(total)}
        </p>
        {/* El color lo pone el consumidor, no el `Money` (§8.15). */}
        <p className="text-positive">
          <Money usd={valueUsd} size="md" />
        </p>
      </div>

      <Progress
        value={percent ?? 0}
        size="md"
        tone="positive"
        label={
          percent === null
            ? `${name}: total desconocido`
            : `${name}: ${PERCENT_FORMAT.format(percent)} por ciento completado`
        }
      />

      <p className="text-caption text-tertiary">
        {percent === null
          ? 'No sabemos cuántas cartas tiene este set.'
          : `${PERCENT_FORMAT.format(percent)}% · te faltan ${COUNT_FORMAT.format(missingCount)} ${pluralize(missingCount, 'carta', 'cartas')} · ${COUNT_FORMAT.format(duplicateCards)} ${pluralize(duplicateCards, 'duplicada', 'duplicadas')}`}
      </p>
    </Surface>
  );
}

interface BinderSlotCellProps {
  slot: BinderSlot;
  onOpen: (item: CollectionItemDto) => void;
  onAdd: (cardId: string) => void;
}

/**
 * Un slot del binder, y **memoizado**.
 *
 * El memo no es una optimización menor acá: cambiar de chip recorta y reordena
 * la lista, y sin memo los slots que ya estaban pintados se vuelven a renderizar
 * (con su `next/image` y su control) para un cambio que no los toca. Con memo
 * solo se reconcilian los que entran y los que salen, y el `slot` es estable
 * porque `buildBinderSlots` está memoizado arriba: React compara la referencia y
 * el `CardTile` no se vuelve a dibujar.
 *
 * El botón de administrar **es** el tile: `onSelect` lo convierte en un
 * `<button>` que abre el `ItemSheet`, y no hay `IconButton` de engranaje
 * dibujado encima. Antes lo había, y hacía dos cosas malas: obligaba a apuntar
 * a un ícono de 20 px en vez de a la carta, y la referencia de diseño no lo
 * tiene. El link a la ficha no se pierde: vive en `/buscar` y en
 * `/carta/[id]`, que es donde tocar una carta significa ir a la ficha.
 *
 * El destructuring de `slot.item` en una constante no es estilo: sin él, el
 * estrechamiento de tipo se pierde adentro del closure del `onSelect` y
 * reinstalar el `as` es justo lo que la regla 9 prohíbe.
 */
const BinderSlotCell = memo(function BinderSlotCell({ slot, onOpen, onAdd }: BinderSlotCellProps) {
  const { card, item, isDuplicate, quantity } = slot;

  if (!item) {
    return (
      <div className="flex flex-col">
        <button
          type="button"
          onClick={() => onAdd(card.id)}
          title={card.name}
          aria-label={`Añadir ${card.name} (${card.number}) a la colección`}
          className={cn(
            'flex aspect-[63/88] w-full items-center justify-center rounded-surface px-1',
            // El slot vacío es la pieza clave del binder: misma caja que la
            // carta que tenés, pero punteada, con el número de carta adentro.
            //
            // `dark:border-line-strong` y no `border-line`: `line` es
            // `#2a2a33` sobre un canvas de `#1d1d24`, o sea 1,3:1 — muy por
            // debajo del 3:1 que §2.4 exige. No es el límite estricto de un
            // control (el slot es un destino, no un campo) y aun así se veía
            // mal: en dark el hueco de la grilla se leía como parte del canvas
            // y no como un lugar donde la carta falta.
            'border-2 border-dashed border-line dark:border-line-strong bg-surface-2',
            'transition-colors duration-fast ease-standard hover:border-line-strong',
            'focus-visible:ring-2 focus-visible:ring-brand/20 dark:focus-visible:ring-brand/40',
          )}
        >
          <span className="text-center text-caption text-tertiary tabular-nums">
            {card.number}
          </span>
        </button>
        {/*
          El hueco de 40 px que deja la fila de acción de los slots llenos. Sin
          él la grilla quedaría con filas de dos alturas distintas según la fila
          tenga un set lleno o no.
        */}
        <div className="mt-1.5 h-10 shrink-0" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <CardTile
        card={card}
        variant="collection"
        sizes={BINDER_SIZES}
        onSelect={() => onOpen(item)}
        action={
          <div className="flex w-full items-center justify-start gap-1">
            {isDuplicate ? (
              <Badge
                tone="positive"
                className="px-1.5 tabular-nums"
                aria-label={`${quantity} copias`}
              >
                x{quantity}
              </Badge>
            ) : (
              // Con una sola copia, la fila muestra para qué variante la
              // compraste. La tabla de labels es la de `lib/variants.ts`
              // (§9.5), no una escrita acá.
              <span
                className="truncate text-overline text-tertiary"
                title={variantShort(item.variant)}
              >
                {variantShort(item.variant)}
              </span>
            )}
          </div>
        }
      />
    </div>
  );
});
