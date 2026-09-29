import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
} from 'class-validator';

export class SyncCatalogDto {
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  force?: boolean;
}

export class RefreshPricesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  cardIds: string[];
}
