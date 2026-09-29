'use client';

import { useCallback, useState } from 'react';
import { Ban, Check, Copy, Link2 } from 'lucide-react';

import { shareLinkStatus, type ShareLinkStatus } from '@/components/share/share-link-status';
import { useCopyToClipboard } from '@/components/share/use-copy-to-clipboard';
import { useShareUrl } from '@/components/share/use-share-url';
import {
  Alert,
  Badge,
  Button,
  Sheet,
  Stat,
  StatGrid,
  Surface,
  useToast,
} from '@/components/ui';
import { ApiError } from '@/lib/api/api-client';
import { revokeShareLink, updateShareLink, type ShareLink } from '@/lib/api/share';
import { formatDate, formatRelativeTime, pluralize } from '@/lib/format';

export interface ShareLinkCardProps {
  link: ShareLink;
  /**
   * `true` cuando este enlace lo revocó el usuario en esta sesión.
   *
   * El backend no lo distingue de "desactivado" —`DELETE /share/:id` y
   * `PATCH { isActive: false }` escriben la misma columna—, así que esta es la
   * única fuente que tenemos. Ver el comentario largo de
   * `share-link-status.ts`.
   */
  revoked: boolean;
  onUpdated: (link: ShareLink) => void;
  /**
   * Solo el id: el `DELETE` no devuelve nada y el `isActive: false` lo aplica la
   * sección, que es la que tiene la copia del link en su estado.
   */
  onRevoked: (id: string) => void;
}

/**
 * Una tarjeta de enlace público, con su estado y lo que se puede hacer con él.
 *
 * La acción habilitada **depende del estado**: un enlace revocado no ofrece
 * "Activar" ni "Revocar" (ya está revocado), y uno desactivado ofrece "Activar"
 * —que es la única forma de recuperarlo— y no "recuperar", porque recuperar no es
 * una operación, es activar.
 */
export function ShareLinkCard({ link, revoked, onUpdated, onRevoked }: ShareLinkCardProps) {
  const toast = useToast();
  const shareUrl = useShareUrl();
  const copy = useCopyToClipboard();

  const [isToggling, setIsToggling] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status: ShareLinkStatus = shareLinkStatus(link, { revoked });
  const url = shareUrl(link.slug);
  const collectionLabel = link.collectionName ?? 'Todas mis colecciones';

  const handleCopy = useCallback(() => {
    void copy(url, { message: 'Enlace copiado', fallback: `No pudimos copiar. Copiá ${url} a mano.` });
  }, [copy, url]);

  const handleToggle = useCallback(async () => {
    setIsToggling(true);
    setError(null);
    try {
      const updated = await updateShareLink(link.id, { isActive: !link.isActive });
      onUpdated(updated);
      toast.success(link.isActive ? 'Enlace desactivado' : 'Enlace activado');
    } catch (caught) {
      // Sin toast: el error queda en el `Alert` de abajo, que es donde el
      // usuario está mirando (justo el botón que falló) y que no se cierra
      // solo. Un toast arriba y un aviso abajo es el mismo error dicho dos
      // veces.
      setError(
        caught instanceof ApiError ? caught.message : 'No pudimos cambiar el estado del enlace.',
      );
    } finally {
      setIsToggling(false);
    }
  }, [link.id, link.isActive, onUpdated, toast]);

  const handleRevoke = useCallback(async () => {
    setIsRevoking(true);
    setError(null);
    try {
      await revokeShareLink(link.id);
      setIsConfirmOpen(false);
      onRevoked(link.id);
      toast.success('Enlace revocado. Ya no funciona para nadie.');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No pudimos revocar este enlace.');
    } finally {
      setIsRevoking(false);
    }
  }, [link.id, onRevoked, toast]);

  return (
    <Surface
      as="article"
      aria-labelledby={`share-link-${link.id}-titulo`}
      className="flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p id={`share-link-${link.id}-titulo`} className="truncate text-body-strong text-primary">
            {collectionLabel}
          </p>
          <p className="mt-1 font-mono text-caption text-tertiary">/share/{link.slug}</p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      {/*
        `select-all` y no `truncate`: un link se copia, no se lee, y si queda
        cortado a la mitad el usuario no puede verificar a dónde apunta.
      */}
      <p className="select-all break-all rounded-control bg-surface-2 px-3 py-2 font-mono text-caption text-secondary">
        {url}
      </p>

      {/*
        El estado no se deduce del color del chip: una línea de texto dice si
        el link se puede recuperar, que es la pregunta real.
      */}
      <p className="text-caption text-secondary">{status.description}</p>

      <StatGrid columns={3}>
        <Stat label="Creado" value={formatRelativeTime(link.createdAt)} />
        <Stat
          label="Vistas"
          value={`${link.viewCount} ${pluralize(link.viewCount, 'vez', 'veces')}`}
        />
        <Stat label="Vence" value={link.expiresAt ? formatDate(link.expiresAt) : 'Nunca'} />
      </StatGrid>

      {error ? (
        <Alert tone="error" size="sm" title="No pudimos actualizar el enlace">
          {error}
        </Alert>
      ) : null}

      {status.canToggle || status.canRevoke || status.canCopy ? (
        <div className="flex flex-wrap items-center gap-2">
          {status.canCopy ? (
            <Button variant="secondary" size="sm" onClick={handleCopy}>
              <Copy aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-4 w-4" />
              Copiar
            </Button>
          ) : null}

          {status.canToggle ? (
            <Button
              variant="secondary"
              size="sm"
              loading={isToggling}
              pendingLabel={status.toggleLabel === 'Activar' ? 'Activando…' : 'Desactivando…'}
              onClick={handleToggle}
            >
              {status.toggleLabel === 'Activar' ? (
                <Check aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-4 w-4" />
              ) : null}
              {status.toggleLabel}
            </Button>
          ) : null}

          {status.canRevoke ? (
            <Button variant="destructive" size="sm" onClick={() => setIsConfirmOpen(true)}>
              <Ban aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-4 w-4" />
              Revocar
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="flex items-center gap-2 text-caption text-tertiary">
          <Link2 aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-4 w-4" />
          Este enlace no se puede volver a usar.
        </p>
      )}

      <Sheet
        open={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        title="Revocar el enlace"
        subtitle="Deja de funcionar para cualquiera que lo tenga, y no se puede recuperar."
        footer={
          <>
            <Button
              variant="destructive"
              className="flex-1"
              loading={isRevoking}
              pendingLabel="Revocando…"
              onClick={handleRevoke}
            >
              Revocar
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              disabled={isRevoking}
              onClick={() => setIsConfirmOpen(false)}
            >
              Cancelar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-body text-secondary">
            <span className="text-body-strong text-primary">{collectionLabel}</span> deja de ser
            pública. Si te mandaron el link, hay que crear uno nuevo y volver a pasarlo.
          </p>
          <p className="select-all break-all rounded-control bg-surface-2 px-3 py-2 font-mono text-caption text-secondary">
            {url}
          </p>
        </div>
      </Sheet>
    </Surface>
  );
}
