import { IsOptional, IsString, MaxLength } from 'class-validator';

export class BrowserSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceInfo?: string;
}
