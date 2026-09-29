import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { trimString } from '../../collections/dto/create-collection.dto.js';

export const USER_SEARCH_MAX_PAGE_SIZE = 50;

/**
 * Búsqueda de usuarios para el sistema de amigos.
 *
 * `q` es opcional a nivel de DTO, pero el service exige mínimo 2 caracteres:
 * sin ese piso un `?q=` vacío sería un endpoint para enumerar toda la base de
 * usuarios. `pageSize` está topado para que no se pueda pedir la tabla entera
 * de un solo request.
 */
export class SearchUsersDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(USER_SEARCH_MAX_PAGE_SIZE)
  pageSize?: number = 20;
}
