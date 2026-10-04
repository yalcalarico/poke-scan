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
  /**
   * Sube en cada lectura nueva y **obliga a remontar** el halo, que es lo que
   * re-dispara la animación de un solo disparo. Con una `key` en el `div` en
   * lugar de una clase que se agrega y se saca, el pulso no se repite cuando el
   * tono no cambia entre dos lecturas.
   */
  pulseKey: number;
}

/** Largo del bracket en px. */
const BRACKET = 26;

/**
 * El marco de encuadre.
 *
 * Lo que se ve es un `rounded-2xl` con `ring-2` y un halo de `ring-8` al 20 %,
 * más cuatro brackets fijos en las esquinas (§4.2: esquinas redondeadas sobre
 * un wrapper redondeado, nunca esquinas sueltas). Antes eran "4 esquinas
 * con borde dashed blanco", que no comunicaba confianza.
 *
 * El **color viene de la confianza** de la lectura, no de que haya una carta
 * en el cuadro: verde es "esto es lo que leímos", ámbar es "no estamos
 * seguros", y el usuario tiene que poder ver la diferencia antes de tocar el
 * obturador.
 *
 * El pulso es `animate-pop-in`, un disparo, no un loop. No hace falta su
 * versión `motion-reduce:` el bloque global de `prefers-reduced-motion` en
 * `globals.css` (§5.3) lo apaga con todos los demás.
 */
export function CardFrame({ rect, tone, pulseKey }: CardFrameProps) {
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

      {pulseKey > 0 ? (
        <div
          key={pulseKey}
          className="absolute -inset-3 animate-pop-in rounded-2xl ring-2 ring-on-media-text/40"
        />
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
