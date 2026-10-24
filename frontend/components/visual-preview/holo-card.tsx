'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { CardTilt } from '@/components/cards/card-tilt';
import { cn } from '@/lib/cn';
import { useAppVisuals } from './visual-preview';
import styles from './visual-preview.module.css';

export function HoloCard({ children, variant = 'detail', className }: { children: ReactNode; variant?: 'detail' | 'catalog'; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = true;
    let frame = 0;
    let touch: { id: number; x: number; y: number } | null = null;
    const reset = () => {
      cancelAnimationFrame(frame);
      touch = null;
      node.removeAttribute('data-active');
      for (const property of ['--rx', '--ry', '--mx', '--my']) node.style.removeProperty(property);
    };
    const availability = () => {
      node.dataset.paused = String(!visible || document.hidden || media.matches);
      if (node.dataset.paused === 'true') reset();
    };
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; availability(); });
    observer?.observe(node);
    const down = (event: PointerEvent) => {
      if (event.pointerType === 'touch' && event.isPrimary && variant === 'detail') touch = { id: event.pointerId, x: event.clientX, y: event.clientY };
    };
    const move = (event: PointerEvent) => {
      if (!visible || document.hidden || media.matches) return;
      const box = node.getBoundingClientRect();
      if (!box.width || !box.height) return;
      let x = (event.clientX - box.left) / box.width * 2 - 1;
      let y = (event.clientY - box.top) / box.height * 2 - 1;
      if (event.pointerType === 'touch') {
        if (!touch || touch.id !== event.pointerId) return;
        const dx = event.clientX - touch.x;
        const dy = event.clientY - touch.y;
        if (Math.abs(dy) > Math.abs(dx)) { reset(); return; }
        if (Math.abs(dx) < 6) return;
        x = dx / (box.width / 2); y = 0;
      }
      x = Math.max(-1, Math.min(1, x)); y = Math.max(-1, Math.min(1, y));
      const limit = variant === 'detail' ? 14 : 6;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        node.style.setProperty('--rx', `${-y * limit}deg`);
        node.style.setProperty('--ry', `${x * limit}deg`);
        node.style.setProperty('--mx', `${50 + x * 45}%`);
        node.style.setProperty('--my', `${50 + y * 45}%`);
        node.dataset.active = 'true';
      });
    };
    node.addEventListener('pointerdown', down);
    node.addEventListener('pointermove', move);
    const exits = ['pointerleave', 'pointerup', 'pointercancel'] as const;
    exits.forEach((event) => node.addEventListener(event, reset));
    document.addEventListener('visibilitychange', availability);
    media.addEventListener('change', availability);
    availability();
    return () => {
      reset(); observer?.disconnect();
      node.removeEventListener('pointerdown', down); node.removeEventListener('pointermove', move);
      exits.forEach((event) => node.removeEventListener(event, reset));
      document.removeEventListener('visibilitychange', availability); media.removeEventListener('change', availability);
    };
  }, [variant]);
  return <div ref={ref} data-holo-card={variant} className={cn(styles.holoStage, className)}><div className={styles.holoSurface}>{children}<span aria-hidden="true" className={styles.rainbow} /><span aria-hidden="true" className={styles.glare} /></div></div>;
}

/** Mantiene el arte compuesto en servidor; únicamente el marco es interactivo. */
export function VisualCard({ children, variant = 'detail', className, plainCurrent = false }: { children: ReactNode; variant?: 'detail' | 'catalog'; className?: string; plainCurrent?: boolean }) {
  const active = useAppVisuals();
  if (active) return <div className={cn(variant === 'detail' && styles.cardReveal)}><HoloCard variant={variant} className={className}>{children}</HoloCard></div>;
  return plainCurrent ? <>{children}</> : <CardTilt variant={variant} className={className}>{children}</CardTilt>;
}
