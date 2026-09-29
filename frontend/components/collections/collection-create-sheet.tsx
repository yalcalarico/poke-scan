'use client';

import { useCallback, useId, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button, Field, Input, Sheet, useFieldA11y, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api/api-client';
import { createCollection } from '@/lib/api/collections';
import type { CollectionDto } from '@/types/api';

/** Límite del backend (`CreateCollectionDto.name`), no un capricho del diseño. */
const MAX_NAME_LENGTH = 50;

export interface CollectionCreateSheetProps {
  open: boolean;
  onClose: () => void;
  /** Se llama con la colección creada para que la lista la muestre sin recargar. */
  onCreated: (collection: CollectionDto) => void;
}

/**
 * Alta de una colección, como `Sheet` y no como el form inline del header.
 *
 * Antes el `<input>` + botón "Nueva colección" iba adentro del bloque del
 * `<h1>`, uno al lado del otro. El header es chrome de 56 px con el
 * título centrado y truncado en los dos lados: un form ahí parte el título, y
 * el único lugar libre es la acción de la derecha, que es un `IconButton` de
 * 40×40 — no un campo de texto.
 *
 * Además el `Sheet` resuelve lo que el form inline no tenía: focus trap,
 * `inert` en el resto del documento, `Escape` para cerrar y devolución del foco
 * al trigger. Y deja la pantalla con **una sola** acción primaria (§8.1): con el
 * form siempre visible, "Nueva colección" competía con el CTA del estado vacío.
 *
 * El error vive **dentro** del `Field` y no en un `Alert` aparte: el `Field` ya
 * lo pinta con `role="alert"`, y dos superficies para el mismo string leen
 * como dos errores distintos.
 */
export function CollectionCreateSheet({ open, onClose, onCreated }: CollectionCreateSheetProps) {
  const router = useRouter();
  const toast = useToast();
  const reactId = useId();

  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field = useFieldA11y({ id: `${reactId}-name`, hint: `Máximo ${MAX_NAME_LENGTH} caracteres` });

  const handleClose = useCallback(() => {
    setName('');
    setError(null);
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError('Poné un nombre para la colección.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const created = await createCollection({ name: trimmed });
      toast.success(`Creamos «${created.name}»`);
      onCreated(created);
      setName('');
      onClose();
      // Se entra a la colección recién creada: está vacía y es el único lugar
      // donde tiene sentido estar ahora — el `EmptyState` de adentro ya ofrece
      // buscar la primera carta.
      router.push(`/colecciones/${encodeURIComponent(created.id)}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No pudimos crear la colección.');
    } finally {
      setIsSaving(false);
    }
  }, [name, onClose, onCreated, router, toast]);

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      title="Nueva colección"
      subtitle="Separá por set, por objetivo o como quieras"
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
            pendingLabel="Creando…"
            disabled={name.trim().length === 0}
          >
            Crear colección
          </Button>
          <Button variant="ghost" size="lg" onClick={handleClose} disabled={isSaving}>
            Cancelar
          </Button>
        </>
      }
    >
      {/*
        El `<form>` existe para que Enter en el input dispare el submit: el
        botón real vive en el `footer` del `Sheet`, que está fuera de este
        subtree, así que sin el form el teclado no tiene forma de confirmar.
      */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <Field {...field} label="Nombre" error={error}>
          <Input
            id={field.id}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={MAX_NAME_LENGTH}
            placeholder="Mi colección"
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
