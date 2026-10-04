export interface ScannedCapture {
  blob: Blob;
  width: number;
  height: number;
  dataUrl?: string;
  /** true si la foto se recortó al rectángulo de la carta. */
  cropped?: boolean;
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
