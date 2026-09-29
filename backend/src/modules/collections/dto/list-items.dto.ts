import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
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
}
