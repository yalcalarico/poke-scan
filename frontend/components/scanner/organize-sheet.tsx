'use client';

import { PreviewSheet as Sheet } from '@/components/visual-preview/preview-sheet';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Field, Input, RetryButton, Select, Skeleton, useToast, buttonVariants } from '@/components/ui';
import { useAsync } from '@/hooks/use-async';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api';
import { addItem, listCollections } from '@/lib/api/collections';
import { getCardPrices } from '@/lib/api/cards';
import { formatCardNumber } from '@/lib/format';
import { CONDITION_OPTIONS, VARIANT_OPTIONS } from '@/lib/variants';
import type { CardCondition, CardVariant, CollectionDto, PriceDto, CardDto } from '@/types/api';
import { ShowOrDash } from '@/components/cards/money';
import { CardThumb } from './card-thumb';
import { formatCount } from './copy';
import type { SessionEntry } from './types';
import {
  createSessionDraft, groupAllocations, isAllocationReady, lockedAllocationIds as getLockedIds,
  readSessionDraft, readyAllocationGroups, settleDraftOperation, syncDraftEntries, writeSessionDraft,
  type DraftAllocation, type DraftOperation, type SessionDraft,
} from './session-draft';
import { DraftCardSearch } from './draft-card-search';
import { DraftSelectionEditor } from './draft-selection-editor';

const MAX_QUANTITY = 999;
function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'No pudimos confirmar el resultado. El intento queda protegido.';
}

export interface OrganizeSheetProps {
  open: boolean;
  entries: readonly SessionEntry[];
  onClose: () => void;
  onSaved: (runIds: number[]) => void;
  onRemove: (runId: number) => void;
  onReview?: (runId: number) => void;
  onCorrect?: (runId: number, card: CardDto) => void;
  manualReviewRunId?: number | null;
}

export function OrganizeSheet({ open, entries, onClose, onSaved, onRemove, onReview, onCorrect, manualReviewRunId }: OrganizeSheetProps) {
  const toast = useToast();
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const [draft, setDraft] = useState<SessionDraft>(() => readSessionDraft(entries) ?? createSessionDraft(entries));
  const draftRef = useRef(draft);
  const restored = useRef(entries.length > 0);
  const [storageWarning, setStorageWarning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [priceByCard, setPriceByCard] = useState<Record<string, PriceDto[]>>({});
  const inFlight = useRef(false);
  const batchInFlight = useRef(false);
  const currentUserRef = useRef(userId);
  const [quantityInputs, setQuantityInputs] = useState<Record<string, string>>({});
  const [correctionRunId, setCorrectionRunId] = useState<number | null>(null);
  const [selectionIds, setSelectionIds] = useState<string[] | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  useEffect(() => { currentUserRef.current = userId; }, [userId]);
  const { status, data, error: loadError, reload } = useAsync<CollectionDto[]>((signal) => {
    void signal;
    return open ? listCollections() : Promise.resolve([]);
  }, [open]);
  const collections = useMemo(() => data ?? [], [data]);
  const activeOperations = draft.operations.filter((operation) => operation.status !== 'confirmed' && operation.status !== 'rejected');
  const lockedAllocationIds = getLockedIds(draft);

  const collectionOptions = useMemo(() => collections.map((collection) => ({ value: collection.id,
    label: collection.name, description: `${formatCount(collection.uniqueCount)} cartas` })), [collections]);
  const entryByRun = useMemo(() => new Map(entries.map((entry) => [entry.runId, entry])), [entries]);
  const synchronized = useMemo(() => syncDraftEntries(draft, entries), [draft, entries]);
  const allocationsFor = (snapshot: SessionDraft) => syncDraftEntries(snapshot, entries).allocations;
  const allocationList = synchronized.allocations;
  const updateDraft = (updater: (current: SessionDraft) => SessionDraft) => {
    const next = updater(syncDraftEntries(draftRef.current, entries));
    draftRef.current = next;
    setDraft(next);
  };
  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => {
    if (!restored.current && entries.length) {
      const saved = readSessionDraft(entries);
      queueMicrotask(() => {
        const restoredDraft = saved ?? createSessionDraft(entries);
        draftRef.current = restoredDraft;
        setDraft(restoredDraft);
      });
      restored.current = true;
      return;
    }
    if (restored.current) {
      setStorageWarning(!writeSessionDraft(synchronized));
      if (JSON.stringify(synchronized) !== JSON.stringify(draft)) {
        queueMicrotask(() => { draftRef.current = synchronized; setDraft(synchronized); });
      }
    }
  }, [draft, entries, synchronized]);
  useEffect(() => {
    if (manualReviewRunId != null) queueMicrotask(() => setCorrectionRunId(manualReviewRunId));
  }, [manualReviewRunId]);
  const grouped = useMemo(() => groupAllocations(allocationList.filter((allocation) => entryByRun.has(allocation.runId))), [allocationList, entryByRun]);
  const invalidQuantityIds = new Set(Object.entries(quantityInputs).filter(([, value]) => !/^\d+$/.test(value) || Number(value) < 1 || Number(value) > MAX_QUANTITY).map(([id]) => id));
  const readyGroups = readyAllocationGroups(synchronized).filter((group) => group.every((allocation) => !invalidQuantityIds.has(allocation.id)));
  const pendingCount = allocationList.reduce((sum, allocation) => sum + allocation.quantity, 0);
  const readyCopies = readyGroups.flat().reduce((sum, allocation) => sum + allocation.quantity, 0);
  const referenceFor = (allocation: DraftAllocation) => {
    const prices = priceByCard[allocation.cardId] ?? entryByRun.get(allocation.runId)?.candidate.prices ?? [];
    return prices.find((price) => price.cardId === allocation.cardId && price.variant === allocation.variant
      && price.market != null && Number.isFinite(price.market));
  };
  const pricedCopies = allocationList.reduce((sum, allocation) => sum + (referenceFor(allocation) ? allocation.quantity : 0), 0);
  const currentDestinationId = draft.ownerUserId === userId ? draft.selectedCollectionId : null;
  const destinationValid = Boolean(currentDestinationId && collections.some((collection) => collection.id === currentDestinationId));

  const patchAllocation = (id: string, values: Partial<DraftAllocation>) => {
    const focusedId = document.activeElement?.id;
    updateDraft((current) => ({ ...current,
      operations: current.operations.filter((operation) => operation.status !== 'rejected' || !operation.allocationIds.includes(id)),
      allocations: current.allocations.map((allocation) => allocation.id === id ? { ...allocation, ...values } : allocation),
    }));
    // Cambiar atributos puede mover la parte a otro grupo y remontar el control.
    if (focusedId) queueMicrotask(() => document.getElementById(focusedId)?.focus());
  };

  const fetchPrices = async (cardId: string) => {
    if (priceByCard[cardId]) return;
    try {
      const response = await getCardPrices(cardId, AbortSignal.timeout(5000));
      setPriceByCard((current) => ({ ...current, [cardId]: response.prices }));
    } catch {
      // Un fallo de consulta no invalida la referencia previa ni la carta elegida.
      const previous = entries.find((entry) => entry.candidate.card.id === cardId)?.candidate.prices ?? [];
      setPriceByCard((current) => ({ ...current, [cardId]: previous }));
    }
  };

  const saveGroup = async (group: DraftAllocation[], replay?: DraftOperation) => {
    const currentDraft = syncDraftEntries(draftRef.current, entries);
    const currentAllocations = allocationsFor(currentDraft);
    const first = group[0];
    const destinationId = currentDraft.ownerUserId === userId ? currentDraft.selectedCollectionId : null;
    const collectionId = replay?.collectionId ?? (currentDraft.destinationConfirmed && destinationId ? destinationId : null);
    if ((!first && !replay) || !collectionId || !userId || currentUserRef.current !== userId || inFlight.current || currentDraft.recoveryBlocked) return false;
    if (!replay && (!collections.some((collection) => collection.id === collectionId) || group.some((allocation) => getLockedIds(currentDraft).has(allocation.id)))) return false;
    if (group.some((allocation) => !isAllocationReady(allocation) || invalidQuantityIds.has(allocation.id))) return false;
    if (!replay && (!first?.variant || !first.condition)) return false;
    const payload = replay?.payload ?? {
      cardId: first!.cardId,
      variant: first!.variant!,
      condition: first!.condition!,
      quantity: group.reduce((sum, allocation) => sum + allocation.quantity, 0),
    };
    if (payload.quantity < 1 || payload.quantity > MAX_QUANTITY) return false;
    if (replay && (replay.userId !== userId || replay.collectionId !== destinationId || replay.status !== 'uncertain')) return false;
    const operation: DraftOperation = replay ?? {
      id: crypto.randomUUID(), userId, collectionId, payload,
      allocationIds: group.map((allocation) => allocation.id), status: 'saving',
    };
    const operationBase = [...currentDraft.operations.filter((item) => item.id !== operation.id
      && !(item.status === 'rejected' && item.allocationIds.some((id) => operation.allocationIds.includes(id)))), operation];
    const snapshot: SessionDraft = {
      ...currentDraft, allocations: currentAllocations,
      operations: operationBase.map((item) => item.id === operation.id ? { ...item, status: 'saving' } : item),
    };
    draftRef.current = snapshot;
    setDraft(snapshot);
    inFlight.current = true;
    setIsSaving(true);
    try {
      // Conservamos clave, destino y payload antes de la escritura aditiva.
      if (!writeSessionDraft(snapshot)) {
        setStorageWarning(true);
        updateDraft((current) => settleDraftOperation(current, operation.id, 'blocked', 'No se pudo guardar el intento en esta pestaña; no lo enviamos.'));
        return false;
      }
      const response = await addItem(collectionId, payload, operation.id);
      if (!response || typeof response.id !== 'string' || !response.id || !response.card || typeof response.card.id !== 'string' || !Number.isInteger(response.quantity) || response.quantity < 1) {
        throw new Error('Recibimos una respuesta incompleta. El intento queda incierto.');
      }
      const confirmedAllocations = currentAllocations.filter((allocation) => operation.allocationIds.includes(allocation.id));
      const remainingRuns = new Set(currentAllocations.filter((allocation) => !operation.allocationIds.includes(allocation.id)).map((allocation) => allocation.runId));
      const nextDraft = settleDraftOperation({ ...currentDraft, allocations: currentAllocations, operations: operationBase }, operation.id, 'confirmed');
      if (!writeSessionDraft(nextDraft)) {
        // Si la confirmación local falla, el snapshot previo conserva el intento para verificarlo.
        setStorageWarning(true);
        updateDraft((current) => settleDraftOperation(current, operation.id, 'uncertain', 'La escritura pudo confirmarse, pero no pudimos guardar la confirmación local.'));
        return false;
      }
      draftRef.current = nextDraft;
      setDraft(nextDraft);
      onSaved([...new Set(confirmedAllocations.map((allocation) => allocation.runId).filter((runId) => !remainingRuns.has(runId)))]);
      toast.success(`Guardamos ${formatCount(payload.quantity)} ${payload.quantity === 1 ? 'copia' : 'copias'}.`);
      return true;
    } catch (error) {
      const message = messageOf(error);
      const knownNoWrite = !replay && error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 409 && error.status !== 410;
      const state = error instanceof ApiError && error.status === 410 ? 'blocked' : knownNoWrite ? 'rejected' : 'uncertain';
      updateDraft((current) => settleDraftOperation(current, operation.id, state, message));
      return false;
    } finally {
      inFlight.current = false;
      if (!batchInFlight.current) setIsSaving(false);
    }
  };

  const saveReady = async () => {
    if (!draft.destinationConfirmed || !destinationValid || isSaving || inFlight.current || batchInFlight.current) return;
    // El bloqueo de lote cubre también el intervalo entre respuestas de grupos.
    batchInFlight.current = true;
    setIsSaving(true);
    for (const group of readyGroups) {
      if (currentUserRef.current !== userId) break;
      await saveGroup(group);
    }
    batchInFlight.current = false;
    setIsSaving(false);
  };

  const chooseDestination = (id: string) => {
    if (activeOperations.length) return;
    updateDraft((current) => ({ ...current, selectedCollectionId: id || null, ownerUserId: id ? userId : null, destinationConfirmed: Boolean(id) }));
  };

  const totalKnown = allocationList.reduce((sum, allocation) => sum + (referenceFor(allocation)?.market ?? 0) * allocation.quantity, 0);
  const hasPrice = pricedCopies > 0;

  return <Sheet open={open} onClose={onClose} size="full" title={correctionRunId !== null ? `Reemplazar lectura ${correctionRunId}` : selectionIds ? "Separar copias" : "Revisar escaneos"}
    subtitle={`${formatCount(entries.length)} ${entries.length === 1 ? 'lectura' : 'lecturas'} · ${formatCount(pendingCount)} copias · ${formatCount(grouped.length)} ${grouped.length === 1 ? 'grupo' : 'grupos'}`}
    footer={correctionRunId === null && !selectionIds ? <div className="flex w-full flex-col gap-2">
      <p className="text-center text-body-strong text-primary">Valor conocido por variante: <ShowOrDash usd={hasPrice ? totalKnown : null} /></p>
      <p className="text-caption text-secondary">{pricedCopies} de {pendingCount} copias con referencia. La condición no modifica el precio.</p>
      <p className="text-caption text-secondary">Guardaremos {readyCopies} copias; {pendingCount - readyCopies} quedan pendientes.</p>
      <p className="text-caption text-secondary">{readyGroups.length} {readyGroups.length === 1 ? 'grupo listo' : 'grupos listos'} · {grouped.length - readyGroups.length} por completar</p>
      <Button size="lg" onClick={() => void saveReady()} loading={isSaving} pendingLabel="Guardando…"
      disabled={!readyGroups.length || !draft.destinationConfirmed || !destinationValid || isSaving || Boolean(draft.recoveryBlocked)}>Guardar listas ({readyGroups.length})</Button>
      <Button variant="ghost" size="lg" onClick={onClose} disabled={isSaving}>Seguir escaneando</Button>
    </div> : null}>
    {draft.recoveryBlocked ? <Alert tone="error" title="Borrador protegido">{draft.recoveryBlocked}</Alert> : null}
    {correctionRunId !== null ? <DraftCardSearch runId={correctionRunId} onCancel={() => setCorrectionRunId(null)} onConfirm={(card) => {
      const runId = correctionRunId;
      updateDraft((current) => ({ ...current, entries: current.entries.map((entry) => entry.runId === runId ? { ...entry, identityReviewed: true, selectionSource: 'manual', candidate: { ...entry.candidate, card, score: 0, rawScore: 0, prices: [], price: null } } : entry), allocations: current.allocations.map((allocation) => allocation.runId === runId ? { ...allocation, cardId: card.id, reviewed: true, variant: null, variantReviewed: false, condition: null, conditionReviewed: false } : allocation), operations: current.operations.filter((operation) => operation.status !== 'rejected' || !operation.allocationIds.some((id) => current.allocations.some((allocation) => allocation.id === id && allocation.runId === runId))) }));
      onCorrect?.(runId, card);
      setCorrectionRunId(null);
    }} /> : null}
    {selectionIds ? <DraftSelectionEditor allocations={allocationList.filter((allocation) => selectionIds.includes(allocation.id))} onCancel={() => setSelectionIds(null)} onApply={(selection, variant, condition) => {
      updateDraft((current) => ({ ...current,
        operations: current.operations.filter((operation) => operation.status !== 'rejected' || !operation.allocationIds.some((id) => selection.some((item) => item.id === id))),
        allocations: current.allocations.flatMap((allocation) => {
          const moved = selection.find((item) => item.id === allocation.id);
          if (!moved) return [allocation];
          const changed = { ...allocation, quantity: moved.quantity, variant, variantReviewed: true, condition, conditionReviewed: true, reviewed: true };
          return moved.quantity === allocation.quantity ? [changed] : [
            { ...allocation, quantity: allocation.quantity - moved.quantity }, { ...changed, id: crypto.randomUUID() },
          ];
        }),
      }));
      setSelectionIds(null);
      setQuantityInputs((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !selection.some((item) => item.id === id))));
    }} /> : null}
    {storageWarning ? <Alert tone="warning" title="El borrador dura mientras esta pantalla siga abierta">No pudimos guardarlo en esta pestaña. No se enviará una escritura sin conservar su clave.</Alert> : null}
    {status === 'loading' ? <div role="status" aria-label="Cargando colecciones"><Skeleton variant="block" /><Skeleton variant="block" /></div> : null}
    {status === 'error' ? <Alert tone="error" title="No pudimos cargar tus colecciones" action={<RetryButton onClick={reload} />}>{loadError ?? 'Revisá tu conexión y reintentá.'}</Alert> : null}
    {status === 'ready' && !collections.length ? <Alert tone="info" title="Creá una colección para guardar"><Link href="/colecciones" className={buttonVariants({ variant: 'secondary' })}>Ir a colecciones</Link></Alert> : null}
    {correctionRunId === null && !selectionIds && status === 'ready' && collections.length ? <div className="flex flex-col gap-4">
      <Field id="scan-destination" label="Destino del lote">
        <Select id="scan-destination" options={collectionOptions} value={currentDestinationId ?? ''} onChange={chooseDestination}
          placeholder="Elegí una colección" disabled={isSaving || activeOperations.length > 0 || Boolean(draft.recoveryBlocked)} />
      </Field>
      {draft.operations.filter((operation) => operation.status !== 'confirmed').map((operation) => <Alert key={operation.id} tone={operation.status === 'blocked' || operation.status === 'rejected' ? 'error' : 'warning'} title={operation.status === 'uncertain' ? 'Resultado incierto' : operation.status === 'rejected' ? 'No se guardó esta parte' : 'Intento protegido'}>
        <p>{operation.message ?? 'No sabemos si el servidor confirmó esta escritura.'} Se conserva la misma clave y el mismo payload.</p>
        {!isSaving && operation.status === 'uncertain' && operation.userId === userId && operation.collectionId === currentDestinationId ? <Button variant="secondary" onClick={() => void saveGroup([], operation)}>Verificar este intento</Button> : null}
      </Alert>)}
      {activeOperations.some((operation) => operation.userId !== userId) ? <Alert tone="warning" title="Intento de otra cuenta">Volvé a la cuenta que lo envió para verificarlo. El destino y el payload están protegidos.</Alert> : null}
      <ul className="grid items-start gap-4 md:grid-cols-2">{grouped.map((group) => <li key={group.map((allocation) => allocation.id).join('-')} className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <p className="text-body-strong text-primary">{entryByRun.get(group[0]?.runId ?? 0)?.candidate.card.name} · {group.reduce((sum, allocation) => sum + allocation.quantity, 0)} copias en este grupo</p>
          <Button variant="secondary" disabled={isSaving || group.some((allocation) => lockedAllocationIds.has(allocation.id)) || Boolean(draft.recoveryBlocked)} onClick={() => setSelectionIds(group.map((allocation) => allocation.id))}>Separar copias / aplicar a varias</Button>
        </div>
        <ul className="flex flex-col gap-3">{group.map((allocation) => {
        const entry = entryByRun.get(allocation.runId);
        if (!entry) return null;
        const card = entry.candidate.card;
        const locked = lockedAllocationIds.has(allocation.id) || isSaving || Boolean(draft.recoveryBlocked);
        const exactPrice = referenceFor(allocation);
        return <li key={allocation.id} className="flex flex-col gap-3 rounded-panel bg-surface-2 p-4">
          <div className="flex gap-3"><button type="button" className="min-h-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]" disabled={locked} onClick={() => onReview?.(allocation.runId)} aria-label={`Revisar carta ${card.name}`}><CardThumb card={card} width={88} /></button>
            <div className="min-w-0 flex-1"><p className="text-body-strong text-primary">{card.name}</p><p className="text-caption text-secondary">{card.set?.name ?? card.setId} · {formatCardNumber(card.number, card.set?.printedTotal ?? null)}</p>
              <p className="text-caption text-warning">{allocation.reviewed ? entry.selectionSource === 'manual' ? 'Selección manual confirmada' : 'Carta revisada' : 'Propuesta por revisar'}</p>
              {onCorrect ? <Button variant="secondary" onClick={() => setCorrectionRunId(allocation.runId)} disabled={locked}>Buscar carta a mano</Button> : null}
              {onReview ? <Button variant="ghost" onClick={() => onReview(allocation.runId)} disabled={locked}>Revisar carta</Button> : null}</div></div>
          <Field id={`variant-${allocation.id}`} label="Variante"><Select id={`variant-${allocation.id}`} value={allocation.variant ?? (allocation.variantReviewed ? '__unknown' : '')} placeholder="Elegí una variante"
            options={[{ value: '__unknown', label: 'No sé todavía' }, ...VARIANT_OPTIONS.map(({ value, label }) => ({ value, label }))]} disabled={locked} onChange={(value) => {
              patchAllocation(allocation.id, { variant: (value === '__unknown' || !value ? null : value) as CardVariant | null, variantReviewed: Boolean(value) });
              if (value && value !== '__unknown') void fetchPrices(allocation.cardId);
            }} /></Field>
          <Field id={`condition-${allocation.id}`} label="Condición"><Select id={`condition-${allocation.id}`} value={allocation.condition ?? (allocation.conditionReviewed ? '__unknown' : '')} placeholder="Elegí una condición"
            options={[{ value: '__unknown', label: 'No sé todavía' }, ...CONDITION_OPTIONS.map(({ value, label }) => ({ value, label }))]} disabled={locked}
            onChange={(value) => patchAllocation(allocation.id, { condition: (value === '__unknown' || !value ? null : value) as CardCondition | null, conditionReviewed: Boolean(value) })} /></Field>
          <Field id={`quantity-${allocation.id}`} label="Copias de esta lectura" error={invalidQuantityIds.has(allocation.id) ? 'Ingresá un entero de 1 a 999. No modificamos la cantidad anterior.' : undefined}>
            <Input id={`quantity-${allocation.id}`} type="number" min={1} max={MAX_QUANTITY} value={quantityInputs[allocation.id] ?? String(allocation.quantity)} disabled={locked}
              onChange={(event) => {
                const raw = event.target.value;
                setQuantityInputs((current) => ({ ...current, [allocation.id]: raw }));
                if (/^\d+$/.test(raw) && Number(raw) >= 1 && Number(raw) <= MAX_QUANTITY) patchAllocation(allocation.id, { quantity: Number(raw) });
              }} />
          </Field>
          {allocation.quantity > 1 ? <p className="text-caption text-secondary">Incluye copias agregadas a mano. No son capturas nuevas.</p> : null}
          {grouped.some((group) => group.some((item) => item.id === allocation.id) && group.reduce((sum, item) => sum + item.quantity, 0) > MAX_QUANTITY) ? <Alert tone="warning" title="El grupo supera 999 copias">Reducí el incremento o separá sus atributos antes de guardar. No recortamos cantidades.</Alert> : null}
          <p className="text-caption text-secondary">{exactPrice ? <ShowOrDash usd={exactPrice.market} /> : allocation.variant ? 'Sin precio para esta variante' : 'Elegí variante para consultar su referencia'}</p>
          {!allocation.reviewed ? <Button variant="secondary" onClick={() => patchAllocation(allocation.id, { reviewed: true })} disabled={locked}>Confirmar carta propuesta</Button> : null}
          {allocation.quantity > 1 ? <Button variant="secondary" disabled={locked} onClick={() => {
            setQuantityInputs((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== allocation.id)));
            updateDraft((current) => ({ ...current,
            operations: current.operations.filter((operation) => operation.status !== 'rejected' || !operation.allocationIds.includes(allocation.id)),
            allocations: allocationsFor(current).flatMap((item) => item.id !== allocation.id ? [item] : [
              { ...item, id: crypto.randomUUID(), quantity: item.quantity - 1 }, { ...item, quantity: 1 },
            ]) }));
          }}>Separar una copia</Button> : null}
          <Button variant="ghost" onClick={() => setRemoveId(allocation.id)} disabled={locked}>Sacar {allocation.quantity} {allocation.quantity === 1 ? 'copia' : 'copias'} de esta parte</Button>
          {removeId === allocation.id ? <Alert tone="warning" title="¿Sacar esta parte del lote?">
            <p>Se retiran {allocation.quantity} copias de la lectura {allocation.runId}; las otras partes se conservan.</p>
            <Button variant="secondary" onClick={() => setRemoveId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => {
              updateDraft((current) => {
                const allocations = current.allocations.filter((item) => item.id !== allocation.id);
                const remaining = allocations.some((item) => item.runId === allocation.runId);
                if (!remaining) onRemove(allocation.runId);
                return { ...current, allocations, entries: remaining ? current.entries : current.entries.filter((entry) => entry.runId !== allocation.runId),
                  retiredRunIds: remaining ? current.retiredRunIds : [...new Set([...current.retiredRunIds, allocation.runId])],
                  operations: current.operations.filter((operation) => operation.status !== 'rejected' || !operation.allocationIds.includes(allocation.id)) };
              });
              setRemoveId(null);
            }}>Confirmar retiro</Button>
          </Alert> : null}
        </li>;
      })}</ul>
      </li>)}</ul>
    </div> : null}
  </Sheet>;
}
