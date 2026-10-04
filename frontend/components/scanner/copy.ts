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
 * acompaña al reconocimiento visual y la pantalla de error.
 */

/** §10.3: los números en texto libre salen de `Intl`, nunca de interpolación. */
const ES_AR = new Intl.NumberFormat('es-AR');

export function formatCount(value: number): string {
  return ES_AR.format(value);
}

/**
 * Fases del reconocimiento visual. Las frases se conservan tal cual; lo que cambió es el chrome,
 * de card modal a barra inline.
 */
export const PHASE_HEADLINE: Record<ScanPhase, string> = {
  preparing: 'Preparando la foto…',
  recognizing: 'Reconociendo la carta con DINOv2…',
  searching: 'Buscando coincidencias visuales…',
};
export const PHASE_DETAIL: Record<ScanPhase, string> = {
  preparing: 'Ajustando el recorte de la carta.',
  recognizing: 'Mantené la carta nítida y sin reflejos.',
  searching: 'Comparando el dibujo con el índice del catálogo.',
};
export type CameraNoticeKind = CameraError | 'unsupported';
export const CAMERA_NOTICE_COPY: Record<CameraNoticeKind, { title: string; hint: string }> = {
  ...V1_CAMERA_ERROR_COPY,
  unsupported: {
    title: 'Este navegador no da acceso a la cámara',
    hint: 'Podés subir una foto de la carta o buscarla por nombre.',
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
