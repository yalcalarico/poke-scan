import type { CollectionItemDto, CollectionDto, CardVariant, CardCondition } from '@/types/api';
import type { Paginated } from '@/types/api';

export interface SharePreviewItem {
  card: {
    name: string;
    number: string;
    rarity: string | null;
    artist: string | null;
    imageSmall: string;
    setName: string | null;
    setSeries: string | null;
  };
  variant: CardVariant;
  condition: CardCondition;
  quantity: number;
  price: {
    market: number | null;
    currency: 'USD';
    provider: string | null;
    source: string;
    fetchedAt: string;
  } | null;
}

/** Proyecta el DTO privado a los campos que muestra el link público. */
export function toSharePreviewItem(item: CollectionItemDto): SharePreviewItem {
  const price = item.price?.currency === 'USD' && item.price.cardId === item.card.id && item.price.variant === item.variant
    ? {
        market: item.price.market !== null && Number.isFinite(item.price.market) ? item.price.market : null,
        currency: 'USD' as const,
        provider: item.price.provider,
        source: item.price.source,
        fetchedAt: item.price.fetchedAt,
      }
    : null;

  return {
    card: {
      name: item.card.name,
      number: item.card.number,
      rarity: item.card.rarity,
      artist: item.card.artist,
      imageSmall: item.card.imageSmall,
      setName: item.card.set?.name ?? null,
      setSeries: item.card.set?.series ?? null,
    },
    variant: item.variant,
    condition: item.condition,
    quantity: item.quantity,
    price,
  };
}

export function sampleCollection(
  collections: readonly CollectionDto[],
  scope: string,
): CollectionDto | null {
  if (scope === 'all') return collections.find((entry) => entry.itemCount > 0) ?? null;
  return collections.find((entry) => entry.id === scope) ?? null;
}

export async function loadSharePreviewItem(
  collectionId: string,
  signal: AbortSignal,
  loadItems: (
    id: string,
    options: { page: number; pageSize: number },
    signal: AbortSignal,
  ) => Promise<Paginated<CollectionItemDto>>,
): Promise<SharePreviewItem | null> {
  if (signal.aborted) return null;
  const result = await loadItems(collectionId, { page: 1, pageSize: 1 }, signal);
  if (signal.aborted) return null;
  const first = result.data[0];
  return first ? toSharePreviewItem(first) : null;
}

export function estimatedExpiration(expiresInDays: number, now = Date.now()): string {
  return formatExpiration(new Date(now + expiresInDays * 24 * 60 * 60 * 1000).toISOString());
}

export function formatExpiration(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
