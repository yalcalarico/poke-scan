import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
// Mismos cuatro valores que `GET /cards/search?sort=`, para que el selector de
// orden sea uno solo en la app en vez de dos listas que se desincronizan.
import { CARD_SORT_FIELDS, type CardSortField } from '../../cards/dto/search-cards.dto.js';
import { toBoolean, trimString } from './create-collection.dto.js';

export class ListItemsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number = 50;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  duplicatesOnly?: boolean = false;

  /**
   * Solo items marcados para intercambiar (`i."isForTrade" = true`).
   *
   * Existe en el servidor y no solo en el cliente: filtrar esto en la página
   * ya cargada da "0 resultados" en la 3 si la colección tiene 200 items
   * marcados. Los dos filtros se componen (`duplicatesOnly` + `forTradeOnly`
   * devuelven los repetidos que además están para trade) y el `count` usa el
   * mismo `where` que los datos, así que el `total` y la página no mienten.
   */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  forTradeOnly?: boolean = false;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(64)
  setId?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(80)
  search?: string;

  /**
   * Orden del listado. **Sin default**: si no viene, el orden es
   * `addedAt DESC, id ASC` (en el orden en que se fueron agregando), que es lo
   * que la app muestra por defecto y lo que espera el resto de las pantallas.
   *
   * Los cuatro valores son los del catálogo (`CARD_SORT_FIELDS`), pero acá cada
   * uno ordena **items**, no cartas:
   *
   * | `sort` | Ordena por | Nota |
   * |---|---|---|
   * | `name` | `card.name ASC` | |
   * | `rarity` | `card.rarity ASC NULLS LAST` | las cartas sin rareza al final |
   * | `number` | parte numérica de `card.number` | 4 antes que 10 antes que 4a |
   * | `price` | valor del item: `quantity × market` de su variante | más caros primero |
   *
   * `price` sale del `card_prices` local por el **mismo** join que usa
   * `totalValueUsd` (`latestMarketPriceJoin`): no pide nada a tcgdex ni a
   * pokemontcg.io, así que ordenar por precio no gasta rate limit.
   */
  @IsOptional()
  @IsIn(CARD_SORT_FIELDS)
  sort?: CardSortField;
}
