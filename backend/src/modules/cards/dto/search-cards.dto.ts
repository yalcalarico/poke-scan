import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const CARD_SORT_FIELDS = ['name', 'rarity', 'number', 'price'] as const;

export type CardSortField = (typeof CARD_SORT_FIELDS)[number];

export const CARD_SORT_DIRECTIONS = ['asc', 'desc'] as const;

export type CardSortDirection = (typeof CARD_SORT_DIRECTIONS)[number];

/** Campo contra el que matchea `q`. Espeja los modos de la pantalla de búsqueda. */
export const CARD_SEARCH_FIELDS = ['name', 'number', 'artist'] as const;

export type CardSearchField = (typeof CARD_SEARCH_FIELDS)[number];

export class SearchCardsDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  /**
   * Campo contra el que matchea `q`. El default es `name` porque es lo que
   * venía implícito antes de que existiera el parámetro.
   *
   * Los tres modos no se comportan igual, y es a propósito:
   *
   * - `name` y `artist` son **texto**: matching por substring (`ILIKE %q%`),
   *   trigram por tolerancia a typos y score de relevancia (prefijo > substring >
   *   similitud). Requieren ≥3 caracteres para el trigram.
   * - `number` es un **token corto** (`"4"`, `"4a"`, `"TG02"`, `"4/102"`), no
   *   texto: el matching es de **igualdad** (ver `buildNumberCondition`). Un
   *   `ILIKE '%4%'` devolvería también el 40, el 104 y el 4a, que es
   *   justamente lo que el usuario **no** pidió. No hay trigram ni score
   *   porque sobre `"4"` la tolerancia a typos no significa nada.
   */
  @IsOptional()
  @IsIn(CARD_SEARCH_FIELDS)
  searchBy?: CardSearchField = 'name';

  @IsOptional()
  @IsString()
  setId?: string;

  @IsOptional()
  @IsString()
  rarity?: string;

  @IsOptional()
  @IsString()
  supertype?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @IsOptional()
  @IsIn(CARD_SORT_FIELDS)
  sort?: CardSortField = 'name';

  /**
   * Sentido del `sort`, para que "más caras primero" sea posible.
   *
   * **Solo aplica a `sort`**: cuando viene `q` el orden es por score de
   * relevancia, que **no es invertible** (darle la vuelta pone lo peor
   * primero, que no es "último" sino "menos parecido"). Por eso con `q` el
   * parámetro se ignora en silencio y el orden es siempre por score
   * descendente. No lo prometas en la UI como si haciese algo: solo tiene
   * efecto sin texto de búsqueda.
   *
   * El desempate (`c.name`, `c.id`) queda **siempre ascendente** en ambos
   * sentidos: es solo para que la paginación sea estable, y un orden
   * "canónico" no debería depender de la dirección que eligió el usuario.
   */
  @IsOptional()
  @IsIn(CARD_SORT_DIRECTIONS)
  direction?: CardSortDirection = 'asc';
}
