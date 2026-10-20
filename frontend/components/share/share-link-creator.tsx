'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

import { useCopyToClipboard } from '@/components/share/use-copy-to-clipboard';
import { useShareUrl } from '@/components/share/use-share-url';
import { ShareLinkPreview, type SharePreviewState } from '@/components/share/share-link-preview';
import { estimatedExpiration, formatExpiration, loadSharePreviewItem, sampleCollection, type SharePreviewItem } from '@/components/share/share-preview';
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
import { listCollections, listItems } from '@/lib/api/collections';
import { createShareLink, type ShareLink } from '@/lib/api/share';
import { useAuth } from '@/hooks/use-auth';
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
  initialCollectionId?: string;
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
export function ShareLinkCreator(props: ShareLinkCreatorProps) {
  const { user, isAuthenticated } = useAuth();
  return props.open && isAuthenticated && user?.id ? <ShareLinkCreatorForAccount key={user?.id ?? 'no-session'} {...props} /> : null;
}

function ShareLinkCreatorForAccount({ open, onClose, onCreated, initialCollectionId }: ShareLinkCreatorProps) {
  const { user } = useAuth();
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
  const createInFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [previewForId, setPreviewForId] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<SharePreviewState>('loading');
  const [previewItem, setPreviewItem] = useState<SharePreviewItem | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewReloadToken, setPreviewReloadToken] = useState(0);

  const collectionField = useFieldA11y({ id: 'share-creator-collection' });
  const expirationField = useFieldA11y({ id: 'share-creator-expiration' });
  const previewCollection = useMemo(
    () => sampleCollection(collections, collection),
    [collections, collection],
  );

  useEffect(() => {
    if (!open || state !== 'ready') return;
    if (!previewCollection) return;

    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setPreviewForId(previewCollection.id);
      setPreviewState('loading');
      setPreviewItem(null);
      setPreviewError(null);
    });

    void loadSharePreviewItem(previewCollection.id, controller.signal, listItems)
      .then((item) => {
        if (controller.signal.aborted) return;
        if (!item) {
          setPreviewState('empty');
          return;
        }
        setPreviewItem(item);
        setPreviewState('ready');
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setPreviewError(
          caught instanceof ApiError ? caught.message : 'La vista previa sigue disponible; podés reintentar la muestra.',
        );
        setPreviewState('error');
      });

    return () => controller.abort();
  }, [open, state, previewCollection, previewReloadToken]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;
      setState('loading');
      setLoadError(null);
      setSubmitError(null);
      setCreated(null);
      setCollection(initialCollectionId ?? ALL_COLLECTIONS);
      setExpiration('never');
      setPreviewState('loading');
      setPreviewItem(null);
      setPreviewReloadToken(0);
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
  }, [open, reloadToken, initialCollectionId]);

  const handleSubmit = useCallback(async () => {
    if (createInFlight.current || !user?.id || state !== 'ready' || (collection !== ALL_COLLECTIONS && !collections.some((entry) => entry.id === collection))) return;
    createInFlight.current = true;
    setIsCreating(true);
    setSubmitError(null);
    try {
      const link = await createShareLink({
        collectionId: collection === ALL_COLLECTIONS ? undefined : collection,
        expiresInDays: expiration === 'never' ? undefined : Number(expiration),
      });
      if (!mounted.current) return;
      setCreated(link);
      onCreated(link);
    } catch (caught) {
      if (!mounted.current) return;
      // Igual que en la tarjeta: el error queda en el `Alert` del formulario,
      // que es donde el usuario está mirando, y el toast es para el éxito.
      setSubmitError(
        caught instanceof ApiError ? caught.message : 'No pudimos crear el enlace.',
      );
    } finally {
      createInFlight.current = false;
      if (mounted.current) setIsCreating(false);
    }
  }, [collection, expiration, onCreated, collections, state, user?.id]);

  const createdUrl = created ? shareUrl(created.slug) : '';
  const expirationText = created
    ? created.expiresAt
      ? `Vence ${formatExpiration(created.expiresAt)} (hora local).`
      : 'Sin vencimiento: sigue activo hasta que lo desactives o revoques.'
    : expiration === 'never'
      ? 'Sin vencimiento: el enlace sigue activo hasta que lo desactives o revoques.'
      : `Vencimiento estimado: ${estimatedExpiration(Number(expiration))} (hora local). El servidor confirma la fecha al crear.`;
  const collectionTitle = collection === ALL_COLLECTIONS
    ? 'Todas las colecciones'
    : collections.find((entry) => entry.id === collection)?.name ?? 'Colección';
  const visiblePreviewState = !previewCollection ? 'empty'
    : previewForId === previewCollection.id ? previewState : 'loading';
  const scopeValid = collection === ALL_COLLECTIONS || collections.some((entry) => entry.id === collection);
  const closeWhenIdle = () => { if (!createInFlight.current) onClose(); };

  return (
    <Sheet
      open={open}
      onClose={closeWhenIdle}
      title="Crear enlace"
      subtitle="Revisá qué se muestra antes de crear el enlace."
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
              disabled={!scopeValid || !user?.id}
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
            Mandalo por donde quieras. Podés desactivarlo desde Ajustes; una persona que ya lo abrió puede conservar lo que vio o guardó.
          </Alert>

          <p className="select-all break-all rounded-control bg-surface-2 px-3 py-2.5 font-mono text-caption text-secondary">
            {createdUrl}
          </p>
          <Alert tone="neutral" size="sm" title="Vigencia">
            {expirationText}
          </Alert>

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
          {/* Field aporta el nombre y la descripción accesibles del selector. */}
          <Field label="Colección" hint="Elegí una colección o compartí todas." error={!scopeValid ? 'Esta colección ya no está disponible. Elegí otra o compartí todas.' : undefined} {...collectionField}>
            <Select
              id={collectionField.id}
              aria-labelledby={collectionField.labelId}
              aria-describedby={collectionField.describedBy}
              value={collection}
              disabled={isCreating}
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
            hint="Elegí cuánto tiempo estará disponible el enlace."
            {...expirationField}
          >
            <Select
              id={expirationField.id}
              aria-labelledby={expirationField.labelId}
              aria-describedby={expirationField.describedBy}
              value={expiration}
              disabled={isCreating}
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
              Hoy no hay colecciones. El enlace compartirá todas las colecciones, incluso las que agregues después.
            </p>
          ) : null}

          <ShareLinkPreview
            ownerName={user?.displayName ?? 'Tu perfil'}
            title={collectionTitle}
            sampleCollectionName={previewCollection?.name ?? null}
            state={visiblePreviewState}
            item={previewForId === previewCollection?.id ? previewItem : null}
            error={previewError}
            allScope={collection === ALL_COLLECTIONS}
            hasCollections={collections.length > 0}
            expirationText={expirationText}
            onRetry={() => setPreviewReloadToken((token) => token + 1)}
          />
        </div>
      ) : null}
    </Sheet>
  );
}
