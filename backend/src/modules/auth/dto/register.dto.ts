import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @IsString()
  @Matches(/^[a-zA-Z0-9_]{3,20}$/, {
    message:
      'username solo puede contener letras, números y guion bajo (3-20 caracteres)',
  })
  username: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  displayName: string;
}
