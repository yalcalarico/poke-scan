'use client';

import { useCallback, useId, useState } from 'react';

import { Button, Field, Input, Sheet, useFieldA11y, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api/api-client';
import { updateCollection } from '@/lib/api/collections';
import type { CollectionDto } from '@/types/api';

/** Límite del backend (`UpdateCollectionDto.name`). */
const MAX_NAME_LENGTH = 50;

export interface CollectionRenameSheetProps {
  open: boolean;
  onClose: () => void;
  /** La colección que se está renombrando. */
  collection: CollectionDto;
  /** Se llama con la colección ya actualizada en el backend. */
  onRenamed: (collection: CollectionDto) => void;
}

/**
 * Renombrar la colección, como `Sheet` con un `Field` y un `Input`.
 *
 * ## Por qué no el form inline
 *
 * Un form embebido en el encabezado necesita dos piezas de bookkeeping para que
 * el input no se quede con el valor viejo: un `lastName` que se compara **en el
 * cuerpo del render** y un `editing` que decide si el `setValue` que lo acompaña
 * corre o no. Con el `Sheet` la segunda pieza desaparece: el
 * formulario solo existe mientras el sheet está abierto, así que el estado nace
 * de las props y no hay nada que resincronizar.
 *
 * ## Por qué el `wasOpen` y no un `key` de reset
 *
 * Es el patrón que ya usan `ItemSheet` y `AddToCollectionSheet` en esta misma
 * carpeta: comparar `open` contra el valor anterior **durante el render** y
 * recién ahí resetear. Es la receta oficial de React para derivar estado de las
 * props y evita las dos alternativas malas: un `useEffect` que resetea (que es un
 * render en cascada, y con el doble montaje de `StrictMode` dispara el doble
 * fetch, gotchas #9) y un contador `resetKey` que el padre tiene que mantener
 * solo para forzar un remontaje. El ajuste ocurre antes de pintar, así que el
 * usuario nunca ve el valor del intento anterior.
 */
export function CollectionRenameSheet({
  open,
  onClose,
  collection,
  onRenamed,
}: CollectionRenameSheetProps) {
  const toast = useToast();
  const reactId = useId();

  const [value, setValue] = useState(collection.name);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estado derivado de las props, ajustado en el render y no en un efecto.
  const [lastName, setLastName] = useState(collection.name);
  const [wasOpen, setWasOpen] = useState(open);

  if (collection.name !== lastName) {
    setLastName(collection.name);
    if (!wasOpen) setValue(collection.name);
  }
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setValue(collection.name);
      setError(null);
    }
  }

  const field = useFieldA11y({
    id: `${reactId}-name`,
    hint: `Máximo ${MAX_NAME_LENGTH} caracteres`,
    error,
  });

  const handleClose = useCallback(() => {
    setError(null);
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(async () => {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      setError('Poné un nombre para la colección.');
      return;
    }
    if (trimmed === collection.name) {
      onClose();
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const updated = await updateCollection(collection.id, { name: trimmed });
      toast.success('Renombramos la colección');
      onRenamed(updated);
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No pudimos renombrar la colección.');
    } finally {
      setIsSaving(false);
    }
  }, [collection.id, collection.name, onClose, onRenamed, toast, value]);

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      title="Renombrar colección"
      size="sm"
      footer={
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
            disabled={value.trim().length === 0}
          >
            Guardar
          </Button>
          <Button variant="ghost" size="lg" onClick={handleClose} disabled={isSaving}>
            Cancelar
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <Field {...field} label="Nombre">
          <Input
            id={field.id}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            maxLength={MAX_NAME_LENGTH}
            autoFocus
            disabled={isSaving}
            invalid={field.invalid}
            aria-describedby={field.describedBy}
          />
        </Field>
      </form>
    </Sheet>
  );
}
