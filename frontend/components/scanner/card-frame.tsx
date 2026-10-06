'use client';

import { cn } from '@/lib/cn';
import type { BoxRect } from '@/lib/scanner/camera';

import type { FrameTone } from './types';

const TONE_CLASSES: Record<FrameTone, { ring: string; glow: string; bracket: string }> = {
  searching: {
    ring: 'ring-negative',
    glow: '',
    bracket: 'text-negative',
  },
  // Sin lectura todavía no hay color: solo la guía. Un verde antes de saber
  // qué se leyó sería mentir sobre la confianza.
  idle: {
    ring: 'ring-on-media-text/30',
    glow: '',
    bracket: 'text-on-media-text/60',
  },
  positive: {
    ring: 'ring-positive',
    glow: 'ring-positive/20',
    bracket: 'text-positive',
  },
  // `warning` y no `negative`: el usuario puede igual agregar la carta (§2.3).
  warning: {
    ring: 'ring-warning',
    glow: 'ring-warning/20',
    bracket: 'text-warning',
  },
};

export interface CardFrameProps {
  /** Rectángulo guía en px CSS, relativo al `<video>`. `null` hasta medir. */
  rect: BoxRect | null;
  tone: FrameTone;
}

/** Largo del bracket en px. */
const BRACKET = 26;

/** Una sola guía mantiene el mismo encuadre al cambiar el estado de lectura. */
export function CardFrame({ rect, tone }: CardFrameProps) {
  if (!rect) return null;

  const toneClasses = TONE_CLASSES[tone];

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute"
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
    >
      <div className={cn('absolute inset-0 rounded-2xl ring-2', toneClasses.ring)} />
      {toneClasses.glow ? (
        <div className={cn('absolute -inset-2 rounded-2xl ring-8', toneClasses.glow)} />
      ) : null}

      <div className={cn('absolute inset-0', toneClasses.bracket)}>
        <span
          className="absolute left-0 top-0 border-l-2 border-t-2"
          style={{ width: BRACKET, height: BRACKET, borderTopLeftRadius: 8 }}
        />
        <span
          className="absolute right-0 top-0 border-r-2 border-t-2"
          style={{ width: BRACKET, height: BRACKET, borderTopRightRadius: 8 }}
        />
        <span
          className="absolute bottom-0 left-0 border-b-2 border-l-2"
          style={{ width: BRACKET, height: BRACKET, borderBottomLeftRadius: 8 }}
        />
        <span
          className="absolute bottom-0 right-0 border-b-2 border-r-2"
          style={{ width: BRACKET, height: BRACKET, borderBottomRightRadius: 8 }}
        />
      </div>
    </div>
  );
}
