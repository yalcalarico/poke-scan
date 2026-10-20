import { Transform } from 'class-transformer';
import { IsString, IsUUID, ValidateIf } from 'class-validator';

export class AddItemHeadersDto {
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsString({ message: 'La clave de operación debe ser un UUID válido' })
  @IsUUID('all', { message: 'La clave de operación debe ser un UUID válido' })
  'idempotency-key'?: string;
}
