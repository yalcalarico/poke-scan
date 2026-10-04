import corrections from './card-image-overrides.json' with { type: 'json' };

const overrides: Readonly<Record<string, string>> = corrections;

/** Mantener la referencia verificada aunque el proveedor vuelva a enviar la URL rota. */
export function correctedCardImages(
  cardId: string,
  images: { imageSmall: string; imageLarge: string },
): { imageSmall: string; imageLarge: string } {
  const url = Object.hasOwn(overrides, cardId) ? overrides[cardId] : undefined;
  return url ? { imageSmall: url, imageLarge: url } : images;
}
