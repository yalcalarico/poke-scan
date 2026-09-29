import type { CardCondition, CardVariant } from '@/types/api';

/**
 * Fuente única de labels de variante y condición (docs/design-system.md §9.5).
 * Antes había tres tablas que no coincidían entre sí ("Holo" vs "Holofoil" vs
 * "1st Edition Normal"). Ningún componente define labels propios: importan de acá.
 */

export interface VariantOption {
  value: CardVariant;
  label: string;
  /** Para chips y contextos donde no entra el label largo. */
  short: string;
}

export interface ConditionOption {
  value: CardCondition;
  label: string;
  short: string;
}

export const VARIANT_OPTIONS: VariantOption[] = [
  { value: 'normal', label: 'Normal', short: 'Normal' },
  { value: 'holofoil', label: 'Holofoil', short: 'Holo' },
  { value: 'reverseHolofoil', label: 'Reversa holofoil', short: 'Rev. holo' },
  { value: 'firstEditionNormal', label: 'Primera edición normal', short: '1ª ed. normal' },
  { value: 'firstEditionHolofoil', label: 'Primera edición holofoil', short: '1ª ed. holo' },
  { value: 'firstEdition', label: 'Primera edición', short: '1ª ed.' },
  { value: 'unlimited', label: 'Sin límite', short: 'Sin límite' },
  { value: 'unlimitedHolofoil', label: 'Sin límite holofoil', short: 'Sin límite holo' },
];

export const CONDITION_OPTIONS: ConditionOption[] = [
  { value: 'NM', label: 'NM · Near Mint', short: 'NM' },
  { value: 'LP', label: 'LP · Lightly Played', short: 'LP' },
  { value: 'MP', label: 'MP · Moderately Played', short: 'MP' },
  { value: 'HP', label: 'HP · Heavily Played', short: 'HP' },
  { value: 'DM', label: 'DM · Damaged', short: 'DM' },
];

/** Lookups O(1). Un `Map` y no un `Record` porque la clave es de unión. */
const VARIANT_BY_VALUE = new Map<CardVariant, VariantOption>(
  VARIANT_OPTIONS.map((option) => [option.value, option]),
);
const CONDITION_BY_VALUE = new Map<CardCondition, ConditionOption>(
  CONDITION_OPTIONS.map((option) => [option.value, option]),
);

export { CONDITION_BY_VALUE, VARIANT_BY_VALUE };

/** Un valor desconocido se muestra crudo: es mejor "raro" que un label mentiroso. */
export function variantLabel(variant: CardVariant): string {
  return VARIANT_BY_VALUE.get(variant)?.label ?? variant;
}

export function variantShort(variant: CardVariant): string {
  return VARIANT_BY_VALUE.get(variant)?.short ?? variant;
}

export function conditionLabel(condition: CardCondition): string {
  return CONDITION_BY_VALUE.get(condition)?.label ?? condition;
}

export function conditionShort(condition: CardCondition): string {
  return CONDITION_BY_VALUE.get(condition)?.short ?? condition;
}
