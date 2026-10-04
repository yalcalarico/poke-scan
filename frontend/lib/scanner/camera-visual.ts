import { identifyVisual } from '@/lib/api/visual-identify';
import { getCardPrices } from '@/lib/api/cards';
import type { RecognizedCard, VisualIdentifyResponseDto } from '@/types/api';

/** La identidad viene del ranking visual; pedir precio no vuelve a elegir la carta. */
export async function recognizeCameraCard(image: string, signal: AbortSignal, onResult?: (result: VisualIdentifyResponseDto) => void): Promise<RecognizedCard | null> {
  const result = await identifyVisual({ image }, signal);
  signal.throwIfAborted();
  onResult?.(result);
  const first = result.candidates[0];
  if (!first) return null;
  const prices = await getCardPrices(first.card.id, AbortSignal.any([signal, AbortSignal.timeout(5000)]))
    .then((response) => response.prices).catch(() => []);
  signal.throwIfAborted();
  return {
    card: first.card,
    score: Math.max(0, Math.min(1, first.similarity)),
    rawScore: first.similarity,
    price: prices[0] ?? null,
    prices,
  };
}
