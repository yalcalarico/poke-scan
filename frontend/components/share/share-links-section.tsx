'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link2, Plus } from 'lucide-react';

import { ShareLinkCard } from '@/components/share/share-link-card';
import { countActiveShareLinks, nextShareExpirationDelay } from '@/components/share/share-link-status';
import {
  EMPTY_LINK_OVERLAY,
  markShareLinkInactive,
  patchShareLink,
  prependShareLink,
  visibleShareLinks,
} from '@/components/share/share-links-state';
import { ShareLinkCreator } from '@/components/share/share-link-creator';
import { SettingsSection } from '@/components/settings/settings-section';
import { Button, EmptyState, ErrorState, Skeleton, Surface } from '@/components/ui';
import { useAsync } from '@/hooks/use-async';
import { useAuth } from '@/hooks/use-auth';
import { listShareLinks, type ShareLink } from '@/lib/api/share';
import { pluralize } from '@/lib/format';

/** El estado privado se reinicia al cambiar de cuenta para no mezclar enlaces. */
export function ShareLinksSection() {
  const { user, isAuthenticated } = useAuth();
  return <ShareLinksForAccount key={isAuthenticated ? user?.id : 'no-session'} />;
}

function ShareLinksForAccount() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const [overlay, setOverlay] = useState(EMPTY_LINK_OVERLAY);

  const { status, data, error, reload } = useAsync(
    async () => isAuthenticated ? listShareLinks() : [],
    [isAuthenticated],
  );

  const base: readonly ShareLink[] = useMemo(
    () => (Array.isArray(data) ? data : []),
    [data],
  );

  const links: readonly ShareLink[] = useMemo(
    () => visibleShareLinks(base, overlay),
    [base, overlay],
  );

  const isLoading = isAuthLoading || (isAuthenticated && status === 'loading');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const delay = nextShareExpirationDelay(links);
    if (delay === null) return;
    const timer = setTimeout(() => setNow(Date.now()), delay);
    return () => clearTimeout(timer);
  }, [links, now]);
  const activeCount = countActiveShareLinks(links);

  const handleCreated = useCallback((link: ShareLink) => {
    setOverlay((current) => prependShareLink(current, link));
  }, []);

  const handleUpdated = useCallback((updated: ShareLink) => {
    setOverlay((current) => patchShareLink(current, updated));
  }, []);

  const handleDeactivated = useCallback(
    (id: string) => {
      setOverlay((current) => markShareLinkInactive(base, current, id));
    },
    [base],
  );

  return (
    <SettingsSection
      title="Enlaces compartidos"
      description="Generá un link público para que otros vean tus cartas. Podés apagarlo y volver a activarlo mientras no haya vencido."
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
          action={<Button disabled={!isAuthenticated} onClick={() => setIsCreatorOpen(true)}>Crear enlace</Button>}
        />
      ) : null}

      {!isLoading && status === 'ready' && links.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {links.map((link) => (
            <li key={link.id}>
              <ShareLinkCard
                link={link}
                onUpdated={handleUpdated}
                onDeactivated={handleDeactivated}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {/* La aclaración permanece visible junto a la lista y no depende del color del estado. */}
      <Surface className="bg-surface-2 shadow-none">
        <p className="text-caption text-secondary">
          Desactivar y revocar dejan el enlace apagado; mientras no haya vencido, podés volver a
          activarlo. Cuando vence, deja de abrirse y podés crear otro enlace. Ninguna de estas
          acciones borra páginas ya abiertas, capturas ni copias guardadas por otras personas.
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
