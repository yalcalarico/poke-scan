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

import { CardThumb } from './card-thumb';
import { formatCount } from './copy';
import type { SessionEntry } from './types';

const MAX_QUANTITY = 999;

type DraftStatus = 'idle' | 'saving' | 'done' | 'error';

interface Draft {
  collectionId: string | null;
  quantity: number;
  status: DraftStatus;
  message: string | null;
}

function initialDraft(collectionId: string | null): Draft {
  return { collectionId, quantity: 1, status: 'idle', message: null };
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
}

/**
 * ─── Sesión por lotes ───
 *
 * El caso real del escáner no es "agregar una carta", es "escaneé 20 cartas y
 * las tenía que agregar de a una". Acá las N lecturas de la sesión van en una
 * lista, cada una con su destino y su cantidad, y el footer las agrega todas en
 * una pasada.
 *
 * Si la carta ya está en esa colección con la misma variante y condición, el
 * backend suma la cantidad y devuelve el ítem actualizado como éxito. Una
 * respuesta de error no confirma que la carta se haya guardado.
 */
export function OrganizeSheet({ open, entries, onClose, onSaved, onRemove }: OrganizeSheetProps) {
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
    collections.find((collection) => collection.isDefault)?.id ?? collections[0]?.id ?? null;

  const draftFor = useCallback(
    (runId: number): Draft => drafts[runId] ?? initialDraft(defaultCollectionId),
    [defaultCollectionId, drafts],
  );

  const patch = useCallback((runId: number, values: Partial<Draft>) => {
    setDrafts((current) => {
      const draft = current[runId] ?? initialDraft(defaultCollectionId);
      return { ...current, [runId]: { ...draft, ...values } };
    });
  }, [defaultCollectionId]);

  const remove = useCallback(
    (runId: number) => {
      onRemove(runId);
      setDrafts((current) => {
        const next = { ...current };
        delete next[runId];
        return next;
      });
    },
    [onRemove],
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
    const savedRunIds = entries.filter((_, index) => outcomes[index]).map((entry) => entry.runId);
    const savedCount = savedRunIds.length;

    setIsSavingAll(false);
    savingAllRef.current = false;

    if (savedCount === 0) {
      setBulkError('No pudimos guardar ninguna de las cartas. Revisá la conexión y reintentá.');
      return;
    }

    onSaved(savedRunIds);

    if (savedCount === entries.length) {
      toast.success(
        `Guardamos ${formatCount(savedCount)} ${
          savedCount === 1 ? 'carta' : 'cartas'
        } de esta sesión.`,
      );
      onClose();
      return;
    }

    setBulkError(
      `Guardamos ${formatCount(savedCount)} de ${formatCount(entries.length)}. Las que faltaron siguen en la lista, con el motivo al lado.`,
    );
  }, [entries, onClose, onSaved, saveOne, toast]);

  const saveSingle = useCallback(async (entry: SessionEntry) => {
    if (savingAllRef.current) return;
    if (await saveOne(entry)) {
      onSaved([entry.runId]);
      toast.success('Guardamos esta carta en tu colección.');
    }
  }, [onSaved, saveOne, toast]);

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
      title="Organizar la sesión"
      subtitle={
        isEmpty
          ? undefined
          : `${formatCount(entries.length)} ${
              entries.length === 1 ? 'carta leída pendiente' : 'cartas leídas pendientes'
            } de guardar`
      }
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row">
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
          <p className="text-caption text-secondary">
            Revisá nombre, set y número antes de guardar. Se agregan como variante Normal;
            podés cambiarla después desde la colección.
          </p>
        <ul className="grid items-start gap-4 md:grid-cols-2">
          {entries.map((entry) => {
            const card = entry.candidate.card;
            const setName = card.set?.name ?? card.setId;
            const draft = draftFor(entry.runId);
            // Prefijo de texto: un `id` que arranca con dígito es válido en
            // HTML5 pero no sirve como selector de CSS, y estos ids se leen
            // desde `<label for>` y desde los `aria-describedby`.
            const collectionId = `scan-coleccion-${entry.runId}`;
            const quantityId = `scan-cantidad-${entry.runId}`;

            return (
              <li key={entry.runId} className="flex flex-col gap-3 rounded-control bg-surface-2 p-3">
                <div className="flex items-start gap-3">
                  <CardThumb card={card} width={44} />

                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="break-words text-body-strong text-primary" title={card.name}>
                      {card.name}
                    </p>
                    <p className="break-words text-caption text-secondary" title={setName}>
                      {setName}
                      <span aria-hidden="true"> · </span>
                      <span className="tabular-nums">
                        {formatCardNumber(card.number, card.set?.printedTotal ?? null)}
                      </span>
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={isSavingAll || draft.status === 'saving'}
                    onClick={() => remove(entry.runId)}
                    aria-label={`Sacar ${card.name} de la sesión`}
                    title="Sacar de la sesión"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-secondary transition-colors duration-fast ease-standard hover:bg-surface-3 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]"
                  >
                    <Trash2 aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-5 w-5" />
                  </button>
                </div>

                {/*
                  El `Field` y el control comparten `id` a propósito: es el
                  patrón que documenta el JSDoc de `Field`. Sin eso el `<label>`
                  no apunta a nada.
                */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_7rem]">
                  <Field id={collectionId} label="Colección">
                    <Select
                      id={collectionId}
                      // El trigger del listbox es un `<button>` y el
                      // `<label htmlFor>` no lo nombra: sin esto el select de
                      // colección de cada fila quedaba sin nombre accesible.
                      //
                      // Hoy es redundante —el `Field` ya inyecta exactamente este
                      // id por su `??`, que deja ganar a la prop del consumidor—
                      // pero no es un conflicto ni un `aria-labelledby` duplicado:
                      // `cloneElement` **reemplaza** la prop, no la agrega, así
                      // que el atributo sale una sola vez. Y los dos caminos
                      // resuelven la misma cadena (`${collectionId}-label` es el
                      // `labelId` que el `Field` computa del `id` que le pasamos).
                      // Se deja escrito a propósito: si algún día el `Field` deja
                      // de inyectar, este es el que sostiene el nombre accesible,
                      // y el síntoma si se borra es un combobox mudo en cada fila
                      // sin error en ningún lado.
                      aria-labelledby={`${collectionId}-label`}
                      options={collectionOptions}
                      disabled={isSavingAll || draft.status === 'saving'}
                      value={draft.collectionId}
                      onChange={(value) =>
                        patch(entry.runId, { collectionId: value, status: 'idle', message: null })
                      }
                      placeholder="Elegí una colección"
                    />
                  </Field>

                  <Field id={quantityId} label="Cantidad" hint={`Máximo ${formatCount(MAX_QUANTITY)}`}>
                    <Input
                      id={quantityId}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={MAX_QUANTITY}
                      value={draft.quantity}
                      disabled={isSavingAll || draft.status === 'saving'}
                      aria-describedby={`${quantityId}-hint`}
                      onChange={(event) => {
                        const parsed = Number.parseInt(event.target.value, 10);
                        patch(entry.runId, {
                          quantity: Number.isFinite(parsed)
                            ? Math.min(MAX_QUANTITY, Math.max(1, parsed))
                            : 1,
                        });
                      }}
                    />
                  </Field>
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
              </li>
            );
          })}
        </ul>
        </div>
      ) : null}
    </Sheet>
  );
}
