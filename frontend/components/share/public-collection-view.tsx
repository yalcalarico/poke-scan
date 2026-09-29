import Link from 'next/link';
import { Layers, Plus, Search, Sparkles } from 'lucide-react';

import { InstallCta } from '@/components/share/install-cta';
import { PublicCardGrid } from '@/components/share/public-card-grid';
import { Alert, Avatar, EmptyState, Stat, StatGrid, buttonVariants } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDate, formatPrice, pluralize } from '@/lib/format';
import type { PublicSharedCollection } from '@/lib/api/share';
import type { CollectionStatsDto } from '@/types/api';

/**
 * Máximo de ítems que el backend manda en `/s/:slug`. Está duplicado del
 * backend a propósito: la constante `MAX_PUBLIC_ITEMS` de `share.service.ts` no
 * es exportable por el contrato, y el aviso del banner necesita el número para
 * decir "acá hay 500 de 700", no "hay más".
 */
export const MAX_PUBLIC_ITEMS = 500;

export interface PublicCollectionViewProps {
  data: PublicSharedCollection;
}

function CollectionSummary({ stats }: { stats: CollectionStatsDto }) {
  return (
    <StatGrid columns={5}>
      <Stat label="Cartas" value={stats.totalCards} />
      <Stat label="Únicas" value={stats.uniqueCards} />
      <Stat label="Duplicadas" value={stats.duplicateCards} />
      <Stat label="Sets" value={stats.setsCount} />
      <Stat label="Valor total" value={formatPrice(stats.totalValueUsd, 'USD')} tone="positive" />
    </StatGrid>
  );
}

/**
 * La landing pública. Server Component: no tiene estado y todo lo que muestra
 * viene del `fetch` de `page.tsx`.
 *
 * **El precio se formatea en USD siempre**, aunque el visitante tenga la
 * preferencia en ARS: `useCurrency()` es un client component y la conversión se
 * hace en el cliente, así que meterlo acá obligaría a la página entera a ser
 * client y a perder el `revalidate` de 60 s. Un valor que se calcula en el
 * servidor y se cachea es un valor en la moneda de referencia del catálogo; el
 * `Stat` lo declara y no promete otra cosa.
 */
export function PublicCollectionView({ data }: PublicCollectionViewProps) {
  const { ownerDisplayName, collectionName, items, stats, truncated, sharedAt } = data;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-surface pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6 sm:py-8">
          <div className="flex items-center gap-3">
            {/*
              `src` va sin pasar a propósito: `SharedCollectionDto` expone
              `ownerDisplayName` pero **no** `ownerAvatarUrl`, así que el
              `Avatar` cae en sus iniciales. Es el punto 15 de la lista de
              "campos del contrato sin usar" del plan: para cerrarlo hay que
              agregar `ownerAvatarUrl` a `SharedCollectionDto` (backend), y no
              es un cambio de frontend. Mientras tanto, mostrar iniciales es
              honesto; inventar un avatar o esconder el dueño no.
            */}
            <Avatar name={ownerDisplayName} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-caption text-secondary">
                Colección de <span className="text-body-strong text-primary">{ownerDisplayName}</span>
              </p>
              <h1 className="truncate text-h1 text-primary">{collectionName}</h1>
            </div>
          </div>

          <p className="flex flex-wrap items-center gap-x-2 text-caption text-tertiary">
            <span>Compartida el {formatDate(sharedAt)}</span>
            <span aria-hidden="true">·</span>
            <span>
              {stats.uniqueCards} {pluralize(stats.uniqueCards, 'carta única', 'cartas únicas')}
            </span>
          </p>
        </div>
      </header>

      <main id="contenido" className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        {/*
          `info` y no un borde suelto: es una aclaración permanente de la
          pantalla, no un estado que esté pasando. `Eye` es el ícono del tone.
        */}
        <Alert tone="info" title="Solo lectura">
          Esta colección es de {ownerDisplayName}. Podés mirarla y consultar el precio de cada
          carta, pero no podés editarla ni agregar nada.
        </Alert>

        <CollectionSummary stats={stats} />

        {/*
          `warning` y no `error` (§2.3): la lista es correcta, solo está
          incompleta. El usuario igual puede hacer lo que quería —ver las
          cartas— así que no es un problema que necesite una acción.
        */}
        {truncated ? (
          <Alert tone="warning" title="Esta colección está truncada">
            Tiene más de {MAX_PUBLIC_ITEMS} cartas: abajo van las primeras {MAX_PUBLIC_ITEMS}.
          </Alert>
        ) : null}

        <section aria-labelledby="cartas-compartidas" className="flex flex-col gap-4">
          <h2 id="cartas-compartidas" className="flex items-center gap-2 text-h2 text-primary">
            <Layers aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-5 w-5" />
            Cartas
            <span className="text-body text-tertiary tabular-nums">
              {items.length}{' '}
              {pluralize(items.length, 'carta mostrada', 'cartas mostradas')}
            </span>
          </h2>

          {/*
            El troceo vive en `PublicCardGrid`, un client component, y no acá:
            `public-collection-view.tsx` es server-safe y 500 `CardTile` en un
            Server Component se mandan como SSR completo. El wrapper solo decide
            **cuántas** se pintan; el estado vacío sigue siendo de esta pantalla
            porque es una frase sobre la colección del dueño, no sobre la
            paginación.
          */}
          {items.length === 0 ? (
            <EmptyState
              kind="no-results"
              size="sm"
              icon={Layers}
              title="Esta colección está vacía"
              description={`${ownerDisplayName} todavía no agrego cartas a esta colección.`}
            />
          ) : (
            <PublicCardGrid items={items} label={`Cartas de ${ownerDisplayName}`} />
          )}
        </section>
      </main>

      <footer className="border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-4 py-6 sm:px-6">
          <div className="flex items-center gap-2 text-caption text-tertiary">
            <Sparkles aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-4 w-4" />
            Compartido con{' '}
            <span className="text-body-strong text-primary">PokéScan</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link
              href={"/buscar"}
              className={cn(buttonVariants({ variant: 'secondary' }), 'h-10 px-4 text-label')}
            >
              <Search aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-4 w-4" />
              Ver el catálogo
            </Link>
            <Link
              href={"/registro"}
              className={cn(buttonVariants({ variant: 'primary' }), 'h-10 px-4 text-label')}
            >
              <Plus aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-4 w-4" />
              Armar mi colección
            </Link>
          </div>

          <InstallCta />
        </div>
      </footer>
    </div>
  );
}
