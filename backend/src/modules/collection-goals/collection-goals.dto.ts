import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import { trimString } from '../collections/dto/create-collection.dto.js';

export class GoalTitleDto {
  @Transform(trimString)
  @IsString({ message: 'Escribí un objetivo de 1 a 120 caracteres.' })
  @Length(1, 120, { message: 'Escribí un objetivo de 1 a 120 caracteres.' })
  title: string;
}

export interface CollectionGoalDto {
  id: string;
  collectionId: string;
  title: string;
  isNext: boolean;
  createdAt: string;
  updatedAt: string;
}
