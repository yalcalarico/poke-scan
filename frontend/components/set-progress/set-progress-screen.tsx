'use client';

import { ListFilter, Lock } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

import { ScreenContainer } from '@/components/layout/screen-container';
import { ScreenHeader } from '@/components/layout/screen-header';
import { BinderView } from '@/components/set-progress/binder-view';
import { SetProgressList } from '@/components/set-progress/set-progress-list';
import { SetProgressFallbackBody } from '@/components/set-progress/set-progress-skeleton';
import {
  SET_PROGRESS_SOURCE,
  type BinderSnapshot,
  type SetProgressSnapshot,
} from '@/components/set-progress/set-progress-source';
import { Alert, buttonVariants, EmptyState, ErrorState, IconButton } from '@/components/ui';
import { useAsync } from '@/hooks/use-async';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/cn';

/**
 * El valor "no hay set seleccionado".
 *
 * `useAsync` no tiene `enabled` y los hooks no se pueden llamar condicionalmente.
 * El objeto vacío permite mantener el hook montado sin pedir datos cuando no hay
 * sesión o todavía no se eligió un set.
 */
const EMPTY_BINDER: BinderSnapshot = {
  setId: '',
  set: null,
  cards: [],
  items: [],
  total: 0,
  valueUsd: 0,
  missingCount: 0,
  duplicateCards: 0,
};

/**
 * `/colecciones/[id]/sets` — el progreso por set y el binder.
 *
 * ## Dos vistas en una sola ruta
 *
 * `?set=<setId>` abre el binder de ese set; sin el parámetro, la lista de
 * progreso. Es la misma ruta y no dos por una razón concreta: el criterio de
 * aceptación del plan pide que **la URL del filtro sea compartible y sobreviva a
 * un refresh**, y un link a `/colecciones/x/sets?set=swsh4` tiene que abrir el
 * binder. Con dos rutas haría falta un redirect para que ese link funcione.
 *
 * ## El `ScreenHeader` va adentro del componente
 *
 * Porque el título depende de la vista: "Progreso por set" en la lista y el
 * nombre del set en el binder. El nombre del set solo existe en el cliente (viene
 * de `GET /api/sets`), y traerlo en el server para las dos vistas sería un fetch
 * extra del mismo payload.
 *
 * ## Los datos se piden solo con sesión
 *
 * El progreso se pide aunque estemos en el binder. Son 3 lecturas de Postgres
 * (no llamadas a pokemontcg.io, `AGENTS.md` §3.1) y es lo que hace que volver
 * a la lista sea instantáneo en vez de mostrar un skeleton de nuevo. Sin sesión,
 * ambos hooks resuelven localmente y no mandan requests privados que terminarían
 * en 401.
 */
export function SetProgressScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ id: string }>();
  const { isLoading: isAuthLoading, isAuthenticated } = useAuth();

  const collectionId = params.id;
  const setId = searchParams.get('set') ?? '';
  const listHref = `/colecciones/${encodeURIComponent(collectionId)}`;
  const setsHref = `${listHref}/sets`;

  const progress = useAsync<SetProgressSnapshot | null>(
    (signal) =>
      isAuthLoading || !isAuthenticated
        ? Promise.resolve(null)
        : SET_PROGRESS_SOURCE.getProgress(collectionId, signal),
    [collectionId, isAuthLoading, isAuthenticated],
  );

  const binder = useAsync(
    (signal) =>
      isAuthLoading || !isAuthenticated || setId === ''
        ? Promise.resolve(EMPTY_BINDER)
        : SET_PROGRESS_SOURCE.getBinder(collectionId, setId, signal),
    [collectionId, setId, isAuthLoading, isAuthenticated],
  );

  const openSet = useCallback(
    (nextSetId: string) => {
      // `scroll: false` porque cambiar de vista no es "ir a otra página": el
      // binder arranca arriba, y un scroll suave desde el final de una lista de
      // 176 sets se lee como un glitch.
      router.push(`${setsHref}?set=${encodeURIComponent(nextSetId)}`, { scroll: false });
    },
    [router, setsHref],
  );

  /**
   * La colección filtrada por el set. Va en el `(☰)` del binder y no en el tap
   * de la tarjeta, porque el tap tiene que abrir el binder: es la vista que esta
   * ruta no tenía y la que el diseño pone primero.
   *
   * El parámetro es `setId`, que es como lo llama `ListItemsDto` y como ya lo
   * usa `/buscar?setId=`. Ese parámetro es el contrato de `/colecciones/[id]`.
   */
  const openFilteredCollection = useCallback(() => {
    router.push(`${listHref}?setId=${encodeURIComponent(setId)}`);
  }, [listHref, router, setId]);

  /**
   * Después de agregar, editar o borrar hay que volver a pedir **las dos** cosas:
   * el binder que se está mirando y el progreso, que es lo que el usuario ve si
   * vuelve a la lista. Como las dos vistas comparten componente, recargar solo
   * el binder dejaría la Vista 1 con los números de antes y recargar solo el
   * progreso no cambiaría el binder.
   */
  const refresh = useCallback(() => {
    binder.reload();
    progress.reload();
  }, [binder, progress]);

  const isBinder = setId !== '';

  return (
    <>
      <ScreenHeader
        title={isBinder ? (binder.data?.set?.name ?? 'Binder') : 'Progreso por set'}
        subtitle={isBinder ? (binder.data?.set?.series ?? undefined) : undefined}
        back={
          isBinder ? { href: setsHref, label: 'el progreso por set' } : { href: listHref, label: 'la colección' }
        }
        action={
          isBinder ? (
            <IconButton
              icon={ListFilter}
              label="Ver la colección de este set"
              onClick={openFilteredCollection}
            />
          ) : undefined
        }
      />

      <ScreenContainer>
        {/*
          Sin sesión, esta pantalla no tiene nada que mostrar: el progreso por set
          es de una colección, y las colecciones son de una cuenta.

          Antes no se chequeaba y la request fallaba con 401, con lo que la
          pantalla mostraba "No pudimos cargar el progreso" y un botón de
          "Reintentar" que no iba a cambiar nada. Decir "iniciá sesión" no es
          comunicación: es el único mensaje que corresponde a un 401, y la
          diferencia es que uno ofrece la salida y el otro la esconde.
        */}
        {!isAuthLoading && !isAuthenticated ? (
          <EmptyState
            kind="first-use"
            icon={Lock}
            title="Iniciá sesión para ver el progreso"
            description="El progreso por set se calcula sobre tu colección, y las colecciones viven en tu cuenta."
            action={
              <Link
                href="/login"
                className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'px-5')}
              >
                Iniciar sesión
              </Link>
            }
          />
        ) : isBinder ? (
          <BinderStates
            status={binder.status}
            error={binder.error}
            snapshot={binder.data}
            collectionId={collectionId}
            onRetry={binder.reload}
            onChanged={refresh}
          />
        ) : (
          <ProgressStates
            status={progress.status}
            error={progress.error}
            snapshot={progress.data}
            onRetry={progress.reload}
            onSelectSet={openSet}
          />
        )}
      </ScreenContainer>
    </>
  );
}

type AsyncStatus = 'loading' | 'ready' | 'error';

interface BinderStatesProps {
  status: AsyncStatus;
  error: string | null;
  snapshot: BinderSnapshot | null;
  /** Sale de la URL: es la colección que el binder tiene que usar al agregar. */
  collectionId: string;
  onRetry: () => void;
  onChanged: () => void;
}

/** Los cinco estados de §9.1 para el binder, en orden de código. */
function BinderStates({
  status,
  error,
  snapshot,
  collectionId,
  onRetry,
  onChanged,
}: BinderStatesProps) {
  // 1 · loading
  if (status === 'loading') return <SetProgressFallbackBody />;

  // 2 · error
  if (status === 'error') {
    return (
      <ErrorState
        title="No pudimos cargar el set"
        message={error ?? undefined}
        onRetry={onRetry}
      />
    );
  }

  // 5 · ready. El binder no tiene estado parcial: el total sale de contar las
  // cartas que vinieron, no de lo que declare la fuente.
  if (!snapshot) return <SetProgressFallbackBody />;

  return <BinderView collectionId={collectionId} snapshot={snapshot} onChanged={onChanged} />;
}

interface ProgressStatesProps {
  status: AsyncStatus;
  error: string | null;
  snapshot: SetProgressSnapshot | null;
  onRetry: () => void;
  onSelectSet: (setId: string) => void;
}

/** Los cinco estados de §9.1 para la lista, en orden de código. */
function ProgressStates({ status, error, snapshot, onRetry, onSelectSet }: ProgressStatesProps) {
  if (status === 'loading') return <SetProgressFallbackBody />;

  if (status === 'error') {
    return (
      <ErrorState
        title="No pudimos cargar el progreso"
        message={error ?? undefined}
        onRetry={onRetry}
      />
    );
  }

  if (!snapshot) return <SetProgressFallbackBody />;

  return (
    <div className="flex flex-col gap-4">
      {/* 4 · parcial: el contenido se muestra igual y los huecos se dicen. */}
      <PartialNotices snapshot={snapshot} />
      {/* 3 · vacío vive adentro de la lista: sin items la pantalla se explica
          con un `EmptyState kind="first-use"` y abajo siguen las sugerencias. */}
      <SetProgressList snapshot={snapshot} onSelectSet={onSelectSet} />
    </div>
  );
}

/**
 * Los tres "no sabemos" de la Vista 1, en un solo `Alert`.
 *
 * Todos son `warning` y no `error` (§2.3): el usuario puede igual hacer lo que
 * quería —mirar su progreso, abrir un binder— y la pantalla no está rota. Los
 * tres juntos en un `Alert` y no tres apilados, porque un aviso que se puede
 * resolver leyendo dos renglones no necesita tres cajas.
 */
function PartialNotices({ snapshot }: { snapshot: SetProgressSnapshot }) {
  const { setsWithoutTotal, orphanSets, stats } = snapshot;

  const lines: string[] = [];
  if (setsWithoutTotal > 0) {
    lines.push(
      `${setsWithoutTotal} ${
        setsWithoutTotal === 1 ? 'set no declara' : 'sets no declaran'
      } cuántas cartas tienen, así que no podemos calcular su porcentaje.`,
    );
  }
  if (stats.cardsMissingPrice > 0) {
    lines.push(
      `${stats.cardsMissingPrice} ${
        stats.cardsMissingPrice === 1 ? 'carta está' : 'cartas están'
      } sin precio: cuentan como $0 hasta que se actualice.`,
    );
  }
  if (orphanSets > 0) {
    lines.push(
      `${orphanSets} ${
        orphanSets === 1 ? 'carta apunta' : 'cartas apuntan'
      } a un set que no está en el catálogo.`,
    );
  }

  if (lines.length === 0) return null;

  return (
    <Alert tone="warning" size="sm" title="Faltan algunos datos">
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </Alert>
  );
}
