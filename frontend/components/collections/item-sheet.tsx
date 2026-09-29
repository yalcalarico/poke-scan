'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';

import { Money } from '@/components/cards/money';
import {
  Alert,
  Button,
  Field,
  Input,
  Select,
  Sheet,
  Stat,
  StatGrid,
  Switch,
  Textarea,
  useFieldA11y,
  useToast,
} from '@/components/ui';
import { ApiError } from '@/lib/api/api-client';
import { createCollection, deleteItem, listCollections, updateItem, addItem } from '@/lib/api/collections';
import { formatRelativeTime, pluralize } from '@/lib/format';
import { CONDITION_OPTIONS, VARIANT_OPTIONS, conditionLabel, variantLabel } from '@/lib/variants';
import type {
  CardCondition,
  CardVariant,
  CollectionDto,
  CollectionItemDto,
} from '@/types/api';

const MAX_QUANTITY = 999;
const MAX_NOTES = 500;

const VARIANT_SELECT_OPTIONS = VARIANT_OPTIONS.map((option) => ({
  value: option.value,
  label: option.label,
}));

const CONDITION_SELECT_OPTIONS = CONDITION_OPTIONS.map((option) => ({
  value: option.value,
  label: option.label,
}));

function messageOf(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/**
 * Qué colección queda preseleccionada en el alta.
 *
 * El orden es explícito y no accidental: la que pidió la pantalla, después la
 * principal, después la primera. La primera es un piso, no una preferencia — sin
 * colecciones el valor es `null` y la pantalla muestra el alta de la primera en
 * vez de un formulario con un select vacío.
 *
 * La colección pedida solo gana si **está en la lista**: la lista es la del
 * usuario, así que un id que no aparece es una colección borrada o ajena, y
 * elegir un id inexistente dejaría el `Select` mostrando el placeholder con un
 * `value` que no corresponde a ninguna opción.
 */
function pickCollectionId(
  list: readonly CollectionDto[],
  defaultCollectionId: string | undefined,
): string | null {
  if (defaultCollectionId && list.some((item) => item.id === defaultCollectionId)) {
    return defaultCollectionId;
  }
  return (list.find((item) => item.isDefault) ?? list[0])?.id ?? null;
}

/* ─── Editar un item que ya está en la colección ─── */

export interface ItemSheetProps {
  item: CollectionItemDto | null;
  open: boolean;
  onClose: () => void;
  onUpdated?: (item: CollectionItemDto) => void;
  onDeleted?: (itemId: string) => void;
}

/**
 * Las acciones sobre un item como `Sheet`: cantidad, variante, condición, para
 * intercambio y notas, más el borrado.
 *
 * ## El borrado
 *
 * Antes la confirmación iba **adentro del card**, con un panel rojo que empujaba
 * el resto de la grilla. Acá el `Sheet` es el contexto entero: apretar "Eliminar de la
 * colección" reemplaza el cuerpo y el pie por un bloque `role="alertdialog"` con
 * la pregunta y los dos botones. El motivo de que sea un estado y no un segundo
 * `Sheet` es que el `Sheet` del design system permite **uno** abierto a la vez
 * (§8.9): abrir la confirmación cerraría el formulario que está editando.
 *
 * Mientras se confirma, el formulario no se renderiza, así que no se puede
 * guardar un cambio y borrar la fila en la misma interacción.
 */
export function ItemSheet({ item, open, onClose, onUpdated, onDeleted }: ItemSheetProps) {
  const toast = useToast();
  const confirmRef = useRef<HTMLDivElement>(null);
  const confirmTitleId = useId();

  const [quantity, setQuantity] = useState(1);
  const [isForTrade, setIsForTrade] = useState(false);
  const [notes, setNotes] = useState('');
  const [variant, setVariant] = useState<CardVariant>('normal');
  const [condition, setCondition] = useState<CardCondition>('NM');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * El item se rehidrata desde las props en vez de tener su propio `useEffect`:
   * así el reset no pasa por un segundo render (gotchas #2) y abrir el sheet con
   * otra fila siempre muestra los valores de esa fila.
   */
  const [lastItemId, setLastItemId] = useState<string | null>(item?.id ?? null);
  if (item && item.id !== lastItemId) {
    setLastItemId(item.id);
    setQuantity(item.quantity);
    setIsForTrade(item.isForTrade);
    setNotes(item.notes ?? '');
    setVariant(item.variant);
    setCondition(item.condition);
    setConfirmingDelete(false);
    setError(null);
  }
  if (!item && lastItemId !== null) {
    setLastItemId(null);
    setConfirmingDelete(false);
    setError(null);
  }

  /*
   * Cerrar el sheet cancela la confirmación de borrado, y se ajusta en el render
   * en vez de en un efecto: un `setState` en el cuerpo de un `useEffect` es un
   * render en cascada, y acá no hay nada externo que sincronizar (gotchas #2).
   */
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setConfirmingDelete(false);
  }

  // El foco va al bloque de confirmación: si se queda en el botón que ya no
  // existe, el teclado arranca desde el body y el lector no anuncia la pregunta.
  useEffect(() => {
    if (confirmingDelete) confirmRef.current?.focus();
  }, [confirmingDelete]);

  const handleSave = useCallback(async () => {
    if (!item) return;
    setIsSaving(true);
    setError(null);
    try {
      const updated = await updateItem(item.id, {
        quantity,
        isForTrade,
        notes: notes.trim() === '' ? null : notes.trim(),
        variant,
        condition,
      });
      toast.success('Carta actualizada');
      onUpdated?.(updated);
      onClose();
    } catch (caught) {
      setError(messageOf(caught, 'No pudimos actualizar esta carta.'));
    } finally {
      setIsSaving(false);
    }
  }, [condition, isForTrade, item, notes, onClose, onUpdated, quantity, toast, variant]);

  const handleDelete = useCallback(async () => {
    if (!item) return;
    setIsDeleting(true);
    setError(null);
    try {
      await deleteItem(item.id);
      toast.success('Carta eliminada de la colección');
      onDeleted?.(item.id);
      onClose();
    } catch (caught) {
      setError(messageOf(caught, 'No pudimos eliminar esta carta.'));
      setConfirmingDelete(false);
    } finally {
      setIsDeleting(false);
    }
  }, [item, onClose, onDeleted, toast]);

  if (!item) return null;

  const marketPrice = item.price?.market ?? null;
  const total = marketPrice === null ? null : marketPrice * item.quantity;

  const subtitle = `${item.card.set?.name ?? item.card.setId} · agregada ${formatRelativeTime(item.addedAt)}`;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={item.card.name}
      subtitle={subtitle}
      size="lg"
      footer={
        confirmingDelete ? undefined : (
          <>
            <Button
              variant="primary"
              size="lg"
              className="flex-1"
              onClick={() => {
                void handleSave();
              }}
              loading={isSaving}
              pendingLabel="Guardando…"
            >
              Guardar cambios
            </Button>
            <Button
              variant="ghost"
              size="lg"
              onClick={() => setConfirmingDelete(true)}
              disabled={isSaving}
              aria-label="Eliminar de la colección"
            >
              <Trash2 aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-5 w-5" />
              Eliminar
            </Button>
          </>
        )
      }
    >
      {confirmingDelete ? (
        <div
          ref={confirmRef}
          role="alertdialog"
          aria-modal="false"
          aria-labelledby={confirmTitleId}
          tabIndex={-1}
          className="flex flex-col gap-4 outline-none"
        >
          <p id={confirmTitleId} className="text-body text-primary">
            ¿Eliminar{' '}
            <span className="font-semibold tabular-nums">
              {item.quantity} {pluralize(item.quantity, 'copia', 'copias')}
            </span>{' '}
            de {item.card.name} de tu colección? No se puede deshacer.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button
              variant="destructive"
              size="lg"
              className="flex-1"
              onClick={() => {
                void handleDelete();
              }}
              loading={isDeleting}
              pendingLabel="Eliminando…"
            >
              Sí, eliminar
            </Button>
            <Button
              variant="secondary"
              size="lg"
              className="flex-1"
              onClick={() => setConfirmingDelete(false)}
              disabled={isDeleting}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <ItemForm
          marketPrice={marketPrice}
          total={total}
          quantity={quantity}
          onQuantityChange={setQuantity}
          variant={variant}
          onVariantChange={setVariant}
          condition={condition}
          onConditionChange={setCondition}
          isForTrade={isForTrade}
          onForTradeChange={setIsForTrade}
          notes={notes}
          onNotesChange={setNotes}
          error={error}
          disabled={isSaving}
        />
      )}
    </Sheet>
  );
}

interface ItemFormProps {
  /** Precio de mercado de la variante, en USD. `null` si no hay. */
  marketPrice: number | null;
  /** Mercado × cantidad, en USD. */
  total: number | null;
  quantity: number;
  onQuantityChange: (value: number) => void;
  variant: CardVariant;
  onVariantChange: (value: CardVariant) => void;
  condition: CardCondition;
  onConditionChange: (value: CardCondition) => void;
  isForTrade: boolean;
  onForTradeChange: (value: boolean) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  error: string | null;
  disabled: boolean;
}

function ItemForm({
  marketPrice,
  total,
  quantity,
  onQuantityChange,
  variant,
  onVariantChange,
  condition,
  onConditionChange,
  isForTrade,
  onForTradeChange,
  notes,
  onNotesChange,
  error,
  disabled,
}: ItemFormProps) {
  const quantityField = useFieldA11y({ id: 'item-quantity', hint: `Máximo ${MAX_QUANTITY}` });
  const variantField = useFieldA11y({ id: 'item-variant' });
  const conditionField = useFieldA11y({ id: 'item-condition' });
  const notesField = useFieldA11y({ id: 'item-notes', hint: `${MAX_NOTES} caracteres como máximo` });

  return (
    <div className="flex flex-col gap-5">
      <StatGrid columns={3}>
        <Stat label="Copias" value={quantity} />
        <Stat label="Mercado" value={<Money usd={marketPrice} />} />
        {/*
          El tono va en el `<span>` de afuera y no en el `tone` del `Money`:
          `cn()` mete `text-label` y `text-positive` en el mismo grupo (la
          escala tipográfica de §3.1 no la conoce `tailwind-merge`) y el tamaño
          es lo que se pierde. El dinero es `positive` (§2.3), pero el color lo
          pone el consumidor, no el componente.
        */}
        <Stat
          label="Total"
          value={
            <span className="text-positive">
              <Money usd={total} />
            </span>
          }
        />
      </StatGrid>

      <div className="flex flex-col gap-4">
        <Field {...quantityField} label="Cantidad">
          <Input
            id={quantityField.id}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_QUANTITY}
            disabled={disabled}
            value={quantity}
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10);
              onQuantityChange(
                Number.isFinite(parsed) ? Math.min(MAX_QUANTITY, Math.max(1, parsed)) : 1,
              );
            }}
            invalid={quantityField.invalid}
            aria-describedby={quantityField.describedBy}
          />
        </Field>

        {/*
          Los dos `Select` de abajo (y los tres del `AddToCollectionSheet`) no
          llevan `aria-labelledby` a mano y ya no hacen falta: el `Field` clona
          su único hijo y le inyecta `aria-labelledby`/`aria-describedby`
          apuntando al `<label>` que él mismo renderiza
          (`components/ui/field.tsx:268-273`). El `Select` es hijo **directo** y
          único del `Field`, que es la condición para que la inyección llegue, y
          su API acepta las dos props y las baja al `<button role="combobox">`.

          Antes sí faltaba: `<label htmlFor>` no nombra un `<button>`, así que el
          lector anunciaba "combobox, 2 de 5" a secas. No se agrega el prop
          "por las dudas": si algún día se pasa a llamar al `Select` con un
          wrapper en el medio, la inyección deja de llegar y ahí sí hay que
          escribirlo, como hacen `organize-sheet.tsx:345` y
          `share-link-creator.tsx:217`.
        */}
        <Field {...variantField} label="Variante">
          <Select
            id={variantField.id}
            options={VARIANT_SELECT_OPTIONS}
            value={variant}
            onChange={onVariantChange}
            disabled={disabled}
            invalid={variantField.invalid}
          />
        </Field>

        <Field {...conditionField} label="Condición">
          <Select
            id={conditionField.id}
            options={CONDITION_SELECT_OPTIONS}
            value={condition}
            onChange={onConditionChange}
            disabled={disabled}
            invalid={conditionField.invalid}
          />
        </Field>

        <div className="rounded-control border border-line bg-surface-2 px-3 py-2">
          <Switch
            checked={isForTrade}
            onCheckedChange={onForTradeChange}
            disabled={disabled}
            label="Disponible para intercambio"
          />
        </div>

        <Field {...notesField} label="Notas">
          <Textarea
            id={notesField.id}
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
            maxLength={MAX_NOTES}
            rows={3}
            disabled={disabled}
            placeholder="Origen, estado del foil, con qué set lo conseguiste…"
            invalid={notesField.invalid}
            aria-describedby={notesField.describedBy}
          />
        </Field>
      </div>

      {error ? (
        <Alert tone="error" size="sm">
          {error}
        </Alert>
      ) : null}
    </div>
  );
}

/* ─── Agregar un item nuevo ─── */

export interface AddToCollectionSheetProps {
  cardId: string;
  cardName?: string;
  open: boolean;
  onClose: () => void;
  /** Se llama con el item creado; en el 409 se llama con `null` (no hay id nuevo). */
  onAdded?: (item: CollectionItemDto | null) => void;
  /** Preselecciona "para intercambio" (lo usa el chip de la ficha). */
  defaultForTrade?: boolean;
  /**
   * Colección a preseleccionar. **Gana sobre `isDefault`**: sin esto, abrir el
   * alta desde el binder de una colección que no es la principal mandaba la
   * carta a otra colección, y el usuario estaba mirando una y acababa viendo el
   * número de la otra.
   *
   * Degrada sin romper si el id no está en la lista —que es el caso de una
   * colección borrada o de otra cuenta, porque `listCollections()` solo devuelve
   * las del usuario—: el `Select` volvería a un valor que no está entre sus
   * opciones y el formulario se mandaría con un `collectionId` fantasma.
   */
  defaultCollectionId?: string;
}

/**
 * Alta de una carta en una colección, con el 409 tratado como éxito.
 *
 * El 409 del backend es "esa variante ya está en esta colección con esa
 * condición": el `POST` no creó un item nuevo, **sumó** la cantidad al que ya
 * estaba. Es el resultado que el usuario quería, así que se informa como éxito
 * y no como error — es el criterio de siempre y no se pierde acá.
 */
export function AddToCollectionSheet({
  cardId,
  cardName,
  open,
  onClose,
  onAdded,
  defaultForTrade = false,
  defaultCollectionId,
}: AddToCollectionSheetProps) {
  const toast = useToast();

  const [collections, setCollections] = useState<CollectionDto[] | null>(null);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [variant, setVariant] = useState<CardVariant>('normal');
  const [condition, setCondition] = useState<CardCondition>('NM');
  const [quantity, setQuantity] = useState(1);
  const [isForTrade, setIsForTrade] = useState(false);

  const [newCollectionName, setNewCollectionName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Al reabrir, el formulario vuelve al estado inicial: reabrir un sheet y
  // encontrar la cantidad del intento anterior es confuso.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setVariant('normal');
      setCondition('NM');
      setQuantity(1);
      setIsForTrade(defaultForTrade);
      setSubmitError(null);
      setCollections(null);
      setLoadError(null);
      setCollectionId(null);
      setReloadToken((token) => token + 1);
    }
  }

  useEffect(() => {
    if (!open) return;
    let disposed = false;

    queueMicrotask(() => {
      if (disposed) return;
      listCollections()
        .then((list) => {
          if (disposed) return;
          const safeList = Array.isArray(list) ? list : [];
          setCollections(safeList);
          setCollectionId((current) => current ?? pickCollectionId(safeList, defaultCollectionId));
          setLoadError(null);
        })
        .catch((caught: unknown) => {
          if (disposed) return;
          setLoadError(messageOf(caught, 'No pudimos cargar tus colecciones.'));
        });
    });

    return () => {
      disposed = true;
    };
  }, [defaultCollectionId, open, reloadToken]);

  const handleCreate = useCallback(async () => {
    const name = newCollectionName.trim();
    if (!name) return;
    setIsCreating(true);
    try {
      const created = await createCollection({ name });
      setCollections((current) => [...(current ?? []), created]);
      setCollectionId(created.id);
      setNewCollectionName('');
    } catch (caught) {
      setLoadError(messageOf(caught, 'No pudimos crear la colección.'));
    } finally {
      setIsCreating(false);
    }
  }, [newCollectionName]);

  const collectionOptions = (collections ?? []).map((collection) => ({
    value: collection.id,
    label: collection.isDefault ? `${collection.name} (principal)` : collection.name,
  }));

  const selectedCollectionName = (collections ?? []).find(
    (collection) => collection.id === collectionId,
  )?.name;

  const handleSubmit = useCallback(async () => {
    if (!collectionId) {
      setSubmitError('Elegí una colección.');
      return;
    }
    setIsSaving(true);
    setSubmitError(null);
    try {
      const created = await addItem(collectionId, { cardId, variant, condition, quantity });
      toast.success(`Agregada a ${selectedCollectionName ?? 'tu colección'}`);
      onAdded?.(created);
      onClose();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        // La variante ya estaba: el backend sumó la cantidad. Para el usuario es
        // exactamente lo que quería, así que no es un error.
        toast.success('Esa variante ya estaba: sumamos la cantidad.');
        onAdded?.(null);
        onClose();
        return;
      }
      setSubmitError(messageOf(caught, 'No pudimos guardar la carta en tu colección.'));
    } finally {
      setIsSaving(false);
    }
  }, [
    cardId,
    collectionId,
    condition,
    onAdded,
    onClose,
    quantity,
    selectedCollectionName,
    toast,
    variant,
  ]);

  const quantityField = useFieldA11y({ id: 'add-quantity', hint: `Máximo ${MAX_QUANTITY}` });
  const collectionField = useFieldA11y({ id: 'add-collection' });
  const variantField = useFieldA11y({ id: 'add-variant' });
  const conditionField = useFieldA11y({ id: 'add-condition' });
  const newNameField = useFieldA11y({ id: 'new-collection-name' });

  const helpText = `Se van a sumar ${quantity} ${pluralize(quantity, 'copia', 'copias')} de ${
    cardName ?? 'esta carta'
  } con variante ${variantLabel(variant)} y condición ${conditionLabel(condition)}. Si la carta ya está en esa colección con la misma variante y condición, se suma la cantidad en lugar de duplicarla.`;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Añadir a colección"
      subtitle={cardName}
      size="lg"
      footer={
        collections && collections.length > 0 ? (
          <>
            <Button
              variant="primary"
              size="lg"
              className="flex-1"
              onClick={() => {
                void handleSubmit();
              }}
              loading={isSaving}
              pendingLabel="Guardando…"
            >
              Añadir
            </Button>
            <Button variant="ghost" size="lg" onClick={onClose} disabled={isSaving}>
              Cancelar
            </Button>
          </>
        ) : undefined
      }
    >
      {loadError ? (
        <Alert
          tone="error"
          size="sm"
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setLoadError(null);
                setReloadToken((token) => token + 1);
              }}
            >
              Reintentar
            </Button>
          }
        >
          {loadError}
        </Alert>
      ) : null}

      {!loadError && collections === null ? (
        <div role="status" aria-label="Cargando colecciones" className="flex flex-col gap-3">
          <div className="h-10 w-full rounded-control bg-shimmer animate-shimmer" aria-hidden="true" />
          <div className="h-10 w-full rounded-control bg-shimmer animate-shimmer" aria-hidden="true" />
        </div>
      ) : null}

      {!loadError && collections !== null && collections.length === 0 ? (
        <div className="flex flex-col gap-4">
          <Alert tone="info" size="sm" title="Todavía no tenés colecciones">
            Creá la primera y después sumá las cartas que quieras.
          </Alert>
          <Field {...newNameField} label="Nombre de la colección">
            <Input
              id={newNameField.id}
              value={newCollectionName}
              onChange={(event) => setNewCollectionName(event.target.value)}
              maxLength={50}
              placeholder="Mi colección"
              autoFocus
              invalid={newNameField.invalid}
              aria-describedby={newNameField.describedBy}
            />
          </Field>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => {
              void handleCreate();
            }}
            loading={isCreating}
            pendingLabel="Creando…"
            disabled={newCollectionName.trim().length === 0}
          >
            Crear colección
          </Button>
        </div>
      ) : null}

      {collections && collections.length > 0 ? (
        <div className="flex flex-col gap-4">
          {/*
          Los tres `Select` de acá (Colección, Variante, Condición) están
          nombrados por la inyección del `Field`, igual que los dos del
          `ItemSheet` de arriba: hijo directo y único, `label` presente, y
          `useFieldA11y` proveyendo el mismo `labelId` que el `Field` resuelve.
          Ver el bloque de arriba para el porqué de no escribir el prop a mano.
        */}
          <Field {...collectionField} label="Colección">
            <Select
              id={collectionField.id}
              options={collectionOptions}
              value={collectionId}
              onChange={setCollectionId}
              invalid={collectionField.invalid}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field {...variantField} label="Variante">
              <Select
                id={variantField.id}
                options={VARIANT_SELECT_OPTIONS}
                value={variant}
                onChange={setVariant}
                invalid={variantField.invalid}
              />
            </Field>
            <Field {...conditionField} label="Condición">
              <Select
                id={conditionField.id}
                options={CONDITION_SELECT_OPTIONS}
                value={condition}
                onChange={setCondition}
                invalid={conditionField.invalid}
              />
            </Field>
          </div>

          <Field {...quantityField} label="Cantidad">
            <Input
              id={quantityField.id}
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_QUANTITY}
              value={quantity}
              onChange={(event) => {
                const parsed = Number.parseInt(event.target.value, 10);
                setQuantity(
                  Number.isFinite(parsed) ? Math.min(MAX_QUANTITY, Math.max(1, parsed)) : 1,
                );
              }}
              invalid={quantityField.invalid}
              aria-describedby={quantityField.describedBy}
            />
          </Field>

          <div className="rounded-control border border-line bg-surface-2 px-3 py-2">
            <Switch
              checked={isForTrade}
              onCheckedChange={setIsForTrade}
              label="Disponible para intercambio"
            />
          </div>

          <p className="rounded-control bg-surface-2 px-3 py-2.5 text-caption text-secondary">
            {helpText}
          </p>

          {submitError ? (
            <Alert tone="error" size="sm">
              {submitError}
            </Alert>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}
