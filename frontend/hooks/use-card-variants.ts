'use client';

import { useEffect, useState } from 'react';
import { getCardPrices } from '@/lib/api/cards';
import { VARIANT_OPTIONS } from '@/lib/variants';
import type { CardVariant } from '@/types/api';

/** Usa las mismas variantes locales que la ficha y conserva la variante guardada. */
export function useCardVariants(cardId: string | undefined, open: boolean, savedVariant?: CardVariant) {
  const [result, setResult] = useState<{ cardId: string; variants: CardVariant[]; preferred?: CardVariant } | null>(null);
  useEffect(() => {
    if (!open || !cardId) return;
    const controller = new AbortController();
    getCardPrices(cardId, controller.signal)
      .then(({ prices }) => {
        if (!controller.signal.aborted) setResult({ cardId, variants: prices.map((price) => price.variant), preferred: VARIANT_OPTIONS.find((option) => prices.some((price) => price.variant === option.value && price.market !== null))?.value });
      })
      .catch(() => {
        // Sin evidencia se conserva la elección manual, sin deducir el acabado del arte.
        if (!controller.signal.aborted) setResult({ cardId, variants: [] });
      });
    return () => controller.abort();
  }, [cardId, open]);

  const current = result?.cardId === cardId ? result : null;
  const known = current?.variants ?? [];
  const options = current && known.length === 0 ? VARIANT_OPTIONS : VARIANT_OPTIONS.filter((option) => known.includes(option.value) || option.value === savedVariant);
  return { options, preferred: current?.preferred ?? options[0]?.value, loading: open && !current };
}
