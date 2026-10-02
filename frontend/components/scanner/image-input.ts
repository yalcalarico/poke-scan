'use client';

import { DEFAULT_CAPTURE_WIDTH } from '@/lib/scanner/camera';
import type { ScannedCapture } from '@/lib/scanner/types';
import type { ImageInput } from '@/lib/scanner/preprocess';

export interface GalleryImageInput {
  imageData: ImageData;
  /** Se conserva hasta terminar el OCR para rescatar detalle del pie. */
  highResolutionSource: ImageBitmap;
}

export function isGalleryImageInput(input: ImageInput | GalleryImageInput): input is GalleryImageInput {
  return 'imageData' in input && 'highResolutionSource' in input;
}

/**
 * Los dos caminos de entrada del escáner (obturador y galería) convergen en
 * `ImageInput`, que es lo que quiere `scanCardImage`.
 *
 * Vive acá y no en `lib/scanner/` a propósito: `lib/scanner/` es el pipeline
 * compartido y este archivo es glue de la pantalla. La matemática del recorte
 * —que sí es difícil— está en `lib/scanner/camera.ts` y no se toca.
 */

function drawToImageData(bitmap: ImageBitmap): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo crear el contexto 2D.');
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** La imagen grande se conserva sólo para leer el pie; el OCR general usa la versión reducida. */
export async function fileToImageData(file: File, maxWidth: number): Promise<GalleryImageInput> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxWidth / bitmap.width);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo crear el contexto 2D.');
    ctx.drawImage(bitmap, 0, 0, width, height);
    return {
      imageData: ctx.getImageData(0, 0, width, height),
      highResolutionSource: bitmap,
    };
  } catch (error) {
    bitmap.close();
    throw error;
  }
}

/**
 * Captura de la cámara. Ya viene recortada al rectángulo de la carta
 * (`captureFrame` lo hace), así que no se reescala: volver a hacerlo acá
 * tiraría resolución dos veces por nada.
 */
export async function captureToImageData(capture: ScannedCapture): Promise<ImageInput> {
  const bitmap = await createImageBitmap(capture.blob);
  try {
    return drawToImageData(bitmap);
  } finally {
    bitmap.close();
  }
}

export { DEFAULT_CAPTURE_WIDTH };
