'use client';

import { Layers, ScanLine } from 'lucide-react';
import Link from 'next/link';

import { Button, buttonVariants, EmptyState, Surface } from '@/components/ui';
import { useCurrency } from '@/hooks/use-currency';
import { cn } from '@/lib/cn';
import { pluralize } from '@/lib/format';

import { SetProgressCard, type SetProgressVariant } from './set-progress-card';
import {
  partitionSetProgress,
  type SetProgressEntry,
  type SetProgressSnapshot,
} from './set-progress-source';
import { useChunkedList } from './use-chunked-list';

const COUNT_FORMAT = new Intl.NumberFormat('es-AR');

/**
 * Cuántos sets de "Empezá por acá" se pintan antes de pedir más.
 *
 * La sección muestra **todos** los sets que no tenés (es la que convierte una
 * lista en una colección), así que son hasta 176. 176 `SetProgressCard` son
 * ~2.800 nodos —cada una es una `Surface` con borde, sombra, símbolo y barra—
 * para un viewport de 390 × 844 que muestra dos.
 *
 * 12 es el número con el que la primera tanda entra completa en la pantalla con
 * el header y la tira de totales, y el resto llega por el sentinel o por el
 * botón. Es el mismo criterio que `CATALOG_PAGE_SIZE` usa en `/buscar`.
 */
const SUGGESTED_CHUNK = 12;

export interface SetProgressListProps {
  snapshot: SetProgressSnapshot;
  onSelectSet: (setId: string) => void;
  className?: string;
}

/**
 * La Vista 1: los sets que ya tenés y los que todavía no.
 *
 * ## Por qué dos secciones y no una
 *
 * Un solo listado con los 176 sets del catálogo mezclados con los que tenés es
 * la lista gris que el diseño del plan quiere evitar: 8 filas con progreso y
 * 168 en 0 %. Separar "Empezá por acá" hace tres cosas a la vez:
 *
 * - la sección de arriba se lee como **el estado de la colección**, y son pocas
 *   filas, así que entra entera en la primera pantalla;
 * - la de abajo se lee como **una lista de metas**, ordenada por cuántas cartas
 *   faltan para completarse, con las 12 primeras paginadas;
 * - cada sección puede tener su propio tratamiento visual sin que el
 *   componente tenga una bandera de "modo": lo decide el `variant` de la tarjeta.
 *
 * ## La lista de la colección también se pagina
 *
 * Con 40 sets en la colección son 40 tarjetas, y llegan en **una** respuesta
 * (`set-progress` devuelve una fila por set, no páginas). La paginación de esta
 * pantalla es de render, no de red, y por eso la hace `useChunkedList` y no
 * `useInfiniteList`.
 */
export function SetProgressList({ snapshot, onSelectSet, className }: SetProgressListProps) {
  const { entries, stats, missingTotal } = snapshot;
  const { started, suggested } = partitionSetProgress(entries);
  /*
   * Desestructurado y no como `suggestions.visible`: el objeto que devuelve el
   * hook tiene una callback ref adentro, y el compilador de React marca el
   * objeto entero como valor de ref si se accede a sus propiedades en el
   * render (`react-hooks/refs`). Con la desestructuración cada binding se
   * analiza por separado, que es lo mismo que hace `useInfiniteList` en
   * `/buscar`.
   */
  const {
    visible: suggestedVisible,
    hasMore: hasMoreSuggested,
    showMore: showMoreSuggested,
    sentinelRef: suggestedSentinelRef,
  } = useChunkedList(suggested, SUGGESTED_CHUNK, 'suggested');
  const isEmpty = stats.totalCards === 0;

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      {isEmpty ? null : <CollectionStrip stats={stats} missingTotal={missingTotal} />}

      {isEmpty ? (
        <EmptyState
          kind="first-use"
          icon={ScanLine}
          title="Todavía no tenés cartas"
          description="Escaneá tu primera carta y acá vas a ver el progreso de cada set."
          action={
            <Link
              href={"/escanear"}
              className={cn(buttonVariants({ variant: 'primary', size: 'lg' }))}
            >
              Escanear carta
            </Link>
          }
        />
      ) : (
        <section aria-labelledby="seccion-sets" className="flex flex-col gap-3">
          <SectionHeader
            id="seccion-sets"
            title="Tus sets"
            description={`${COUNT_FORMAT.format(started.length)} ${pluralize(
              started.length,
              'set',
              'sets',
            )} con cartas, ordenados por valor.`}
          />
          <div className="flex flex-col gap-3">
            {started.map((entry) => (
              <SetProgressCard
                key={entry.setId}
                entry={entry}
                variant={variantOf(entry)}
                onSelect={onSelectSet}
              />
            ))}
          </div>
        </section>
      )}

      {suggested.length > 0 ? (
        <section aria-labelledby="seccion-empezar" className="flex flex-col gap-3">
          <SectionHeader
            id="seccion-empezar"
            title="Empezá por acá"
            description="Sets que todavía no tenés, del más cerca de completarse al más lejano."
          />

          <div className="flex flex-col gap-3">
            {suggestedVisible.map((entry) => (
              <SetProgressCard
                key={entry.setId}
                entry={entry}
                variant={variantOf(entry)}
                onSelect={onSelectSet}
              />
            ))}
          </div>

          {hasMoreSuggested ? (
            <div ref={suggestedSentinelRef} className="flex justify-center">
              {/*
                El botón y el sentinel del hook apuntan al mismo `showMore`: el
                observer adelanta 600 px y el botón es el que queda si el
                browser no tiene `IntersectionObserver`, y el que el usuario
                puede apretar a propósito. Es el scroll infinito con freno de
                mano de §8.13.
              */}
              <Button variant="secondary" size="lg" onClick={showMoreSuggested}>
                Ver más
                <span className="tabular-nums">
                  ({COUNT_FORMAT.format(suggested.length - suggestedVisible.length)})
                </span>
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

/**
 * `orphan` gana sobre las otras dos: un set que no está en el catálogo no es un
 * set empezable ni terminable, es un dato roto, y ofrecerlo como sugerencia
 * mandaría al usuario a un binder de un set que el backend no conoce.
 */
function variantOf(entry: SetProgressEntry): SetProgressVariant {
  if (!entry.set) return 'orphan';
  return entry.owned > 0 ? 'owned' : 'suggested';
}

interface SectionHeaderProps {
  id: string;
  title: string;
  description: string;
}

function SectionHeader({ id, title, description }: SectionHeaderProps) {
  return (
    <div>
      <h2 id={id} className="text-h2 text-primary">
        {title}
      </h2>
      <p className="mt-0.5 text-caption text-tertiary">{description}</p>
    </div>
  );
}

/**
 * La tira de arriba con los totales.
 *
 * Son tres números y no cuatro: el valor total de la colección ya está en el
 * `CollectionSummary` de `/colecciones/[id]`, y repetirlo sería leer la misma
 * cifra dos veces en dos pantallas contiguas. Los tres que sí aporta esta
 * pantalla son los que **solo** ella puede calcular: cuántos sets tocaste,
 * cuántas cartas tenés y cuántas te faltan sumando los denominadores de cada
 * set. `/stats` no puede dar el tercero, porque `/stats` solo mira los items.
 */
function CollectionStrip({
  stats,
  missingTotal,
}: {
  stats: SetProgressSnapshot['stats'];
  missingTotal: number;
}) {
  const { formatMoney } = useCurrency();

  return (
    <Surface as="section" className="px-4 py-3">
      <dl className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-0.5">
          <dt className="text-overline text-tertiary">Sets</dt>
          <dd className="text-h3 text-primary tabular-nums">
            {COUNT_FORMAT.format(stats.setsCount)}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-overline text-tertiary">Cartas</dt>
          <dd className="text-h3 text-primary tabular-nums">
            {COUNT_FORMAT.format(stats.totalCards)}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-overline text-tertiary">Te faltan</dt>
          <dd className="text-h3 text-secondary tabular-nums">
            {COUNT_FORMAT.format(missingTotal)}
          </dd>
        </div>
      </dl>

      <p className="mt-3 flex items-center gap-2 border-t border-line-subtle pt-3 text-caption text-tertiary">
        <Layers aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-3.5 w-3.5 shrink-0" />
        {formatMoney(stats.totalValueUsd)} en total
      </p>
    </Surface>
  );
}
