'use client';

import {
  CAMERA_ERROR_COPY as V1_CAMERA_ERROR_COPY,
  cameraErrorCopy,
} from '@/components/scanner/camera-messages';
import type { CameraError } from '@/lib/scanner/types';

import type { ScanPhase } from './types';

/**
 * Copy de la pantalla. Vive en un archivo y no esparcido por los componentes
 * porque hay dos lugares que necesitan las mismas frases: la barra inline que
 * acompaña al OCR y la pantalla de error.
 */

/** §10.3: los números en texto libre salen de `Intl`, nunca de interpolación. */
const ES_AR = new Intl.NumberFormat('es-AR');

export function formatCount(value: number): string {
  return ES_AR.format(value);
}

/**
 * Fases del OCR. Las frases se conservan tal cual; lo que cambió es el chrome,
 * de card modal a barra inline.
 */
export const PHASE_HEADLINE: Record<ScanPhase, string> = {
  preparing: 'Leyendo la carta…',
  'ocr-boot': 'Preparando el OCR (la primera vez tarda unos segundos)…',
  recognizing: 'Leyendo el nombre y el número…',
  searching: 'Buscando coincidencias en el catálogo…',
};

/** Detalle de la fase, en `sr-only`: la barra inline no tiene lugar para dos líneas. */
export const PHASE_DETAIL: Record<ScanPhase, string> = {
  preparing: 'Ajustando la foto y preparando las variantes de lectura.',
  'ocr-boot':
    'Estamos bajando el motor de OCR y los datos del idioma inglés. Después queda cacheado en el navegador.',
  recognizing: 'La carta tiene que estar nítida y sin reflejos.',
  searching: 'La búsqueda puede tardar un momento con el catálogo completo.',
};

/**
 * Fallas de cámara sin caso propio que antes caían en un mensaje genérico.
 *
 * - `unsupported`: el navegador no expone `getUserMedia`. Antes era un `Notice`
 *   suelto en la página; acá es un caso más de la misma tabla, porque desde el
 *   punto de vista del usuario es la misma cosa que un permiso denegado: no hay
 *   cámara.
 * - `ocr-unavailable`: el worker de Tesseract no arrancó. Casi siempre es la
 *   primera vez sin conexión (los assets son ~14 MB), y el mensaje tiene que
 *   decir eso y ofrecer la salida: buscar a mano.
 */
export type CameraNoticeKind = CameraError | 'unsupported' | 'ocr-unavailable';

export const CAMERA_NOTICE_COPY: Record<CameraNoticeKind, { title: string; hint: string }> = {
  ...V1_CAMERA_ERROR_COPY,
  unsupported: {
    title: 'Este navegador no da acceso a la cámara',
    hint: 'Le falta la API de cámara del navegador. Podés subir una foto de la carta o buscarla por nombre: las dos opciones funcionan igual.',
  },
  'ocr-unavailable': {
    title: 'No pudimos iniciar el motor de lectura',
    hint: 'La primera lectura descarga el motor de OCR y necesita conexión. Revisá tu conexión y reintentá; mientras tanto podés buscar la carta a mano por nombre.',
  },
};

export function cameraNoticeCopy(kind: CameraNoticeKind) {
  return CAMERA_NOTICE_COPY[kind];
}

/**
 * `cameraErrorCopy` re-exportada con el nombre del archivo nuevo. La tabla de
 * arriba ya la incluye, pero dejarla exportada deja explícito que el copy es el
 * que se está usando y no una copia.
 */
export { cameraErrorCopy };
