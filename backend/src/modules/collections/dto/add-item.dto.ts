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
import { CARD_CONDITIONS, CARD_VARIANTS } from './card-variant.js';
import { toBoolean, trimString } from './create-collection.dto.js';

export class AddItemDto {
  @Transform(trimString)
  @IsString()
  @MaxLength(64)
  cardId: string;

  @IsOptional()
  @IsIn(CARD_VARIANTS)
  variant?: (typeof CARD_VARIANTS)[number] = 'normal';

  @IsOptional()
  @IsIn(CARD_CONDITIONS)
  condition?: (typeof CARD_CONDITIONS)[number] = 'NM';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999)
  quantity?: number = 1;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(500)
  notes?: string;

  /**
   * Si la carta queda marcada para intercambio.
   *
   * Este campo faltaba, y el efecto era silencioso: el formulario de alta tiene
   * el checkbox "Disponible para intercambio", el usuario lo tilda, la carta
   * entra a la colección… y la marca no se guardaba. Con `whitelist: true` el
   * campo desconocido se descarta sin error, así que ni el cliente ni el usuario
   * se enteraban de nada: la carta aparecía en la colección pero no en el filtro
   * "para intercambio", que además es server-side.
   *
   * La única forma de marcarla era abrir la carta y editarla, un paso extra que
   * el usuario no tiene por qué conocer.
   */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isForTrade?: boolean;
}
