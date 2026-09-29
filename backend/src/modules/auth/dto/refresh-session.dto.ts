import { IsNotEmpty, IsString, IsOptional, MaxLength } from 'class-validator';

export class RefreshSessionDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceInfo?: string;
}
