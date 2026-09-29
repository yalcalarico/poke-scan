import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const DEFAULT_IDENTIFY_LIMIT = 8;

export class IdentifyDto {
  /**
   * Líneas CRUDAS devueltas por el OCR del cliente. El backend las fuzzy-matchea
   * contra el catálogo completo: no necesitamos que el cliente adivine el nombre.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @IsString({ each: true })
  lines?: string[];

  /** Mejor guess del cliente (opcional): se trata como un candidato más. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  /** Número de carta del OCR. Poco confiable: solo se usa como bonus. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  number?: string;

  /** Nombre del set, ej "Base". */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  setHint?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number = DEFAULT_IDENTIFY_LIMIT;
}
