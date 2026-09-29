import { toImageData, type ImageInput } from './preprocess';

/**
 * Vuelca los recortes intermedios del escaneo a disco para poder mirarlos.
 *
 * Cada corte que hace el pipeline (la foto original, la carta detectada y
 * rotada, las 3 variantes de pre-procesado y las 3 pasadas de la banda del
 * nombre) se manda como PNG a un endpoint del backend que lo escribe en un
 * directorio temporal.
 *
 * Va apagado salvo que esté `NEXT_PUBLIC_SCAN_CAPTURE=1` en el `.env`, porque
 * son 8 PNGs por escaneo y a nadie le sirve en producción. Los errores se
 * ignoran: capturar imágenes nunca puede romper un escaneo, y en producción el
 * endpoint ni existe.
 */
const ENABLED = process.env.NEXT_PUBLIC_SCAN_CAPTURE === '1';

const MAX_CAPTURE_WIDTH = 1000;

// La base del .env ya trae el /api (mismo criterio que el resto de la app).
const CAPTURE_PATH = '/jobs/scan-capture';

export function isScanCaptureEnabled(): boolean {
  return ENABLED;
}

function captureDataUrl(source: ImageInput): string {
  const imageData = toImageData(source);
  const scale = Math.min(1, MAX_CAPTURE_WIDTH / imageData.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(imageData.width * scale));
  canvas.height = Math.max(1, Math.round(imageData.height * scale));

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Sin canvas 2d para capturar');
  // El destino es más chico: putImageData no escala, así que primero se dibuja
  // la imagen y después se recorta al tamaño del canvas.
  if (scale === 1) {
    ctx.putImageData(imageData, 0, 0);
  } else {
    const full = document.createElement('canvas');
    full.width = imageData.width;
    full.height = imageData.height;
    full.getContext('2d')?.putImageData(imageData, 0, 0);
    ctx.drawImage(full, 0, 0, canvas.width, canvas.height);
  }

  return canvas.toDataURL('image/png');
}

/** Fire-and-forget: manda el recorte y no espera. */
export function captureStep(run: string, step: string, source: ImageInput): void {
  if (!ENABLED) return;

  try {
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
    void fetch(`${base}${CAPTURE_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ run, step, png: captureDataUrl(source) }),
    }).catch(() => {
      // El endpoint es de desarrollo: si no está, no pasa nada.
    });
  } catch {
    // Sin canvas no hay captura, y está bien.
  }
}
