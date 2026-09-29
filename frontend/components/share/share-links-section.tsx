'use client';

import { useCallback, useMemo, useState } from 'react';
import { Link2, Plus } from 'lucide-react';

import { ShareLinkCard } from '@/components/share/share-link-card';
import { ShareLinkCreator } from '@/components/share/share-link-creator';
import { SettingsSection } from '@/components/settings/settings-section';
import { Button, EmptyState, ErrorState, Skeleton, Surface } from '@/components/ui';
import { useAsync } from '@/hooks/use-async';
import { useAuth } from '@/hooks/use-auth';
import { listShareLinks, type ShareLink } from '@/lib/api/share';
import { pluralize } from '@/lib/format';

/**
 * Los cambios locales que todavía no llegaron en la respuesta del server.
 *
 * Sin esto, activar o desactivar un enlacellamaría a `reload()` y la lista
 * entera se volvería skeleton mientras va y vuelve el request: un parpadeo de
 * 200 ms por cada toggle, en una pantalla donde el usuario está mirando
 * precisamente ese botón. `useAsync` no tiene update optimista, así que el
 * parche vive acá, en un solo lugar.
 */
interface LinkOverlay {
  /** Creados en esta sesión: todavía no están en la respuesta del server. */
  prepended: readonly ShareLink[];
  /** Activar / desactivar / revocar, por id. */
  patched: ReadonlyMap<string, ShareLink>;
}

const EMPTY_OVERLAY: LinkOverlay = { prepended: [], patched: new Map() };

/**
 * Los enlaces públicos del usuario, con su estado y sus acciones.
 *
 * Referencia histórica: la sección anterior tenía el patrón "inline status +
 * `reloadToken`" (6 pantallas lo usaban) y un error pintado a mano con clases de
 * `rose`. Acá los datos entran por `useAsync` (§9.1) y el error sale por
 * `ErrorState`.
 */
export function ShareLinksSection() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const [overlay, setOverlay] = useState<LinkOverlay>(EMPTY_OVERLAY);

  /**
   * Los ids que el usuario revocó en esta sesión.
   *
   * Es la única memoria que hay de "esto fue revocado y no desactivado": el
   * backend usa la misma columna `isActive` para las dos cosas y `ShareLinkDto`
   * no trae la diferencia. Ver la nota de `share-link-status.ts`. Cuando el
   * backend exponga `revokedAt`, esto se borra y pasa a leerse del DTO.
   */
  const [revokedIds, setRevokedIds] = useState<ReadonlySet<string>>(() => new Set<string>());

  const { status, data, error, reload } = useAsync(
    async () => listShareLinks(),
    [isAuthenticated],
  );

  const base: readonly ShareLink[] = useMemo(
    () => (Array.isArray(data) ? data : []),
    [data],
  );

  const links: readonly ShareLink[] = useMemo(
    () => [...overlay.prepended, ...base.map((link) => overlay.patched.get(link.id) ?? link)],
    [base, overlay],
  );

  const isLoading = isAuthLoading || (isAuthenticated && status === 'loading');
  const activeCount = links.filter((link) => link.isActive).length;

  const handleCreated = useCallback((link: ShareLink) => {
    setOverlay((current) => ({
      ...current,
      prepended: [link, ...current.prepended.filter((entry) => entry.id !== link.id)],
    }));
  }, []);

  const handleUpdated = useCallback((updated: ShareLink) => {
    // Un link que se acaba de activar no puede seguir marcado como revocado.
    setRevokedIds((current) => {
      if (!current.has(updated.id)) return current;
      const next = new Set(current);
      next.delete(updated.id);
      return next;
    });
    setOverlay((current) => ({
      ...current,
      patched: new Map(current.patched).set(updated.id, updated),
    }));
  }, []);

  const handleRevoked = useCallback(
    (id: string) => {
      setRevokedIds((current) => new Set(current).add(id));
      setOverlay((current) => {
        // El `DELETE` no devuelve nada, así que el `isActive: false` lo pone el
        // cliente; si no, el chip seguiría diciendo "Activo" hasta el próximo load.
        const source =
          current.prepended.find((link) => link.id === id) ?? base.find((link) => link.id === id);
        if (!source) return current;
        return { ...current, patched: new Map(current.patched).set(id, { ...source, isActive: false }) };
      });
    },
    [base],
  );

  return (
    <SettingsSection
      title="Enlaces compartidos"
      description="Generá un link público para que otros vean tus cartas. Después podés apagarlo o revocar del todo."
      action={
        <Button onClick={() => setIsCreatorOpen(true)} disabled={!isAuthenticated}>
          <Plus aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-4 w-4" />
          Crear enlace
        </Button>
      }
    >
      {status === 'ready' && links.length > 0 ? (
        <p className="text-caption text-tertiary">
          {links.length} {pluralize(links.length, 'enlace creado', 'enlaces creados')} · {activeCount}{' '}
          {pluralize(activeCount, 'activo', 'activos')}
        </p>
      ) : null}

      {isLoading ? (
        <div role="status" aria-label="Cargando tus enlaces" className="flex flex-col gap-3">
          <Skeleton variant="block" className="h-44" />
          <Skeleton variant="block" className="h-44" />
        </div>
      ) : null}

      {!isLoading && status === 'error' ? (
        <ErrorState
          title="No pudimos cargar tus enlaces"
          message={error ?? undefined}
          onRetry={reload}
        />
      ) : null}

      {!isLoading && status === 'ready' && links.length === 0 ? (
        <EmptyState
          size="sm"
          icon={Link2}
          title="Todavía no compartiste tu colección"
          description="Creá un enlace y mandalo por donde quieras: cualquiera que lo tenga ve tus cartas sin crear una cuenta."
          action={<Button onClick={() => setIsCreatorOpen(true)}>Crear enlace</Button>}
        />
      ) : null}

      {!isLoading && status === 'ready' && links.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {links.map((link) => (
            <li key={link.id}>
              <ShareLinkCard
                link={link}
                revoked={revokedIds.has(link.id)}
                onUpdated={handleUpdated}
                onRevoked={handleRevoked}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {/*
        `Surface` sin sombra y sobre `bg-surface-2`: es una aclaración, no una
        tarjeta más, y va al final porque es la referencia, no una acción. Es el
        lugar donde se explica la diferencia entre desactivar y revocar, que es
        justo lo que el usuario no puede deducir del color de un chip.
      */}
      <Surface className="bg-surface-2 shadow-none">
        <p className="text-caption text-secondary">
          <span className="text-body-strong text-primary">Desactivar</span> apaga el link y lo podés
          volver a prender. <span className="text-body-strong text-primary">Revocar</span> lo mata
          para siempre: si lo necesitás de nuevo, creás otro.
        </p>
      </Surface>

      <ShareLinkCreator
        open={isCreatorOpen}
        onClose={() => setIsCreatorOpen(false)}
        onCreated={handleCreated}
      />
    </SettingsSection>
  );
}
