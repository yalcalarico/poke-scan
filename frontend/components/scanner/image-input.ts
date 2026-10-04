'use client';

import { DEFAULT_CAPTURE_WIDTH } from '@/lib/scanner/camera';

export interface GalleryImageInput {
  imageData: ImageData;
  /** Bitmap original: quien prepara el recorte debe liberarlo con close(). */
  highResolutionSource: ImageBitmap;
}

/** Decodifica una foto y la reduce conservando color y orientación del archivo. */
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

export { DEFAULT_CAPTURE_WIDTH };
