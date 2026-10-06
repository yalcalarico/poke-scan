'use client';

import { useCurrency } from '@/hooks/use-currency';
import { conditionLabel, variantLabel } from '@/lib/variants';
import type { CollectionItemDto } from '@/types/api';

export function CollectionItemDetails({ item }: { item: CollectionItemDto }) {
  const { formatMoney } = useCurrency();
  const market = item.price?.market ?? null;
  return <div className="flex w-full flex-col gap-1 text-caption text-secondary">
    <p>#{item.card.number} · {variantLabel(item.variant)}</p>
    <p>{conditionLabel(item.condition)}</p>
    <div className="flex flex-wrap justify-between gap-1 border-t border-line pt-2 tabular-nums">
      <span>Cantidad: {item.quantity}</span>
      <span className="font-semibold text-primary">Total: {market === null ? '—' : formatMoney(market * item.quantity)}</span>
    </div>
    {item.isForTrade ? <p className="text-brand">Para intercambio</p> : null}
  </div>;
}
