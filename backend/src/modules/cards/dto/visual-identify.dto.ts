import { IsString, Matches, MaxLength } from 'class-validator';
import type { CardDto } from '../cards.service.js';

export class VisualIdentifyDto {
  @IsString({ message: 'La foto es obligatoria.' })
  @MaxLength(8_388_640, { message: 'La foto supera los 6 MiB.' })
  @Matches(
    /^data:image\/(jpeg|png|webp);base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
    { message: 'Usá una foto JPEG, PNG o WebP válida.' },
  )
  image: string;
}
export interface VisualIdentifyResponseDto {
  candidates: {
    card: CardDto;
    similarity: number;
    retrievalRank: number;
    geometry: VisualGeometry | null;
  }[];
  verificationMs: number;
  verificationAvailable: boolean;
  retrievalLimit: number;
  references: number;
  indexVersion: string;
  indexStale: boolean;
  collections: number;
  indexMs: number;
  cold: boolean;
  modelMs: number;
  inferenceMs: number;
  totalMs: number;
}
export interface VisualGeometry {
  matches: number;
  inliers: number;
  coverage: number;
  verified: boolean;
}
