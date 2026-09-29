import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateShareDto {
  /** Si viene vacío/null se comparten TODAS las colecciones del usuario. */
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(64)
  collectionId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  expiresInDays?: number;
}
