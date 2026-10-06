'use client';

import { Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useMemo, useRef, useState } from 'react';

import {
  Alert,
  Button,
  Field,
  Input,
  RetryButton,
  Select,
  Sheet,
  Skeleton,
  useToast,
  buttonVariants,
} from '@/components/ui';
import { useAsync } from '@/hooks/use-async';
import { ApiError } from '@/lib/api';
import { addItem, listCollections } from '@/lib/api/collections';
import { formatCardNumber } from '@/lib/format';
import type { CollectionDto } from '@/types/api';

import { ShowOrDash } from '@/components/cards/money';
import { SwipeScanRow } from './swipe-scan-row';
import { CardThumb } from './card-thumb';
import { formatCount } from './copy';
import type { SessionEntry } from './types';

const MAX_QUANTITY = 999;

type DraftStatus = 'idle' | 'saving' | 'done' | 'error';

interface Draft {
  collectionId: string | null;
  quantity: number;
  scanCount: number;
  status: DraftStatus;
  message: string | null;
}

function initialDraft(collectionId: string | null, quantity = 1): Draft {
  return { collectionId, quantity, scanCount: quantity, status: 'idle', message: null };
}

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export interface OrganizeSheetProps {
  open: boolean;
  entries: readonly SessionEntry[];
  onClose: () => void;
  /** `runId`s que quedaron guardados: la sesión los saca. */
  onSaved: (runIds: number[]) => void;
  /** Saca una lectura de la sesión sin guardarla. */
  onRemove: (runId: number) => void;
  onReview?: (runId: number) => void;
}

/**
 * ─── Sesión por lotes ───
 *
 * El caso real del escáner no es "agregar una carta", es "escaneé 20 cartas y
 * las tenía que agregar de a una". Acá las N lecturas de la sesión van en una
 * lista agrupada por carta, con un destino común y cantidades editables, y el footer las agrega todas en
 * una pasada.
 *
 * Si la carta ya está en esa colección con la misma variante y condición, el
 * backend suma la cantidad y devuelve el ítem actualizado como éxito. Una
 * respuesta de error no confirma que la carta se haya guardado.
 */
export function OrganizeSheet({ open, entries: scans, onClose, onSaved, onRemove, onReview }: OrganizeSheetProps) {
  // Agrupar sólo la presentación conserva las corridas para corregir candidatos.
  const entries = useMemo(() => {
    const groups = new Map<string, SessionEntry & { runIds: number[] }>();
    for (const scan of scans) {
      const previous = groups.get(scan.candidate.card.id);
      if (previous) previous.runIds.push(scan.runId);
      else groups.set(scan.candidate.card.id, { ...scan, runIds: [scan.runId] });
    }
    return [...groups.values()];
  }, [scans]);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const toast = useToast();
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const { status, data, error: loadError, reload } = useAsync<CollectionDto[]>(
    (signal) => {
      // `listCollections` no acepta `AbortSignal`: el wrapper es el que
      // documenta la guía para estos casos, y evita escribir un `fetch` a mano.
      void signal;
      // La hoja queda montada al escanear como invitado. Pedir colecciones
      // estando cerrada dispararía el refresh de sesión de un endpoint privado.
      return open ? listCollections() : Promise.resolve([]);
    },
    [open],
  );

  const collections = useMemo(() => data ?? [], [data]);

  // Cada fila tiene su propio bloqueo: una respuesta de otra carta no puede
  // invalidarla, y dos clicks antes del próximo render no duplican el POST.
  const savingRunIds = useRef(new Set<number>());
  const savingAllRef = useRef(false);

  /**
   * La colección por defecto se **deriva** en cada render en vez de sembrarse
   * con un `useEffect` cuando llegan las colecciones. Derivar el estado que uno
   * mismo puede dejar escrito en el momento del render es lo correcto acá: el
   * `useEffect` además dispararía el `set-state-in-effect` de React 19 y su
   * doble montaje de StrictMode.
   */
  const defaultCollectionId =
    collectionId ?? collections.find((collection) => collection.isDefault)?.id ?? collections[0]?.id ?? null;

  const draftFor = useCallback(
    (runId: number): Draft => {
      const scanCount = entries.find((entry) => entry.runId === runId)?.runIds.length ?? 1;
      const stored = drafts[runId] ?? initialDraft(defaultCollectionId, scanCount);
      return { ...stored, collectionId: defaultCollectionId, scanCount,
        quantity: Math.max(1, Math.min(MAX_QUANTITY, stored.quantity + scanCount - stored.scanCount)) };
    },
    [defaultCollectionId, drafts, entries],
  );

  const patch = useCallback((runId: number, values: Partial<Draft>) => {
    setDrafts((current) => {
      const scanCount = entries.find((entry) => entry.runId === runId)?.runIds.length ?? 1;
      const stored = current[runId] ?? initialDraft(defaultCollectionId, scanCount);
      const draft = { ...stored, scanCount, quantity: Math.max(1, Math.min(MAX_QUANTITY, stored.quantity + scanCount - stored.scanCount)) };
      return { ...current, [runId]: { ...draft, ...values } };
    });
  }, [defaultCollectionId, entries]);

  const remove = useCallback(
    (runId: number) => {
      for (const id of entries.find((entry) => entry.runId === runId)?.runIds ?? [runId]) onRemove(id);
      setDrafts((current) => {
        const next = { ...current };
        delete next[runId];
        return next;
      });
    },
    [onRemove, entries],
  );

  const saveOne = useCallback(
    async (entry: SessionEntry): Promise<boolean> => {
      const draft = draftFor(entry.runId);
      if (!draft.collectionId) {
        patch(entry.runId, {
          collectionId: draft.collectionId,
          status: 'error',
          message: 'Elegí una colección.',
        });
        return false;
      }
      if (savingRunIds.current.has(entry.runId) || draft.status === 'done') return false;

      savingRunIds.current.add(entry.runId);
      patch(entry.runId, { status: 'saving', message: null });

      try {
        const item = await addItem(draft.collectionId, {
          cardId: entry.candidate.card.id,
          quantity: draft.quantity,
        });
        patch(entry.runId, {
          status: 'done',
          message: item.quantity > draft.quantity ? 'Sumada a una copia que ya tenías.' : null,
        });
        return true;
      } catch (err) {
        patch(entry.runId, {
          status: 'error',
          message: messageOf(err, 'No pudimos guardar esta carta.'),
        });
        return false;
      } finally {
        savingRunIds.current.delete(entry.runId);
      }
    },
    [draftFor, patch],
  );

  const saveAll = useCallback(async () => {
    if (savingAllRef.current || savingRunIds.current.size > 0) return;
    savingAllRef.current = true;
    setIsSavingAll(true);
    setBulkError(null);

    // En paralelo y no en serie: son N POSTs contra **nuestro** backend
    // (Postgres), no contra pokemontcg.io, así que el rate limit externo no
    // aplica acá. El propio backend tolera 100 req/min contra un lote de 20.
    const outcomes = await Promise.all(entries.map((entry) => saveOne(entry)));
    const savedRunIds = entries.filter((_, index) => outcomes[index]).flatMap((entry) => entry.runIds);
    const savedCount = savedRunIds.length;

    setIsSavingAll(false);
    savingAllRef.current = false;

    if (savedCount === 0) {
      setBulkError('No pudimos guardar ninguna de las cartas. Revisá la conexión y reintentá.');
      return;
    }

    onSaved(savedRunIds);

    if (outcomes.every(Boolean)) {
      toast.success(
        `Guardamos ${formatCount(savedCount)} ${
          savedCount === 1 ? 'carta' : 'cartas'
        } de esta sesión.`,
      );
      onClose();
      return;
    }

    setBulkError(
      `Guardamos ${formatCount(savedCount)} de ${formatCount(scans.length)}. Las que faltaron siguen en la lista, con el motivo al lado.`,
    );
  }, [entries, scans.length, onClose, onSaved, saveOne, toast]);

  const saveSingle = useCallback(async (entry: SessionEntry) => {
    if (savingAllRef.current) return;
    if (await saveOne(entry)) {
      onSaved(entries.find((group) => group.runId === entry.runId)?.runIds ?? [entry.runId]);
      toast.success('Guardamos esta carta en tu colección.');
    }
  }, [onSaved, saveOne, toast, entries]);

  const collectionOptions = useMemo(
    () =>
      collections.map((collection) => ({
        value: collection.id,
        label: collection.name,
        description: `${formatCount(collection.uniqueCount)} cartas`,
      })),
    [collections],
  );

  const isEmpty = entries.length === 0;
  const hasCollections = collections.length > 0;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="full"
      title="Revisar escaneos"
      subtitle={
        isEmpty
          ? undefined
          : `${formatCount(entries.length)} ${
              entries.length === 1 ? 'carta leída pendiente' : 'cartas leídas pendientes'
            } de guardar`
      }
      footer={
        <div className="flex w-full flex-col gap-2">
          <p className="text-center text-body-strong text-primary">Total: <ShowOrDash usd={entries.some((entry) => entry.candidate.price?.market != null) ? entries.reduce((total, entry) => total + (entry.candidate.price?.market ?? 0) * draftFor(entry.runId).quantity, 0) : null} />
            {entries.some((entry) => entry.candidate.price?.market == null) ? <span className="block text-caption text-tertiary">Hay cartas sin precio disponible</span> : null}
          </p>
          <Button
            variant="primary"
            size="lg"
            onClick={() => void saveAll()}
            loading={isSavingAll}
            pendingLabel="Guardando…"
            disabled={isEmpty || !hasCollections || status !== 'ready' || Object.values(drafts).some((draft) => draft.status === 'saving')}
            className="w-full sm:flex-1"
          >
            {isEmpty ? 'Nada que guardar' : `Agregar todas (${formatCount(entries.length)})`}
          </Button>
          <Button variant="ghost" size="lg" onClick={onClose}>
            Seguir escaneando
          </Button>
        </div>
      }
    >
      {bulkError ? (
        <div className="mb-4">
          <Alert tone="error" title="Faltaron cartas">
            {bulkError}
          </Alert>
        </div>
      ) : null}

      {status === 'loading' ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Cargando colecciones">
          <Skeleton variant="block" />
          <Skeleton variant="block" />
          <Skeleton variant="block" />
        </div>
      ) : null}

      {status === 'error' ? (
        <Alert
          tone="error"
          title="No pudimos cargar tus colecciones"
          action={<RetryButton onClick={reload} />}
        >
          {loadError ?? 'Revisá tu conexión y reintentá.'}
        </Alert>
      ) : null}

      {status === 'ready' && isEmpty ? (
        <p className="text-body text-secondary">
          Todavía no leíste ninguna carta en esta sesión. Escaneá una y volvé acá.
        </p>
      ) : null}

      {status === 'ready' && !isEmpty && !hasCollections ? (
        <Alert tone="info" title="Creá una colección para guardar">
          <p>Las cartas siguen en esta sesión. Creá una colección y volvé a Organizar.</p>
          <Link href="/colecciones" className={buttonVariants({ variant: 'secondary' })}>
            Ir a colecciones
          </Link>
        </Alert>
      ) : null}

      {status === 'ready' && !isEmpty && hasCollections ? (
        <div className="flex flex-col gap-4">
          <div className="sticky top-0 z-sticky bg-surface pb-3">
            <Field id="scan-destination" label="Agregar a la colección">
              <Select id="scan-destination" aria-labelledby="scan-destination-label" options={collectionOptions}
                value={defaultCollectionId} onChange={setCollectionId}
                disabled={isSavingAll || Object.values(drafts).some((draft) => draft.status === 'saving')}
                placeholder="Elegí una colección" />
            </Field>
          </div>
        <ul className="grid items-start gap-4 md:grid-cols-2">
          {entries.map((entry) => {
            const card = entry.candidate.card;
            const setName = card.set?.name ?? card.setId;
            const draft = draftFor(entry.runId);
            // Prefijo de texto: un `id` que arranca con dígito es válido en
            // HTML5 pero no sirve como selector de CSS, y estos ids se leen
            // desde `<label for>` y desde los `aria-describedby`.
            const quantityId = `scan-cantidad-${entry.runId}`;

            return (
              <SwipeScanRow key={entry.runId} name={card.name} disabled={isSavingAll || draft.status === 'saving'} onRemove={() => remove(entry.runId)}>
              <div className="flex flex-col gap-3 bg-surface-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-body-strong text-primary">{card.name}</p>
                    <p className="break-words text-caption text-secondary">{setName} · {formatCardNumber(card.number, card.set?.printedTotal ?? null)}</p>
                  </div>
                  <Button variant="ghost" disabled={isSavingAll || draft.status === 'saving'} onClick={() => remove(entry.runId)}
                    className="sr-only focus:not-sr-only md:not-sr-only"
                    aria-label={`Sacar ${card.name} de la sesión`}><Trash2 aria-hidden="true" className="size-5" /></Button>
                </div>
                <div className="flex items-start gap-4">
                  {onReview ? <button type="button" aria-label={`Revisar coincidencia de ${card.name}`}
                    disabled={isSavingAll || draft.status === 'saving'} onClick={() => onReview(entry.runId)}
                    className="self-start rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]">
                    <CardThumb card={card} width={112} />
                    <span className="mt-2 block text-caption text-brand">Revisar carta</span>
                  </button> : <CardThumb card={card} width={112} />}
                  <div className="flex min-w-0 flex-1 flex-col gap-3">
                    <ShowOrDash usd={entry.candidate.price?.market ?? null} size="lg" />
                    <dl className="flex flex-col gap-2 text-caption">
                      <div className="flex justify-between gap-2"><dt className="text-secondary">Variante</dt><dd className="text-brand">Normal</dd></div>
                      <div className="flex justify-between gap-2"><dt className="text-secondary">Tipo</dt><dd className="text-brand">Sin graduar</dd></div>
                      <div className="flex justify-between gap-2"><dt className="text-secondary">Condición</dt><dd className="text-brand">Near Mint</dd></div>
                    </dl>
                    <Field id={quantityId} label="Cantidad">
                      <Input id={quantityId} type="number" inputMode="numeric" min={1} max={MAX_QUANTITY} value={draft.quantity}
                        disabled={isSavingAll || draft.status === 'saving'}
                        onChange={(event) => {
                          const parsed = Number.parseInt(event.target.value, 10);
                          patch(entry.runId, { quantity: Number.isFinite(parsed) ? Math.min(MAX_QUANTITY, Math.max(1, parsed)) : 1 });
                        }} />
                    </Field>
                  </div>
                </div>

                {/*
                  El resultado de guardar va debajo de la fila y no en el `error`
                  del `Field`: el campo de cantidad está bien, lo que falló (o lo
                  que salió bien) fue el POST.
                */}
                {draft.message ? (
                  <p
                    role={draft.status === 'error' ? 'alert' : 'status'}
                    className={
                      draft.status === 'done'
                        ? 'text-caption text-positive'
                        : 'text-caption text-negative'
                    }
                  >
                    {draft.message}
                  </p>
                ) : null}

                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => void saveSingle(entry)}
                  loading={draft.status === 'saving'}
                  pendingLabel="Guardando…"
                  disabled={draft.collectionId === null || draft.status === 'done' || isSavingAll}
                  className="self-start"
                >
                  {draft.status === 'done' ? 'Guardada' : 'Agregar'}
                </Button>
              </div>
              </SwipeScanRow>
            );
          })}
        </ul>
        </div>
      ) : null}
    </Sheet>
  );
}
