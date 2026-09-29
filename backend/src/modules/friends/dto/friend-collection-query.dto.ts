import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { trimString } from '../../collections/dto/create-collection.dto.js';

/**
 * Query de `GET /friends/:friendId/collection?collectionId=`.
 *
 * Opcional a propósito: si no viene, el service resuelve la colección default
 * del amigo (o la primera, si no tiene ninguna marcada como default).
 */
export class FriendCollectionQueryDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(64)
  collectionId?: string;

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
}
