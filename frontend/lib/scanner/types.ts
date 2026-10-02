export interface ScannedCapture {
  blob: Blob;
  width: number;
  height: number;
  dataUrl?: string;
  /** true si la foto se recortó al rectángulo de la carta. */
  cropped?: boolean;
}

export interface OcrLine {
  text: string;
  confidence: number;
  words?: Array<{ text: string; confidence: number }>;
}

export interface OcrResult {
  text: string;
  lines: OcrLine[];
  confidence: number;
}

export interface ParsedScan {
  /** Raw OCR lines; the backend matches them against the catalog. */
  lines: string[];
  /** Best-effort card name guess (heuristic, no catalog available client-side). */
  nameGuess: string | null;
  numberGuess: string | null;
  /** Número/total impresos si el lector validó la línea completa del pie. */
  printedNumberGuess?: string | null;
  setHint: string | null;
  /** Código validado contra el catálogo y leído exclusivamente en el pie. */
  setCode: string | null;
  /** 0..1 */
  confidence: number;
}

export type CameraError =
  | 'permission-denied'
  | 'no-camera'
  | 'camera-busy'
  | 'insecure-context'
  | 'unknown';

export class CameraErrorException extends Error {
  readonly kind: CameraError;

  constructor(kind: CameraError, message?: string) {
    super(message ?? `camera error: ${kind}`);
    this.name = 'CameraErrorException';
    this.kind = kind;
  }
}
