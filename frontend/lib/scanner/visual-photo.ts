"use client";

import {
  DEFAULT_CAPTURE_WIDTH,
  fileToImageData,
  type GalleryImageInput,
} from "@/components/scanner/image-input";
import { normalizeCardImageData, type NormalizedCard } from "./preprocess";

export interface VisualPhoto {
  source: GalleryImageInput;
  normalized: NormalizedCard;
  image: string;
  preparationMs: number;
}
export async function prepareVisualPhoto(
  file: File,
  alreadyFramed = false,
): Promise<VisualPhoto> {
  const start = performance.now();
  const source = await fileToImageData(file, DEFAULT_CAPTURE_WIDTH);
  try {
    const normalized: NormalizedCard = alreadyFramed
      ? { image: source.imageData, rect: null, rotation: 0, detected: false }
      : normalizeCardImageData(source.imageData);
    const canvas = document.createElement("canvas");
    canvas.width = normalized.image.width;
    canvas.height = normalized.image.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No pudimos preparar la foto para reconocer la carta.");
    context.putImageData(normalized.image, 0, 0);
    // PNG conserva los detalles del recorte para la verificación geométrica.
    const image = canvas.toDataURL("image/png");
    if (image.length > 8_388_640)
      throw new Error(
        "El recorte supera los 6 MiB. Probá con una foto más chica.",
      );
    return {
      source,
      normalized,
      image,
      preparationMs: performance.now() - start,
    };
  } catch (error) {
    source.highResolutionSource.close();
    throw error;
  }
}
