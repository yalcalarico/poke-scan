/**
 * Traducciones de los metadatos de carta. Centralizadas acá para que el `Badge`
 * de supertype no tenga que traducir inline, y para que una etiqueta no cambie
 * entre pantallas.
 */

/**
 * Los tipos llegan textualmente de la fuente, y la fuente cambió: pokemontcg.io
 * manda `"Fire"` y TCGdex `"fire"`. La clave es la del enum en minúscula y la
 * búsqueda normaliza, así que las dos formas funcionan con la misma tabla.
 */
export const TYPE_LABELS: Record<string, string> = {
  fire: 'Fuego',
  grass: 'Planta',
  water: 'Agua',
  lightning: 'Rayo',
  psychic: 'Psíquico',
  fighting: 'Lucha',
  darkness: 'Sombra',
  metal: 'Metal',
  dragon: 'Dragón',
  colorless: 'Incolore',
};

const SUPERTYPE_LABELS: Record<string, string> = {
  pokemon: 'Pokémon',
  trainer: 'Entrenador',
  energy: 'Energía',
};

export function typeLabel(type: string): string {
  return TYPE_LABELS[type.trim().toLowerCase()] ?? type;
}

export function supertypeLabel(supertype: string): string {
  return SUPERTYPE_LABELS[supertype.trim().toLowerCase()] ?? supertype;
}

/**
 * Los subtypes vienen como `"Stage 1"` o `"Stage → 1"`. Solo cambia la etapa: el
 * resto (`EX`, `GX`, `V`, `Legend`, `Shining`) son siglas o palabras que en
 * español se dicen igual y no se tocan.
 */
export function subtypeLabel(subtype: string): string {
  return subtype.replace(/^Stage\s*[→-]?\s*(.+)$/i, 'Etapa $1');
}

export function subtypeLabels(subtypes: readonly string[]): string[] {
  return subtypes.map(subtypeLabel);
}
