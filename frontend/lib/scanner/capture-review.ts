import type { VisualIdentifyResponseDto } from '@/types/api';

export interface CaptureReview {
  image: string;
  source: 'camera' | 'gallery';
  capturedAt: string;
  runId: number;
  result: VisualIdentifyResponseDto | null;
  error: string | null;
}

export function captureReviewFile(review: CaptureReview, kind: 'image' | 'diagnostic'): { blob: Blob; filename: string } {
  const stem = `pokescan-${review.capturedAt.replace(/[:.]/g, '-')}-${review.runId}`;
  if (kind === 'diagnostic') {
    const diagnostic = { source: review.source, capturedAt: review.capturedAt, runId: review.runId, result: review.result, error: review.error };
    return {
      blob: new Blob([JSON.stringify({ schemaVersion: 1, ...diagnostic, imageFile: captureReviewFile(review, 'image').filename, expectedCardId: null }, null, 2)], { type: 'application/json' }),
      filename: `${stem}.json`,
    };
  }
  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(review.image);
  if (!match) throw new Error('No pudimos preparar el recorte para descargar.');
  // Decodificar sin canvas conserva los mismos bytes enviados a la API.
  const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
  const extension = match[1] === 'image/jpeg' ? 'jpg' : match[1].split('/')[1];
  return { blob: new Blob([bytes], { type: match[1] }), filename: `${stem}.${extension}` };
}

export function downloadCaptureReview(review: CaptureReview, kind: 'image' | 'diagnostic'): void {
  const { blob, filename } = captureReviewFile(review, kind);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Safari necesita que el URL siga disponible mientras inicia la descarga.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
