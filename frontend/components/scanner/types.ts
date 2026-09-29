'use client';

import type { IdentifiedCandidateDto } from '@/types/api';

/**
 * Estados de la pantalla de escaneo.
 *
 * `camera` y `processing` son el mismo lugar físico —la cámara vive— pero se
 * distinguen porque el shutter se deshabilita mientras hay un OCR corriendo: la
 * cámara sigue mostrando la foto, lo que cambia es si se puede volver a
 * capturar. `results` y `organizing` son los dos `Sheet`, y en ninguno de los
 * dos hay cámara montada (ver `camera-view.tsx`).
 */
export type ScanStage = 'idle' | 'camera' | 'processing' | 'results' | 'organizing' | 'error';

/** Fases que reporta `lib/scanner/pipeline` a través del `logger` del OCR. */
export type ScanPhase = 'preparing' | 'ocr-boot' | 'recognizing' | 'searching';

/** `true` si en este estado la cámara está montada. */
export function isCameraStage(stage: ScanStage): boolean {
  return stage === 'camera' || stage === 'processing';
}

/** `true` si en este estado hay un `Sheet` por encima de todo lo demás. */
export function isSheetStage(stage: ScanStage): boolean {
  return stage === 'results' || stage === 'organizing';
}

/**
 * Una carta leída que queda esperando a que el usuario la organice.
 *
 * Una entrada por **captura**, no por carta: escanear dos veces la misma carta
 * son dos entradas. Es lo predecible —`Organizar (2)` significa "leí 2 cosas"—
 * y el usuario ajusta la cantidad desde la fila si de verdad quiere 2 copias.
 */
export interface SessionEntry {
  /** Corrida que la produjo. Permite reemplazar la entrada si el usuario elige otro candidato. */
  runId: number;
  candidate: IdentifiedCandidateDto;
}

/** Debajo de este score no estamos seguros: es `warning`, nunca `negative` (§2.3). */
export const CONFIDENT_SCORE = 0.75;

/** Tono del frame de la cámara según la confianza de la lectura. */
export type FrameTone = 'idle' | 'positive' | 'warning';

/**
 * El color del frame es información, no decoración: verde es "esto es lo que
 * leímos", ámbar es "no estamos seguros". Sin lectura todavía no hay color.
 */
export function frameToneFor(score: number | null | undefined): FrameTone {
  if (typeof score !== 'number' || !Number.isFinite(score)) return 'idle';
  return score >= CONFIDENT_SCORE ? 'positive' : 'warning';
}
