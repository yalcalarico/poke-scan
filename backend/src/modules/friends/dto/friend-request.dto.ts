import { Transform } from 'class-transformer';
import { IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';
import {
  toBoolean,
  trimString,
} from '../../collections/dto/create-collection.dto.js';

/** Body de `POST /friends/request`: el destinatario se busca por username exacto. */
export class FriendRequestDto {
  @Transform(trimString)
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  username: string;
}

/**
 * Body de `POST /friends/:requesterId/respond`.
 * `accept` llega como string desde query/form y se normaliza a boolean, igual
 * que los flags de CreateCollectionDto.
 */
export class FriendRespondDto {
  @Transform(toBoolean)
  @IsBoolean()
  accept: boolean = false;
}
