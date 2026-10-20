'use client';

import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui';
import { refreshCollectionPrices } from '@/lib/api/collections';

/** Sólo consulta nuestra API: el worker mantiene el ritmo y la caché del proveedor. */
export function CollectionPriceRefresh({ collectionIds, needsRefresh, onRefresh }: {
  collectionIds: string[];
  needsRefresh: boolean;
  onRefresh: () => void;
}) {
  const idsKey = JSON.stringify([...new Set(collectionIds)].sort());
  const latest = useRef({ needsRefresh, onRefresh });
  useEffect(() => { latest.current = { needsRefresh, onRefresh }; });
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const ids: string[] = JSON.parse(idsKey);
    if (!ids.length) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polls = 0;

    function poll() {
      if (controller.signal.aborted) return;
      if (!latest.current.needsRefresh || polls >= 12) {
        setPending(false);
        setMessage(latest.current.needsRefresh
          ? 'Todavía hay referencias pendientes o sin cotización. Podés volver a consultar; la cola sigue en segundo plano.'
          : 'Mostramos las últimas referencias disponibles de la fuente.');
        return;
      }
      timer = setTimeout(() => {
        if (document.visibilityState !== 'hidden') {
          latest.current.onRefresh();
          polls += 1;
        } else {
          polls += 1;
        }
        poll();
      }, 10_000);
    }

    queueMicrotask(async () => {
      if (controller.signal.aborted) return;
      if (attempt === 0) {
        setPending(latest.current.needsRefresh);
        setMessage(latest.current.needsRefresh ? 'Buscando referencias nuevas en segundo plano…' : 'Mostramos las últimas referencias disponibles de la fuente.');
        poll();
        return;
      }
      setPending(true);
      setMessage('Consultando referencias y solicitando las que faltan o vencieron…');
      try {
        let queued = 0;
        for (const id of ids) {
          queued += (await refreshCollectionPrices(id, controller.signal)).queued;
        }
        if (controller.signal.aborted) return;
        latest.current.onRefresh();
        setMessage(queued > 0
          ? 'Actualización solicitada. Las cartas, el total y la gráfica se renuevan a medida que llegan los precios.'
          : 'Consultando los últimos precios guardados. Las actualizaciones pendientes siguen en la cola.');
        poll();
      } catch {
        if (controller.signal.aborted) return;
        setPending(false);
        setMessage('No pudimos solicitar la actualización. Conservamos los últimos valores; reintentá.');
      }
    });
    return () => { controller.abort(); clearTimeout(timer); };
  }, [idsKey, attempt]);

  if (!collectionIds.length) return null;
  return <div className="flex flex-col items-start gap-2">
    <Button variant="secondary" disabled={pending} onClick={() => setAttempt((value) => value + 1)}>
      <RefreshCw aria-hidden="true" className="size-4" />{pending ? 'Consultando precios…' : 'Actualizar precios'}
    </Button>
    <p role="status" className="text-caption text-secondary">{message}</p>
    <p className="text-caption text-tertiary">Las referencias se renuevan al vencer su vigencia de 24 horas. La fecha de consulta se muestra junto a la valoración; no es una cotización en tiempo real.</p>
  </div>;
}
