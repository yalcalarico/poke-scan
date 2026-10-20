'use client';

import { useRef, useState } from 'react';
import { PreviewSheet as Sheet } from '@/components/visual-preview/preview-sheet';
import { Alert, Button, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api/api-client';
import { deleteCollection } from '@/lib/api/collections';
import type { CollectionDto } from '@/types/api';

export function CollectionDeleteSheet({ open, onClose, collection, onDeleted }: {
  open: boolean;
  onClose: () => void;
  collection: CollectionDto;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const deleting = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setError(null);
  }

  function close() {
    if (!deleting.current) onClose();
  }

  async function remove() {
    if (deleting.current) return;
    deleting.current = true;
    setPending(true);
    setError(null);
    try {
      await deleteCollection(collection.id);
      toast.success('Eliminamos la colección');
      onClose();
      onDeleted();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No pudimos eliminar la colección. Probá de nuevo.');
    } finally {
      deleting.current = false;
      setPending(false);
    }
  }

  return <Sheet open={open} onClose={close} title="Eliminar colección" size="sm" footer={<>
    <Button variant="destructive" size="lg" loading={pending} pendingLabel="Eliminando…" onClick={() => void remove()}>Sí, eliminar colección</Button>
    <Button variant="secondary" size="lg" disabled={pending} autoFocus onClick={close}>Conservar colección</Button>
  </>}>
    <div className="flex flex-col gap-3">
      <p className="text-body text-primary">¿Querés eliminar «{collection.name}» y sus {collection.itemCount} {collection.itemCount === 1 ? 'copia' : 'copias'}?</p>
      <p className="text-body text-secondary">También se eliminan los enlaces compartidos de esta colección. Las cartas de tus otras colecciones se conservan. No se puede deshacer.</p>
      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  </Sheet>;
}
