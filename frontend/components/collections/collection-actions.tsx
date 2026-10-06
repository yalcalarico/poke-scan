'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Download, Pencil, Plus, Share2 } from 'lucide-react';
import { Alert, Button, buttonVariants } from '@/components/ui';
import { ShareLinkCreator } from '@/components/share/share-link-creator';
import { exportCollectionCsv } from '@/lib/collections/export-collection';
import type { CollectionDto } from '@/types/api';

export function CollectionActions({ collection, onEdit }: { collection: CollectionDto; onEdit: () => void }) {
  const [sharing, setSharing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function download() {
    const controller = new AbortController();
    request.current = controller;
    setExporting(true);
    setError(null);
    try {
      const csv = await exportCollectionCsv(collection.id, controller.signal);
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${collection.name.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 80) || 'coleccion'}.csv`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      if (!controller.signal.aborted) setError('No pudimos exportar la colección. Reintentá.');
    } finally {
      if (!controller.signal.aborted) setExporting(false);
    }
  }

  return <>
    <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap" aria-label="Acciones de la colección">
      <Link href="/escanear" className={buttonVariants({ variant: 'primary', size: 'md' })}><Plus aria-hidden="true" className="size-4" />Sumar cartas</Link>
      <Button variant="secondary" onClick={onEdit}><Pencil aria-hidden="true" className="size-4" />Editar</Button>
      <Button variant="secondary" onClick={() => void download()} loading={exporting} pendingLabel="Exportando…"><Download aria-hidden="true" className="size-4" />Exportar CSV</Button>
      <Button variant="secondary" onClick={() => setSharing(true)}><Share2 aria-hidden="true" className="size-4" />Compartir</Button>
    </div>
    {error ? <Alert tone="error" size="sm">{error}</Alert> : null}
    <ShareLinkCreator open={sharing} onClose={() => setSharing(false)} onCreated={() => undefined} initialCollectionId={collection.id} />
  </>;
}
