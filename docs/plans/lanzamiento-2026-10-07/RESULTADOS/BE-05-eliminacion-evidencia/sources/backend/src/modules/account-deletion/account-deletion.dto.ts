import { Equals, IsString, MaxLength, MinLength } from 'class-validator';
export class AccountDeletionDto {
  @IsString() @MinLength(8) @MaxLength(72) password!: string;
  @IsString() @Equals('ELIMINAR') confirmation!: 'ELIMINAR';
}
export interface AccountDeletionResponseDto { success: true }
export interface AccountDeletionAvailabilityDto { available: boolean }
