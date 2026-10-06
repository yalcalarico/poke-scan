import { listItems } from '@/lib/api/collections';
import { conditionLabel, variantLabel } from '@/lib/variants';
import type { CollectionItemDto } from '@/types/api';

function csvCell(value: string | number | null): string {
  const raw = value === null ? '' : String(value);
  // Evita interpretar nombres o notas como fórmulas al abrir el archivo.
  const safe = /^\s*[=+@-]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function collectionCsv(items: readonly CollectionItemDto[]): string {
  const rows: (string | number | null)[][] = [
    ['ID', 'Carta', 'Set', 'Número', 'Variante', 'Condición', 'Cantidad', 'Precio unitario USD', 'Total USD', 'Para intercambio', 'Notas'],
    ...items.map((item) => {
      const market = item.price?.market ?? null;
      return [item.card.id, item.card.name, item.card.set?.name ?? '', item.card.number,
        variantLabel(item.variant), conditionLabel(item.condition), item.quantity,
        market, market === null ? null : market * item.quantity, item.isForTrade ? 'Sí' : 'No', item.notes];
    }),
  ];
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(';')).join('\r\n');
}

/** Exporta la colección completa, aunque la grilla tenga filtros o páginas sin cargar. */
export async function exportCollectionCsv(collectionId: string, signal?: AbortSignal): Promise<string> {
  const items: CollectionItemDto[] = [];
  let page = 1;
  while (true) {
    const result = await listItems(collectionId, { page, pageSize: 200 }, signal);
    items.push(...result.data);
    if (page >= result.totalPages) break;
    page += 1;
  }
  return collectionCsv(items);
}
