import Image from 'next/image';

import { Alert, Button, Surface } from '@/components/ui';
import { formatDate, formatPrice } from '@/lib/format';
import { conditionLabel, variantLabel } from '@/lib/variants';
import type { SharePreviewItem } from './share-preview';

export type SharePreviewState = 'loading' | 'error' | 'empty' | 'ready';

export interface ShareLinkPreviewProps {
  ownerName: string;
  title: string;
  sampleCollectionName: string | null;
  state: SharePreviewState;
  item: SharePreviewItem | null;
  error: string | null;
  allScope: boolean;
  hasCollections: boolean;
  expirationText: string;
  onRetry: () => void;
}

export function ShareLinkPreview({
  ownerName,
  title,
  sampleCollectionName,
  state,
  item,
  error,
  allScope,
  hasCollections,
  expirationText,
  onRetry,
}: ShareLinkPreviewProps) {
  return (
    <section aria-labelledby="share-preview-title" className="flex flex-col gap-3">
      <h3 tabIndex={-1} id="share-preview-title" className="text-body-strong text-primary">Vista previa</h3>
      <Surface className="flex flex-col gap-3">
        <div>
          <p className="text-h3 text-primary">{title}</p>
          <p className="mt-1 text-caption text-secondary">De {ownerName}</p>
          <p className="mt-2 text-caption text-secondary">Cualquiera con el enlace puede verlo, sin crear una cuenta.</p>
          {allScope ? (
            <p className="mt-1 text-caption text-tertiary">
              Incluye las colecciones actuales y las que agregues después.
            </p>
          ) : null}
        </div>

        {state === 'loading' ? (
          <p role="status" className="text-caption text-secondary">Cargando una muestra…</p>
        ) : null}
        {state === 'error' ? (
          <Alert tone="error" size="sm" title="No pudimos cargar la muestra">
            <div className="flex flex-col items-start gap-2">
              <span>{error ?? 'La vista previa sigue disponible; podés reintentar la muestra.'}</span>
              <Button variant="secondary" size="md" onClick={onRetry}>Reintentar muestra</Button>
            </div>
          </Alert>
        ) : null}
        {state === 'empty' ? (
          <p className="rounded-control bg-surface-2 p-3 text-caption text-secondary">
            {allScope
              ? hasCollections
                ? sampleCollectionName ? 'Hoy no hay una fila disponible para esta muestra.' : 'Las colecciones actuales todavía no tienen cartas.'
                : 'Todavía no hay colecciones con cartas para mostrar.'
              : 'Esta colección todavía no tiene cartas.'}
            {allScope ? ' El enlace podrá reflejar las cartas que agregues después.' : ''}
          </p>
        ) : null}
        {state === 'ready' && item ? (
          <div className="flex gap-3 rounded-control bg-surface-2 p-3">
            <Image
              src={item.card.imageSmall}
              alt=""
              width={72}
              height={100}
              className="h-auto w-18 shrink-0 rounded-control object-contain"
            />
            <div className="min-w-0 self-center">
              <p className="text-body-strong text-primary">{item.card.name}</p>
              <p className="text-caption text-secondary">
                {[sampleCollectionName, item.card.setName, item.card.setSeries, `N.º ${item.card.number}`, item.card.rarity, item.card.artist]
                  .filter(Boolean).join(' · ')}
              </p>
              <p className="mt-1 text-caption text-secondary">
                {variantLabel(item.variant)} · {conditionLabel(item.condition)} · {item.quantity} {item.quantity === 1 ? 'copia' : 'copias'}
              </p>
              {item.price && item.price.market !== null && Number.isFinite(item.price.market) ? (
                <p className="mt-1 text-caption text-secondary">
                  Referencia por copia: USD {formatPrice(item.price.market, 'USD')} · {[item.price.provider, item.price.source].filter((value, index, values) => value && values.indexOf(value) === index).join(' · ')} · consultado {formatDate(item.price.fetchedAt)}
                </p>
              ) : (
                <p className="mt-1 text-caption text-tertiary">Sin referencia de mercado</p>
              )}
            </div>
          </div>
        ) : null}
        {state === 'ready' ? (
          <p className="text-caption text-tertiary">Muestra de una carta; no representa el inventario completo.</p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-label text-primary">Se comparte</p>
            <p className="mt-1 text-caption text-secondary">Carta y edición, variante, condición, cantidad y referencia USD disponible.</p>
          </div>
          <div>
            <p className="text-label text-primary">No se comparte</p>
            <p className="mt-1 text-caption text-secondary">Tus notas privadas no se comparten. Tampoco tu email ni datos de gestión de la colección.</p>
          </div>
        </div>

        <Alert tone="neutral" size="sm" title="Vigencia">
          {expirationText}
        </Alert>
      </Surface>
    </section>
  );
}
