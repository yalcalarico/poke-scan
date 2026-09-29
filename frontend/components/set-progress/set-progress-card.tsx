'use client';

import { HelpCircle } from 'lucide-react';

import { Money } from '@/components/cards/money';
import { SetSymbol } from '@/components/cards/set-media';
import { Badge, Progress, Surface } from '@/components/ui';
import { cn } from '@/lib/cn';
import { pluralize } from '@/lib/format';

import { progressPercent, type SetProgressEntry } from './set-progress-source';

/**
 * Los tres estados de un set en esta pantalla. Son variantes y no tres
 * componentes (§0.4): la forma es la misma, lo que cambia es el dato que se
 * está contando.
 *
 * - `owned`: tenés cartas del set. Barra `positive` y valor.
 * - `suggested`: el set existe y no tenés ninguna carta. Va en su propia
 *   sección y se dibuja **atenuado**: barra `neutral` (gris, vacía), sin valor
 *   y con las faltantes a la vista. Es lo que vuelve accionable la sección.
 * - `orphan`: un item de tu colección apunta a un `setId` que no está en
 *   `/api/sets`. No debería pasar (hay foreign key), pero si pasa se muestra
 *   igual, con el `setId` como título y sin acción: esconder la fila sería
 *   esconder una carta que el usuario tiene.
 */
export type SetProgressVariant = 'owned' | 'suggested' | 'orphan';

export interface SetProgressCardProps {
  entry: SetProgressEntry;
  variant?: SetProgressVariant;
  /** Tap en la tarjeta. Sin esto (o en `orphan`) no es pulsable. */
  onSelect?: (setId: string) => void;
  className?: string;
}

const PERCENT_FORMAT = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

/**
 * Una fila de la Vista 1: símbolo, nombre, cuántas cartas tenés y cuánto vale.
 *
 * ## El símbolo del set
 *
 * `SetDto.symbolUrl` es un campo del contrato que casi no se usaba. Sale de
 * `components/cards/set-media.tsx` y no se reimplementa acá a propósito: ese
 * archivo tiene el allowlist de hosts de
 * `next.config.ts` —`next/image` **lanza** si el host no está en
 * `remotePatterns`, y eso en el server es un error de render, no un 404— y
 * duplicarlo sería un tercer lugar que hay que tocar cada vez que se agrega un
 * host.
 *
 * ## Por qué es un `<button>` y no un `Link`
 *
 * Porque el destino lo elige quien la usa (hoy el binder, más adelante la
 * colección filtrada) y la navegación pasa por `router.push` con
 * la URL como fuente de verdad (§11: si cambia la URL, es un link; si no
 * cambia, es un control).
 *
 * ## El `Progress` adentro del botón
 *
 * Un `role="progressbar"` dentro de un `<button>` es HTML válido: el botón da
 * el nombre (el texto que tiene adentro) y la barra agrega el porcentaje, que
 * es el dato que la `Progress` tiene que dar. La `Progress` además lleva
 * `hideValue` implícito en su `aria-valuetext`, así que no duplica.
 */
export function SetProgressCard({
  entry,
  variant = 'owned',
  onSelect,
  className,
}: SetProgressCardProps) {
  const percent = progressPercent(entry);
  const name = entry.set?.name ?? entry.setId;
  const isOrphan = variant === 'orphan';
  const isSuggested = variant === 'suggested';
  // Un set que no está en el catálogo no se puede abrir: no hay binder, no hay
  // colección filtrada. Es el único caso sin acción, y por eso el `<button>` se
  // decide acá y no en el `if` del final.
  const interactive = !isOrphan && typeof onSelect === 'function';

  return (
    <button
      type="button"
      onClick={() => onSelect?.(entry.setId)}
      disabled={!interactive}
      className={cn(
        'block w-full rounded-surface text-left',
        'focus-visible:ring-2 focus-visible:ring-brand/20 dark:focus-visible:ring-brand/40',
        'disabled:pointer-events-none',
        className,
      )}
    >
      <Surface interactive={interactive} className="p-3">
        <div className="flex flex-col">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-control bg-surface-2">
              <SetSymbol
                symbolUrl={entry.set?.symbolUrl ?? null}
                name={name}
                className="h-6 w-6"
              />
            </span>

            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'truncate text-body-strong',
                  isOrphan ? 'text-secondary' : 'text-primary',
                )}
                title={name}
              >
                {name}
              </p>
              {entry.set?.series ? (
                <p className="truncate text-caption text-tertiary" title={entry.set.series}>
                  {entry.set.series}
                </p>
              ) : null}
            </div>

            {isOrphan ? (
              <Badge tone="warning">Set desconocido</Badge>
            ) : percent === null ? (
              <Badge tone="warning">Total desconocido</Badge>
            ) : (
              <p
                className={cn(
                  'shrink-0 text-h3 tabular-nums',
                  isSuggested ? 'text-tertiary' : 'text-primary',
                )}
              >
                {PERCENT_FORMAT.format(percent)}%
              </p>
            )}
          </div>

          <p
            className={cn(
              'mt-3 text-label tabular-nums',
              isSuggested || isOrphan ? 'text-tertiary' : 'text-secondary',
            )}
          >
            {entry.owned} / {entry.total ?? '—'}
            {percent === null ? <span className="sr-only">, total desconocido</span> : null}
          </p>

          {/*
            La barra va siempre, incluso con 0: una fila que aparece y desaparece
            según el dato hace saltar la tarjeta entera. Con 0 % el relleno no se
            ve y el track gris sí, que es exactamente lo que tiene que decir
            "todavía no empezaste".
          */}
          <Progress
            className="mt-2"
            value={percent ?? 0}
            size="sm"
            tone={isSuggested || isOrphan ? 'neutral' : 'positive'}
            label={
              percent === null
                ? `${name}: total desconocido`
                : `${name}: ${PERCENT_FORMAT.format(percent)} por ciento completado`
            }
          />

          {isSuggested || isOrphan ? (
            <p className="mt-2 flex items-center gap-1.5 text-caption text-secondary">
              {isOrphan ? (
                <>
                  <HelpCircle
                    aria-hidden="true"
                    focusable="false"
                    strokeWidth={1.75}
                    className="h-3.5 w-3.5 shrink-0"
                  />
                  No lo encontramos en el catálogo de sets
                </>
              ) : entry.missingCount !== null && entry.missingCount > 0 ? (
                <>
                  Te faltan {entry.missingCount}{' '}
                  {pluralize(entry.missingCount, 'carta', 'cartas')}
                </>
              ) : (
                'No te falta ninguna'
              )}
            </p>
          ) : (
            /*
              El `text-positive` va en el `<p>` y el `Money` va sin `tone`: el
              componente no decide el color (§8.15) y acá el color es plata
              (§2.3), no el tono de un precio.
            */
            <p className="mt-2 text-positive">
              <Money usd={entry.valueUsd} size="md" />
            </p>
          )}
        </div>
      </Surface>
    </button>
  );
}
