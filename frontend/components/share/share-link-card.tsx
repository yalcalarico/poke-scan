'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Ban, Check, Copy } from 'lucide-react';

import { nextShareExpirationDelay, shareLinkStatus, type ShareLinkStatus } from '@/components/share/share-link-status';
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
import { formatRelativeTime, pluralize } from '@/lib/format';
import { formatExpiration } from '@/components/share/share-preview';

export interface ShareLinkCardProps {
  link: ShareLink;
  onUpdated: (link: ShareLink) => void;
  /**
   * Solo el id: el `DELETE` no devuelve nada y el `isActive: false` lo aplica la
   * sección, que es la que tiene la copia del link en su estado.
   */
  onDeactivated: (id: string) => void;
}

/**
 * Una tarjeta de enlace público, con su estado y lo que se puede hacer con él.
 *
 * La fecha vencida tiene prioridad sobre `isActive`: activar no cambia la fecha
 * ni vuelve elegible un enlace cuyo plazo ya terminó.
 */
export function ShareLinkCard({ link, onUpdated, onDeactivated }: ShareLinkCardProps) {
  const toast = useToast();
  const shareUrl = useShareUrl();
  const copy = useCopyToClipboard();

  const [isToggling, setIsToggling] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const mutationInFlight = useRef(false);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const delay = nextShareExpirationDelay([link]);
    if (delay === null) return;
    const timer = setTimeout(() => setNow(Date.now()), delay);
    return () => clearTimeout(timer);
  }, [link, now]);
  const status: ShareLinkStatus = shareLinkStatus(link);
  const url = shareUrl(link.slug);
  const collectionLabel = link.collectionName ?? 'Todas mis colecciones';

  const handleCopy = useCallback(() => {
    void copy(url, { message: 'Enlace copiado', fallback: `No pudimos copiar. Copiá ${url} a mano.` });
  }, [copy, url]);

  const handleToggle = useCallback(async () => {
    if (mutationInFlight.current) return;
    if (!shareLinkStatus(link).canToggle) {
      setNow(Date.now());
      setToggleError('El enlace venció. Creá otro con una nueva fecha.');
      return;
    }
    mutationInFlight.current = true;
    setIsToggling(true);
    setToggleError(null);
    try {
      const updated = await updateShareLink(link.id, { isActive: !link.isActive });
      onUpdated(updated);
      toast.success(link.isActive ? 'Enlace desactivado' : 'Enlace activado');
    } catch (caught) {
      // Sin toast: el error queda en el `Alert` de abajo, que es donde el
      // usuario está mirando (justo el botón que falló) y que no se cierra
      // solo. Un toast arriba y un aviso abajo es el mismo error dicho dos
      // veces.
      setToggleError(
        caught instanceof ApiError ? caught.message : 'No pudimos cambiar el estado del enlace.',
      );
    } finally {
      mutationInFlight.current = false;
      setIsToggling(false);
    }
  }, [link, onUpdated, toast]);

  const handleRevoke = useCallback(async () => {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setIsRevoking(true);
    setRevokeError(null);
    try {
      await revokeShareLink(link.id);
      setIsConfirmOpen(false);
      onDeactivated(link.id);
      toast.success('Enlace desactivado. Podés volver a activarlo mientras no haya vencido.');
    } catch (caught) {
      setRevokeError(caught instanceof ApiError ? caught.message : 'No pudimos desactivar este enlace.');
    } finally {
      mutationInFlight.current = false;
      setIsRevoking(false);
    }
  }, [link.id, onDeactivated, toast]);

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
        <Stat label="Vence" value={link.expiresAt ? formatExpiration(link.expiresAt) : 'Nunca'} />
      </StatGrid>

      {toggleError ? (
        <Alert tone="error" size="sm" title="No pudimos actualizar el enlace">
          {toggleError}
        </Alert>
      ) : null}

      <p className="text-caption text-secondary">Desactivar no borra páginas ya abiertas, capturas ni copias guardadas.</p>

      {status.canToggle || status.canRevoke || status.canCopy ? (
        <div className="flex flex-wrap items-center gap-2">
          {status.canCopy ? (
            <Button variant="secondary" size="md" disabled={isToggling || isRevoking} onClick={handleCopy}>
              <Copy aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-4 w-4" />
              Copiar
            </Button>
          ) : null}

          {status.canToggle ? (
            <Button
              variant="secondary"
              size="md"
              disabled={isRevoking}
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
            <Button variant="destructive" size="md" disabled={isToggling || isRevoking} onClick={() => { setRevokeError(null); setIsConfirmOpen(true); }}>
              <Ban aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-4 w-4" />
              Revocar
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="flex items-center gap-2 text-caption text-tertiary">
          No hay acciones disponibles para este enlace.
        </p>
      )}

      <Sheet
        open={isConfirmOpen}
        onClose={() => { if (!mutationInFlight.current) setIsConfirmOpen(false); }}
        title="Desactivar el enlace"
        subtitle="Deja de abrirse para nuevas visitas; podés volver a activarlo mientras no haya vencido."
        footer={
          <>
            <Button
              variant="destructive"
              className="flex-1"
              loading={isRevoking}
              pendingLabel="Desactivando…"
              onClick={handleRevoke}
            >
              Revocar
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              disabled={isRevoking || isToggling}
              onClick={() => setIsConfirmOpen(false)}
            >
              Cancelar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-body text-secondary">
            <span className="text-body-strong text-primary">{collectionLabel}</span> dejará de
            abrirse para nuevas visitas. Desactivar y revocar tienen el mismo efecto en este enlace:
            mientras no haya vencido, podés volver a activarlo.
          </p>
          <Alert tone="neutral" size="sm" title="No se pueden borrar copias ya vistas">
            No podemos retractar páginas que ya están abiertas ni borrar capturas o copias que otras personas hayan guardado.
          </Alert>
          {revokeError ? (
            <Alert tone="error" size="sm" title="No pudimos desactivar el enlace">
              <div className="flex flex-col items-start gap-2">
                <span>{revokeError}</span>
                <Button variant="secondary" size="md" disabled={isRevoking} onClick={handleRevoke}>Reintentar</Button>
              </div>
            </Alert>
          ) : null}
          <p className="select-all break-all rounded-control bg-surface-2 px-3 py-2 font-mono text-caption text-secondary">
            {url}
          </p>
        </div>
      </Sheet>
    </Surface>
  );
}
