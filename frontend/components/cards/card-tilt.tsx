'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

import styles from './card-tilt.module.css';

interface CardTiltProps {
  children: ReactNode;
  variant?: 'detail' | 'catalog';
  className?: string;
}

/** Isla decorativa: la imagen sigue llegando en el HTML del servidor. */
export function CardTilt({ children, variant = 'detail', className }: CardTiltProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const limit = variant === 'detail' ? 8 : 3;
    let frame = 0;
    let touch: { id: number; x: number; y: number } | null = null;
    const reset = () => {
      cancelAnimationFrame(frame);
      touch = null;
      root.removeAttribute('data-active');
      root.style.removeProperty('--tilt-x');
      root.style.removeProperty('--tilt-y');
      root.style.removeProperty('--glare-x');
    };
    const paint = (x: number, y: number) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        root.style.setProperty('--tilt-x', `${-y * limit}deg`);
        root.style.setProperty('--tilt-y', `${x * limit}deg`);
        root.style.setProperty('--glare-x', `${50 + x * 30}%`);
        root.setAttribute('data-active', '');
      });
    };
    const down = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' || variant !== 'detail' || !event.isPrimary) return;
      touch = { id: event.pointerId, x: event.clientX, y: event.clientY };
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch') {
        if (!touch || touch.id !== event.pointerId) return;
        const dx = event.clientX - touch.x;
        const dy = event.clientY - touch.y;
        // Un gesto vertical pertenece al scroll, incluso si arrancó sobre el arte.
        if (Math.abs(dy) > Math.abs(dx)) { reset(); return; }
        if (Math.abs(dx) < 6) return;
        paint(Math.max(-1, Math.min(1, dx / (root.clientWidth / 2 || 1))), 0);
        return;
      }
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
      const bounds = root.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const clamp = (value: number) => Math.max(-1, Math.min(1, value));
      paint(clamp((event.clientX - bounds.left) / bounds.width * 2 - 1),
        clamp((event.clientY - bounds.top) / bounds.height * 2 - 1));
    };
    const bind = () => {
      reset();
      root.removeEventListener('pointerdown', down);
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerleave', reset);
      root.removeEventListener('pointerup', reset);
      root.removeEventListener('pointercancel', reset);
      // La preferencia desactiva también los handlers, no solo la transición.
      if (motion.matches) return;
      root.addEventListener('pointerdown', down);
      root.addEventListener('pointermove', move);
      root.addEventListener('pointerleave', reset);
      root.addEventListener('pointerup', reset);
      root.addEventListener('pointercancel', reset);
    };
    bind();
    motion.addEventListener('change', bind);
    return () => {
      reset();
      motion.removeEventListener('change', bind);
      root.removeEventListener('pointerdown', down);
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerleave', reset);
      root.removeEventListener('pointerup', reset);
      root.removeEventListener('pointercancel', reset);
    };
  }, [variant]);

  return (
    <div ref={rootRef} data-card-tilt={variant} className={cn(styles.stage, className)}>
      <div className={styles.surface}>{children}</div>
    </div>
  );
}
