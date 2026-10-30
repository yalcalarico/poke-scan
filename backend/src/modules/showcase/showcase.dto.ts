import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateShowcaseDto {
  @IsIn(['value', 'personal'])
  mode!: 'value' | 'personal';

  @IsArray()
  @ArrayMaxSize(60)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  cardIds!: string[];
}
