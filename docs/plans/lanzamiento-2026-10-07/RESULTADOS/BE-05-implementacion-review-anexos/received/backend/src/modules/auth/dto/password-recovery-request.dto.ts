import { IsEmail, MaxLength } from 'class-validator';

export class PasswordRecoveryRequestDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
