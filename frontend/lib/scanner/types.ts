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
  setHint: string | null;
  /**
   * Código de set impreso abajo a la izquierda, ej `"30C"`.
   *
   * Siempre `null`: depende de medir la banda primero (fase 8.1 de
   * `docs/files/08-VERSION-DISAMBIGUATION.md`). No se deduce de `lines` a
   * propósito — medido sobre las fixtures reales, buscar cualquier token de 3
   * caracteres que sea un código de set da 22 falsos positivos y 0 verdaderos.
   */
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
