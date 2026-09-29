import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
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

  /**
   * Código de set impreso en la esquina inferior izquierda, ej "30C".
   *
   * Lo manda el cliente porque solo el cliente sabe dónde está esa caja en la
   * foto: en el backend no hay con qué filtrar por posición. **No** se extrae de
   * `lines` a propósito, y hay medición de por qué: sobre las 8 fixtures reales
   * de OCR, buscar cualquier token de 3 caracteres que sea un código de set dio
   * 22 falsos positivos y 0 verdaderos (EVO sale de "Evolves from", PAR/CRE/FLI
   * de basura del OCR). Es señal solo con una banda medida, que es la fase 8.1
   * de `docs/files/08-VERSION-DISAMBIGUATION.md`.
   *
   * While no llegue, el campo se manda ausente y la señal no vota.
   */
  @IsOptional()
  @IsString()
  @MaxLength(8)
  @Matches(/^[A-Za-z0-9-]+$/)
  setCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number = DEFAULT_IDENTIFY_LIMIT;
}
