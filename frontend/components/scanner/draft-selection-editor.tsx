'use client';

import { useState } from 'react';
import { Button, Checkbox, Field, Input, Select } from '@/components/ui';
import { VARIANT_OPTIONS } from '@/lib/variants';
import type { CardCondition, CardVariant } from '@/types/api';
import type { DraftAllocation } from './session-draft';

export interface AllocationSelection {
  id: string;
  quantity: number;
}

/** El subconjunto y sus atributos se aplican juntos únicamente por confirmación explícita. */
export function DraftSelectionEditor({ allocations, onApply, onCancel }: {
  allocations: readonly DraftAllocation[];
  onApply: (selection: AllocationSelection[], variant: CardVariant, condition: CardCondition) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [variant, setVariant] = useState<CardVariant | null>(null);
  const amount = (allocation: DraftAllocation) => quantities[allocation.id] ?? String(allocation.quantity);
  const valid = allocations.filter((allocation) => selected.has(allocation.id)).every((allocation) => /^\d+$/.test(amount(allocation)) && Number(amount(allocation)) >= 1 && Number(amount(allocation)) <= allocation.quantity);

  return <div className="flex flex-col gap-4">
    <p className="text-body text-secondary">Elegí las lecturas y cuántas copias querés mover. La suma del lote se conserva. Confirmar también revisa la carta propuesta de esas partes.</p>
    <Button variant="secondary" onClick={() => setSelected(new Set(allocations.map((allocation) => allocation.id)))}>Seleccionar todas las partes</Button>
    {allocations.map((allocation) => <div key={allocation.id} className="flex flex-col gap-3">
      <Checkbox label={`Seleccionar lectura ${allocation.runId}, parte de ${allocation.quantity} copias`} checked={selected.has(allocation.id)} onChange={(event) => setSelected((current) => {
        const next = new Set(current);
        if (event.target.checked) next.add(allocation.id); else next.delete(allocation.id);
        return next;
      })} />
      {selected.has(allocation.id) ? <Field id={`move-${allocation.id}`} label={`Copias a mover de lectura ${allocation.runId}`}
        error={!/^\d+$/.test(amount(allocation)) || Number(amount(allocation)) < 1 || Number(amount(allocation)) > allocation.quantity ? `Elegí de 1 a ${allocation.quantity} copias.` : undefined}>
        <Input id={`move-${allocation.id}`} type="number" min={1} max={allocation.quantity} value={amount(allocation)} onChange={(event) => setQuantities((current) => ({ ...current, [allocation.id]: event.target.value }))} />
      </Field> : null}
    </div>)}
    <Field id="selection-variant" label="Variante de la selección"><Select id="selection-variant" value={variant ?? ''} placeholder="Elegí una variante" options={VARIANT_OPTIONS} onChange={(value) => setVariant(value as CardVariant)} /></Field>
    <Button disabled={!selected.size || !variant || !valid} onClick={() => {
      if (variant && valid) onApply(allocations.filter((allocation) => selected.has(allocation.id)).map((allocation) => ({ id: allocation.id, quantity: Number(amount(allocation)) })), variant, 'NM');
    }}>Aplicar selección</Button>
    <Button variant="secondary" onClick={onCancel}>Volver al lote</Button>
  </div>;
}
