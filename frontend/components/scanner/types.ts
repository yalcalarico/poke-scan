'use client';

import type { RecognizedCard } from '@/types/api';

/**
 * Estados de la pantalla de escaneo.
 *
 * `camera` y `processing` son el mismo lugar físico —la cámara vive— pero se
 * distinguen porque el shutter se deshabilita mientras hay un reconocimiento visual corriendo: la
 * cámara sigue mostrando la foto, lo que cambia es si se puede volver a
 * capturar. `organizing` abre el Sheet y desmonta la cámara.
 */
export type ScanStage = 'idle' | 'camera' | 'processing' | 'organizing' | 'error';

/** Fases de preparación y reconocimiento visual. */
export type ScanPhase = 'preparing' | 'recognizing' | 'searching';

/** `true` si en este estado la cámara está montada. */
export function isCameraStage(stage: ScanStage): boolean {
  return stage === 'camera' || stage === 'processing';
}

/** `true` si en este estado hay un `Sheet` por encima de todo lo demás. */
export function isSheetStage(stage: ScanStage): boolean {
  return stage === 'organizing';
}

/**
 * Una carta leída que queda esperando a que el usuario la organice.
 *
 * Conservamos una entrada por captura para corregir candidatos. La revisión
 * agrupa las cartas iguales y usa el número de capturas como cantidad inicial.
 */
export interface SessionEntry {
  /** Corrida que la produjo. Permite reemplazar la entrada si el usuario elige otro candidato. */
  runId: number;
  candidate: RecognizedCard;
}

/** Debajo de este score no estamos seguros: es `warning`, nunca `negative` (§2.3). */
export const CONFIDENT_SCORE = 0.75;

/** Tono del frame de la cámara según la confianza de la lectura. */
export type FrameTone = 'idle' | 'positive' | 'warning' | 'searching';

/**
 * El color del frame es información, no decoración: verde es "esto es lo que
 * leímos", ámbar es "no estamos seguros". Sin lectura todavía no hay color.
 */
export function frameToneFor(score: number | null | undefined): FrameTone {
  if (typeof score !== 'number' || !Number.isFinite(score)) return 'idle';
  return score >= CONFIDENT_SCORE ? 'positive' : 'warning';
}
