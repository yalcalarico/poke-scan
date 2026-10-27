'use client';

import { useState } from 'react';
import { Alert, Button, Field, Input, Skeleton } from '@/components/ui';
import { useAsync } from '@/hooks/use-async';
import { searchCards } from '@/lib/api/cards';
import { formatCardNumber } from '@/lib/format';
import type { CardDto } from '@/types/api';
import { CardThumb } from './card-thumb';

/** Corrección dentro de Organizar: una selección reemplaza la lectura, no suma una copia. */
export function DraftCardSearch({ runId, onConfirm, onCancel }: {
  runId: number;
  onConfirm: (card: CardDto) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [selected, setSelected] = useState<CardDto | null>(null);
  const { status, data, error, reload } = useAsync((signal) => submitted
    ? searchCards({ q: submitted, pageSize: 20 }, signal)
    : Promise.resolve(null), [submitted]);

  return <div className="flex flex-col gap-4">
    <p className="text-body text-secondary">Reemplazar la propuesta de la lectura {runId}. La cantidad se conserva; asignamos NM y la variante que respalda su referencia de precio.</p>
    <form onSubmit={(event) => { event.preventDefault(); setSelected(null); setSubmitted(query.trim()); }} className="flex flex-col gap-3">
      <Field id="scan-correction-query" label="Buscar carta"><Input id="scan-correction-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre de la carta" /></Field>
      <Button type="submit" disabled={!query.trim()}>Buscar en el catálogo</Button>
    </form>
    {submitted && status === 'loading' ? <div role="status" aria-label="Buscando cartas"><Skeleton variant="block" /></div> : null}
    {status === 'error' ? <Alert tone="error" title="No pudimos buscar" action={<Button variant="secondary" onClick={reload}>Reintentar</Button>}>{error}</Alert> : null}
    {submitted && status === 'ready' && !data?.data.length ? <p className="text-body text-secondary">No encontramos cartas con «{submitted}».</p> : null}
    <ul className="flex flex-col gap-3">{data?.data.map((card) => <li key={card.id}>
      <Button variant={selected?.id === card.id ? 'primary' : 'secondary'} className="h-auto min-h-11 w-full justify-start py-3 text-left" aria-pressed={selected?.id === card.id} onClick={() => setSelected(card)}>
        <CardThumb card={card} width={44} />
        <span>{card.name}<span className="block text-caption">{card.set?.name ?? card.setId} · {formatCardNumber(card.number, card.set?.printedTotal ?? null)}</span></span>
      </Button>
    </li>)}</ul>
    <Button disabled={!selected} onClick={() => { if (selected) onConfirm(selected); }}>Confirmar reemplazo de lectura {runId}</Button>
    <Button variant="secondary" onClick={onCancel}>Volver al lote</Button>
  </div>;
}
