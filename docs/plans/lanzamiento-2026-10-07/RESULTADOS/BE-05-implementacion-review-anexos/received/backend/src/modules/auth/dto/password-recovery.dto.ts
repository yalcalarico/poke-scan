import { Matches, MaxLength, MinLength } from 'class-validator';

export class PasswordRecoveryDto {
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  token!: string;

  @MinLength(8)
  @MaxLength(72)
  newPassword!: string;
}
