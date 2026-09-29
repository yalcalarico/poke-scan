'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';

import { useCopyToClipboard } from '@/components/share/use-copy-to-clipboard';
import { useShareUrl } from '@/components/share/use-share-url';
import {
  Alert,
  Button,
  ErrorState,
  Field,
  Select,
  Sheet,
  Skeleton,
  useFieldA11y,
} from '@/components/ui';
import { ApiError } from '@/lib/api/api-client';
import { listCollections } from '@/lib/api/collections';
import { createShareLink, type ShareLink } from '@/lib/api/share';
import type { CollectionDto } from '@/types/api';

/** Centinela de "compartir todo", no un `''`: un valor vacío no es un valor de `Select`. */
const ALL_COLLECTIONS = 'all';

const EXPIRATION_OPTIONS = [
  { value: 'never', label: 'Nunca' },
  { value: '7', label: '7 días' },
  { value: '30', label: '30 días' },
  { value: '90', label: '90 días' },
  { value: '365', label: '1 año' },
] as const;

type ExpirationValue = (typeof EXPIRATION_OPTIONS)[number]['value'];

type LoadState = 'loading' | 'ready' | 'error';

export interface ShareLinkCreatorProps {
  open: boolean;
  onClose: () => void;
  onCreated: (link: ShareLink) => void;
}

/**
 * Hoja de creación. Es un `Sheet` y no un modal centrado en todas las pantallas
 * (§8.9): en mobile el dedo está abajo y la hoja llega desde donde está el pulgar.
 *
 * Referencia histórica: el creator anterior usaba un modal centrado y dos
 * `<select>` nativos (uno de ellos con un `<option>` por colección, sin buscador).
 */
export function ShareLinkCreator({ open, onClose, onCreated }: ShareLinkCreatorProps) {
  const shareUrl = useShareUrl();
  const copy = useCopyToClipboard();

  const [state, setState] = useState<LoadState>('loading');
  const [collections, setCollections] = useState<readonly CollectionDto[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [collection, setCollection] = useState<string>(ALL_COLLECTIONS);
  const [expiration, setExpiration] = useState<ExpirationValue>('never');

  const [isCreating, setIsCreating] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<ShareLink | null>(null);

  const collectionField = useFieldA11y({ id: 'share-creator-collection' });
  const expirationField = useFieldA11y({ id: 'share-creator-expiration' });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;
      setState('loading');
      setLoadError(null);
      setSubmitError(null);
      setCreated(null);
      setCollection(ALL_COLLECTIONS);
      setExpiration('never');
    });

    const load = async () => {
      try {
        const data = await listCollections();
        if (cancelled) return;
        setCollections(Array.isArray(data) ? data : []);
        setState('ready');
      } catch (caught) {
        if (cancelled) return;
        setLoadError(
          caught instanceof ApiError ? caught.message : 'No pudimos cargar tus colecciones.',
        );
        setState('error');
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, reloadToken]);

  const handleSubmit = useCallback(async () => {
    setIsCreating(true);
    setSubmitError(null);
    try {
      const link = await createShareLink({
        collectionId: collection === ALL_COLLECTIONS ? undefined : collection,
        expiresInDays: expiration === 'never' ? undefined : Number(expiration),
      });
      setCreated(link);
      onCreated(link);
    } catch (caught) {
      // Igual que en la tarjeta: el error queda en el `Alert` del formulario,
      // que es donde el usuario está mirando, y el toast es para el éxito.
      setSubmitError(
        caught instanceof ApiError ? caught.message : 'No pudimos crear el enlace.',
      );
    } finally {
      setIsCreating(false);
    }
  }, [collection, expiration, onCreated]);

  const createdUrl = created ? shareUrl(created.slug) : '';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Crear enlace"
      subtitle="Cualquiera con el link puede ver la colección, sin crear una cuenta."
      footer={
        created ? (
          <Button fullWidth onClick={onClose}>
            Listo
          </Button>
        ) : state === 'ready' ? (
          <>
            <Button
              className="flex-1"
              loading={isCreating}
              pendingLabel="Creando…"
              onClick={handleSubmit}
            >
              Crear enlace
            </Button>
            <Button variant="secondary" disabled={isCreating} onClick={onClose}>
              Cancelar
            </Button>
          </>
        ) : null
      }
    >
      {created ? (
        <div className="flex flex-col gap-3">
          <Alert tone="success" title="Listo" size="sm">
            Mandalo por donde quieras. Podés desactivarlo o revocarlo cuando quieras desde Ajustes.
          </Alert>

          <p className="select-all break-all rounded-control bg-surface-2 px-3 py-2.5 font-mono text-caption text-secondary">
            {createdUrl}
          </p>

          <Button
            variant="secondary"
            fullWidth
            onClick={() =>
              void copy(createdUrl, {
                message: 'Enlace copiado',
                fallback: `No pudimos copiar. Copiá ${createdUrl} a mano.`,
              })
            }
          >
            <Copy aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-4 w-4" />
            Copiar enlace
          </Button>
        </div>
      ) : null}

      {!created && state === 'loading' ? (
        <div role="status" aria-label="Cargando tus colecciones" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Skeleton variant="text" className="w-24" />
            <Skeleton variant="block" className="h-10" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Skeleton variant="text" className="w-32" />
            <Skeleton variant="block" className="h-10" />
          </div>
        </div>
      ) : null}

      {!created && state === 'error' ? (
        <ErrorState
          title="No pudimos cargar tus colecciones"
          message={loadError ?? undefined}
          onRetry={() => setReloadToken((token) => token + 1)}
        />
      ) : null}

      {!created && state === 'ready' ? (
        <div className="flex flex-col gap-4">
          {/*
            El nombre del `Select` sale del `<label>` del `Field` por
            `aria-labelledby`, no de un `aria-label` con el mismo texto: un
            `<button>` —que es el trigger del listbox— no lo nombra un
            `<label htmlFor>`, y duplicar el texto en dos lugares es la forma
            segura de que se queden desincronizados. La descripción sí la trae
            el `Select` ahora, así que el hint "Elegí una colección o compartí
            todas." también se anuncia.
          */}
          <Field label="Colección" hint="Elegí una colección o compartí todas." {...collectionField}>
            <Select
              id={collectionField.id}
              aria-labelledby={collectionField.labelId}
              aria-describedby={collectionField.describedBy}
              value={collection}
              onChange={setCollection}
              options={[
                { value: ALL_COLLECTIONS, label: 'Todas mis colecciones' },
                ...collections.map((entry) => ({
                  value: entry.id,
                  label: entry.name,
                  description: entry.isDefault ? 'Principal' : undefined,
                })),
              ]}
            />
          </Field>

          <Field
            label="Expiración"
            hint="Si no querés que lasts para siempre, ponéle una fecha."
            {...expirationField}
          >
            <Select
              id={expirationField.id}
              aria-labelledby={expirationField.labelId}
              aria-describedby={expirationField.describedBy}
              value={expiration}
              onChange={setExpiration}
              options={EXPIRATION_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
            />
          </Field>

          {submitError ? (
            <Alert tone="error" size="sm" title="No pudimos crear el enlace">
              {submitError}
            </Alert>
          ) : null}

          {created === null && collections.length === 0 ? (
            <p className="flex items-center gap-2 text-caption text-tertiary">
              <Check aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-4 w-4" />
              Todavía no tenés colecciones: se van a compartir todas.
            </p>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}
