'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Layers, Plus, Search } from 'lucide-react';

import { ScreenContainer } from '@/components/layout/screen-container';
import { ScreenHeader } from '@/components/layout/screen-header';
import { Money } from '@/components/cards/money';
import {
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  buttonVariants,
} from '@/components/ui';
import { useAsync } from '@/hooks/use-async';
import { useAuth } from '@/hooks/use-auth';
import { listCollections } from '@/lib/api/collections';
import { pluralize } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { CollectionDto } from '@/types/api';

import { CollectionCard } from './collection-card';
import { CollectionCreateSheet } from './collection-create-sheet';
import { formatCount } from './collection-options';
import { CollectionsListSkeleton } from './collection-skeletons';

/** Grilla de §7.1: 1 col en mobile, 3 en `lg`. */
const GRID = 'grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3';

/**
 * `/colecciones` — la lista de colecciones.
 *
 * ## Por qué la pantalla entera es client
 *
 * El token vive en `sessionStorage` y el servidor no puede leerlo. Además acá el
 * chrome depende de los datos: la acción del
 * header abre el `Sheet` de alta y el contador y el total se calculan con la
 * moneda activa del usuario. Partir el header en un Server Component obligaría a
 * un contexto o a una segunda request para pasarle el nombre y el callback, que
 * es más código que el que se ahorra. `page.tsx` queda como Server Component
 * únicamente para el `metadata` y el `ScreenContainer`.
 *
 * ## Los cinco estados
 *
 * `loading` · `error` · `no autenticado` · `vacío` · `listo`, cada uno con su
 * copy (§9.1 y §10.2). "No autenticado" y "vacío" son estados distintos y no
 * pueden compartir el mismo `EmptyState`: sin sesión no hay nada que crear
 * todavía; con sesión hay que explicar para qué sirve una colección.
 *
 * ## Por qué "no autenticado" y "vacío" nombran lo que se abre
 *
 * El `EmptyState` solo tiene lugar para un título, dos líneas y un CTA, y hace
 * falta todo eso para el login. Lo que no entra ahí —el progreso por set, el
 * binder, el control de duplicadas, el orden por precio y el link público— es
 * justo lo que un visitante sin sesión, o con sesión pero sin colecciones, **no
 * puede llegar a ver**. Se dice una vez, en los dos, abajo del `EmptyState`.
 *
 * No es copy de venta: son cuatro afirmaciones verificables, en el mismo
 * registro que el resto de la pantalla.
 */
export function CollectionsScreen() {
  const { isLoading: isAuthLoading, isAuthenticated } = useAuth();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  /**
   * Las colecciones creadas en esta sesión, sobre las que trajo la API.
   *
   * Van en un estado aparte y no en el de `useAsync` a propósito: el hook es de
   * solo lectura y no expone un setter, y meter el alta en sus `deps` para
   * forzar un refetch manda la pantalla a `loading` y hace desaparecer la lista
   * un segundo. Acá la tarjeta nueva aparece de inmediato y el próximo
   * `reload` la trae del servidor.
   */
  const [created, setCreated] = useState<CollectionDto[]>([]);

  const {
    status,
    data,
    error,
    reload,
  } = useAsync(async () => {
    // Sin sesión no se pide nada: `apiFetch` interpretaría el 401 como un token
    // vencido, intentaría un refresh y haría un `window.location.assign` a
    // `/login` (`lib/api/api-client.ts`), que recarga la página y tira el estado
    // que esta pantalla acaba de construir.
    if (!isAuthenticated) return null;
    return listCollections();
  }, [isAuthenticated]);

  const collections = useMemo(() => [...created, ...(data ?? [])], [created, data]);

  const handleCreated = useCallback((collection: CollectionDto) => {
    setCreated((current) => [collection, ...current]);
  }, []);

  const totalCards = useMemo(
    () => collections.reduce((total, collection) => total + collection.itemCount, 0),
    [collections],
  );
  const totalValue = useMemo(
    () => collections.reduce((total, collection) => total + collection.totalValueUsd, 0),
    [collections],
  );

  const isLoading = isAuthLoading || (isAuthenticated && status === 'loading');

  return (
    <>
      <ScreenHeader
        title="Colecciones"
        action={
          isAuthenticated ? (
            <IconButton
              icon={Plus}
              label="Nueva colección"
              onClick={() => setIsCreateOpen(true)}
            />
          ) : null
        }
      />

      <ScreenContainer labelledBy="titulo-colecciones">
        <h1 id="titulo-colecciones" className="sr-only">
          Colecciones
        </h1>

        {/* 1 · loading */}
        {isLoading ? <CollectionsListSkeleton /> : null}

        {/* 2 · error: nunca un `EmptyState` para un error (§8.11). */}
        {isAuthenticated && status === 'error' ? (
          <ErrorState
            title="No pudimos cargar tus colecciones"
            message={error ?? undefined}
            onRetry={reload}
          />
        ) : null}

        {/* 3 · sin sesión */}
        {!isAuthLoading && !isAuthenticated ? (
          <div className="flex flex-col gap-6">
            <EmptyState
              kind="first-use"
              icon={Layers}
              title="Iniciá sesión para ver tus colecciones"
              description="Tus cartas se guardan en colecciones, y las colecciones viven en tu cuenta."
              action={
                <>
                  <Link
                    href="/login"
                    className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'px-5')}
                  >
                    Iniciar sesión
                  </Link>
                  {/*
                    El mismo segundo CTA que el estado vacío con sesión: el
                    catálogo es público y anda sin cuenta, así que alguien que
                    todavía no quiere registrarse igual tiene por dónde empezar
                    en vez de quedarse mirando un login.
                  */}
                  <Link
                    href="/buscar"
                    className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'px-5')}
                  >
                    <Search aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-5 w-5" />
                    Buscar cartas
                  </Link>
                </>
              }
            />

            <CollectionCapabilities labelledBy="que-abre-una-coleccion" label="Con una colección podés" />
          </div>
        ) : null}

        {/* 4 · vacío con sesión */}
        {isAuthenticated && status === 'ready' && collections.length === 0 ? (
          <div className="flex flex-col gap-6">
            <EmptyState
              kind="first-use"
              icon={Layers}
              title="Todavía no tenés colecciones"
              description="Creá la primera y empezá a guardar las cartas que encontrás."
              action={
                <>
                  <Button variant="primary" size="lg" onClick={() => setIsCreateOpen(true)}>
                    Crear colección
                  </Button>
                  <Link
                    href="/buscar"
                    className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'px-5')}
                  >
                    <Search aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-5 w-5" />
                    Buscar cartas
                  </Link>
                </>
              }
            />

            <CollectionCapabilities
              labelledBy="que-abre-la-coleccion"
              label="Cuando crees una, vas a poder"
            />
          </div>
        ) : null}

        {/* 5 · listo */}
        {isAuthenticated && status === 'ready' && collections.length > 0 ? (
          <div className="flex flex-col gap-4">
            {/*
              El contador va arriba de la grilla y no en el `ScreenHeader`: el
              header es chrome de una línea y trunca el título, así que el dato
              variable necesita su propia línea. `aria-live="polite"` porque
              cambia con cada alta y baja sin que la pantalla cambie.
            */}
            <p aria-live="polite" className="text-caption text-tertiary tabular-nums">
              {formatCount(collections.length)}{' '}
              {pluralize(collections.length, 'colección', 'colecciones')} ·{' '}
              {formatCount(totalCards)} {pluralize(totalCards, 'carta', 'cartas')}
            </p>

            <div className={GRID}>
              {collections.map((collection) => (
                <CollectionCard key={collection.id} collection={collection} />
              ))}
            </div>

            <p className="flex flex-wrap items-center justify-center gap-x-2 text-caption text-tertiary">
              Valor combinado
              <Money usd={totalValue} tone="positive" size="md" />
            </p>
          </div>
        ) : null}
      </ScreenContainer>

      <CollectionCreateSheet
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={handleCreated}
      />
    </>
  );
}

/**
 * Las cuatro cosas que se abren con una colección, en texto.
 *
 * ## Por qué es una lista y no parte del `description`
 *
 * Porque el `description` del `EmptyState` es de dos líneas (§10.1) y ya está
 * ocupado por el motivo de por qué hay que iniciar sesión o crear algo. Las
 * cuatro capacidades que se están agregando —el progreso por set con su
 * binder, el modo de selección, el orden por precio y el link público— son
 * cuatro afirmaciones, no una.
 *
 * ## Por qué vive solo en los dos estados sin colecciones
 *
 * Porque es la información que **no se puede ver** todavía. En el estado
 * "listo" la misma información ya está en pantalla: el link "Progreso por set"
 * de cada tarjeta, el filtro "Duplicadas", el selector "Orden" y el `Sheet` de
 * compartir. Repetirla ahí sería leer la misma pantalla dos veces.
 *
 * ## Por qué no promete más de lo que hay
 *
 * Las cuatro líneas son verificables contra el código de `/colecciones/[id]` y
 * `/colecciones/[id]/sets`. Lo que **no** está, a propósito: el filtro "para
 * intercambio" server-side, que sigue corriendo en el cliente con su `Alert` de
 * alcance, y la búsqueda por número y artista, que es de `/buscar` y no de una
 * colección. Nombrarlas acá sería prometer dos pantallas que todavía no están.
 */
const CAPABILITIES: readonly string[] = [
  'Ver cuánto completaste de cada set y abrir la página con las casillas que te faltan',
  'Marcar las duplicadas y quedarte con las que querés intercambiar',
  'Ordenar tus cartas por precio, por rareza o por número',
  'Compartir la colección con un link público',
] as const;

interface CollectionCapabilitiesProps {
  /** `id` del encabezado, que es también el que lo nombra. */
  labelledBy: string;
  /** La frase que abre la lista. Cambia según si ya hay cuenta o no. */
  label: string;
}

function CollectionCapabilities({ labelledBy, label }: CollectionCapabilitiesProps) {
  return (
    <section aria-labelledby={labelledBy} className="mx-auto flex w-full max-w-sm flex-col gap-2">
      <h2 id={labelledBy} className="text-caption text-tertiary">
        {label}
      </h2>

      <ul className="flex flex-col gap-2">
        {CAPABILITIES.map((capability) => (
          <li key={capability} className="flex items-start gap-2 text-body text-secondary">
            {/*
              `Check` es decorativo y el texto ya dice el verbo: agregarlo como
              único portador de "esto está disponible" sería WCAG 1.4.1. El `mt`
              es lo que alinea el ícono con la primera línea de un ítem que
              puede ocupar dos.
            */}
            <Check
              aria-hidden="true"
              focusable="false"
              strokeWidth={2}
              className="mt-0.5 h-4 w-4 shrink-0 text-positive"
            />
            {capability}
          </li>
        ))}
      </ul>
    </section>
  );
}
