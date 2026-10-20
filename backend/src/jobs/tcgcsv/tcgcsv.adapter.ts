import { CLASSIC_IDENTITIES } from './classic-identities.js';
export const TCGCSV_GROUPS = { me55: 24722, me55c: 24837, me2pt5: 24541 } as const;
export const TCGCSV_VARIANTS: Readonly<Record<string, string>> = {
  Normal: 'normal', Holofoil: 'holofoil', 'Reverse Holofoil': 'reverseHolofoil',
  '1st Edition Normal': 'firstEditionNormal', '1st Edition Holofoil': 'firstEditionHolofoil',
  Unlimited: 'unlimited', 'Unlimited Holofoil': 'unlimitedHolofoil',
};

export interface TcgcsvProduct { productId: number; groupId: number; name: string; number: string | null; language: string }
export interface TcgcsvPrice {
  productId: number; subTypeName: string; variant: string;
  low: number | null; mid: number | null; high: number | null; market: number | null;
}
export interface LocalTcgcsvCard { id: string; name: string; number: string; language: string | null; setId: string; printedTotal: number | null; externalId?: string }

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Formato TCGCSV inválido');
  return value as Record<string, unknown>;
}
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new Error('ID TCGCSV inválido');
  return value;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error('Texto TCGCSV inválido');
  return value;
}
function amount(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 9999999999.99) throw new Error('Importe TCGCSV inválido');
  return value;
}
function results(value: unknown): unknown[] {
  const envelope = object(value);
  if (envelope.success !== true || !Array.isArray(envelope.errors) || envelope.errors.length !== 0 || !Array.isArray(envelope.results) || envelope.results.length === 0 || envelope.results.length > 20000) throw new Error('Lote TCGCSV incompleto');
  if (envelope.totalItems !== undefined && envelope.totalItems !== envelope.results.length) throw new Error('Lote TCGCSV truncado');
  return envelope.results;
}
export function parseProducts(value: unknown, groupId: number): TcgcsvProduct[] {
  const ids = new Set<number>();
  return results(value).map((entry) => {
    const row = object(entry);
    const productId = integer(row.productId);
    if (ids.has(productId) || row.groupId !== groupId || row.categoryId !== 3) throw new Error('Producto TCGCSV fuera de grupo o duplicado');
    ids.add(productId);
    if (!Array.isArray(row.extendedData)) throw new Error('Metadata TCGCSV inválida');
    const fields = row.extendedData.map(object);
    const numbers = fields.filter((field) => field.name === 'Number');
    const languages = fields.filter((field) => field.name === 'Language');
    if (numbers.length > 1 || languages.length > 1) throw new Error('Metadata TCGCSV ambigua');
    return { productId, groupId, name: text(row.name), number: numbers.length === 1 ? text(numbers[0].value) : null,
      language: languages.length === 1 ? text(languages[0].value) : 'English' };
  });
}
export function parsePrices(value: unknown, products: readonly TcgcsvProduct[]): TcgcsvPrice[] {
  const ids = new Set(products.map((product) => product.productId));
  const keys = new Set<string>();
  return results(value).map((entry) => {
    const row = object(entry);
    const productId = integer(row.productId);
    const subTypeName = text(row.subTypeName);
    if (!ids.has(productId) || keys.has(`${productId}:${subTypeName}`) || (row.currency !== undefined && row.currency !== 'USD')) throw new Error('Precio TCGCSV incompatible');
    keys.add(`${productId}:${subTypeName}`);
    const variant = TCGCSV_VARIANTS[subTypeName];
    // Un subtipo nuevo se conserva como desconocido: jamás se convierte en normal.
    return { productId, subTypeName, variant: variant ?? '', low: amount(row.lowPrice), mid: amount(row.midPrice), high: amount(row.highPrice), market: amount(row.marketPrice) };
  });
}
function productName(product: TcgcsvProduct): string {
  if (product.number === null) return product.name;
  const suffix = ` - ${product.number}`;
  return product.name.endsWith(suffix) ? product.name.slice(0, -suffix.length) : product.name;
}
function normalized(value: string): string { return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en'); }
export function normalizedNumber(value: string): string | null {
  if (!/^[A-Za-z]*\d+(?:\/[A-Za-z]*\d+)?$/.test(value.trim())) return null;
  return value.trim().split('/').map((part) => part.replace(/^(\D*)0+(?=\d)/, '$1').toUpperCase()).join('/');
}
/** Classic exige una identidad revisada completa; no une números ambiguos. */
export function matchProducts(cards: readonly LocalTcgcsvCard[], products: readonly TcgcsvProduct[], groups: Readonly<Record<string, number>> = TCGCSV_GROUPS): Map<number, string> {
  const candidates = new Map<number, string[]>();
  for (const card of cards) {
    const group = groups[card.setId];
    if (group === undefined || card.language !== 'en') continue;
    let localNumber = normalizedNumber(card.number);
    if (!localNumber) continue;
    if (!localNumber.includes('/') && card.setId !== 'me55c' && card.printedTotal !== null) localNumber += `/${card.printedTotal}`;
    const matching = products.filter((product) => {
      if (card.setId === 'me55c') {
        const reviewed = CLASSIC_IDENTITIES.find((identity) => identity.cardId === card.id);
        return reviewed !== undefined && card.name === reviewed.localName && card.number === reviewed.localNumber
          && product.groupId === group && normalized(product.language) === 'english'
          && product.productId === reviewed.productId && product.name === reviewed.productName
          && product.number === reviewed.fullNumber
          && (card.externalId === undefined || card.externalId === String(reviewed.productId));
      }
      if (product.groupId !== group || product.number === null || normalized(product.language) !== 'english' || normalized(productName(product)) !== normalized(card.name)) return false;
      const remoteNumber = normalizedNumber(product.number);
      if (!remoteNumber) return false;
      return remoteNumber === localNumber && (card.externalId === undefined || card.externalId === String(product.productId));
    });
    if (matching.length !== 1) continue;
    const productId = matching[0].productId;
    candidates.set(productId, [...(candidates.get(productId) ?? []), card.id]);
  }
  return new Map([...candidates].filter(([, ids]) => ids.length === 1).map(([id, cardsForProduct]) => [id, cardsForProduct[0]]));
}

export function parseBuild(value: string, now = new Date()): Date {
  const trimmed = value.trim();
  // UTC explícito: no depende del huso del servidor ni acepta fechas normalizadas.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00|\+0000)$/.test(trimmed)) throw new Error('Build TCGCSV sin fecha UTC verificable');
  const date = new Date(trimmed);
  if (!Number.isFinite(date.getTime()) || date > now || date.toISOString().slice(0, 19) !== trimmed.slice(0, 19)) throw new Error('Build TCGCSV inválido');
  return date;
}
