'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { Layers, Plus, Search } from 'lucide-react';

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
          <EmptyState
            kind="first-use"
            icon={Layers}
            title="Iniciá sesión para ver tus colecciones"
            description="Necesitás una sesión activa para guardar las cartas que encontrás."
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

        {/* 4 · vacío con sesión */}
        {isAuthenticated && status === 'ready' && collections.length === 0 ? (
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
                  href={"/buscar"}
                  className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'px-5')}
                >
                  <Search aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-5 w-5" />
                  Buscar cartas
                </Link>
              </>
            }
          />
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
