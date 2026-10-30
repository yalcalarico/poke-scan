'use client';

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useVisualGridMemory, useAppVisuals, useVisualMotionPaused } from './visual-preview';
import styles from './visual-preview.module.css';

function useMotionVisibility<T extends HTMLElement>(enabled = true) {
  const paused=useVisualMotionPaused();
  const ref = useRef<T>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let visible = true;
    const update = () => node.classList.toggle(styles.motionPaused, !visible || document.hidden || paused);
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); });
    observer?.observe(node);
    document.addEventListener('visibilitychange', update);
    update();
    return () => { observer?.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, [enabled,paused]);
  return ref;
}

export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const active = useAppVisuals();
  const ref = useMotionVisibility<HTMLDivElement>();
  return <div ref={ref} className={cn(active && styles.reveal, className)}>{children}</div>;
}
export function Burst({ trigger }: { trigger: string | number }) {
  const active = useAppVisuals();
  return active ? <span key={trigger} aria-hidden="true" className={styles.burst}>{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ '--angle': `${i * 360 / 14}deg` } as CSSProperties} />)}</span> : null;
}
export function Pokeball({ className }: { className?: string }) {
  const ref = useMotionVisibility<HTMLSpanElement>();
  return <span ref={ref} aria-hidden="true" className={cn(styles.pokeball, className)} />;
}
export function ScannerEffect() {
  const active = useAppVisuals();
  const ref = useMotionVisibility<HTMLSpanElement>(active);
  return active ? <span ref={ref} aria-hidden="true" className={styles.scanner} /> : null;
}

/** El texto accesible siempre contiene el valor final, sin anunciar cada frame. */
export function AnimatedNumber({ value, format = String, className }: { value: number; format?: (value: number) => string; className?: string }) {
  const active = useAppVisuals();
  const paused=useVisualMotionPaused();
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let stopped = false;
    const end = () => { stopped = true; cancelAnimationFrame(frame); node.textContent = format(value); };
    const from = previous.current;
    previous.current = value;
    let start: number | null = null;
    const tick = (now: number) => {
      if (stopped) return;
      start ??= now;
      const progress = Math.min(1, (now - start) / 800);
      node.textContent = format(from + (value - from) * (1 - (1 - progress) ** 3));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    const visibility = () => { if (document.hidden) end(); };
    const preference = () => { if (motion.matches) end(); };
    if (active && !paused && !motion.matches && !document.hidden && Number.isFinite(value)) frame = requestAnimationFrame(tick);
    else node.textContent = format(value);
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) end(); });
    observer?.observe(node);
    motion.addEventListener('change', preference); document.addEventListener('visibilitychange', visibility);
    return () => { end(); observer?.disconnect(); motion.removeEventListener('change', preference); document.removeEventListener('visibilitychange', visibility); };
  }, [active, paused, format, value]);
  if (!active) return <span className={cn('tabular-nums', className)}>{format(value)}</span>;
  return <span className={cn('tabular-nums', className)}><span className="sr-only">{format(value)}</span><span ref={ref} aria-hidden="true">{format(value)}</span></span>;
}

/** FLIP acotado a cambios del DOM; no mantiene un loop de frames por carta. */
export function MotionGrid({ children, className, scopeKey = 'catalog' }: { children: ReactNode; className?: string; scopeKey?: string }) {
  const active = useAppVisuals();
  const memory = useVisualGridMemory();
  const paused=useVisualMotionPaused();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!active || !root) return;
    if(paused){memory?.delete(scopeKey);return;}
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const previous = memory?.get(scopeKey);
    let positions = previous && performance.now() - previous.capturedAt < 5000 ? previous.positions : new Map<string, DOMRect>();
    let animations: Animation[] = [];
    let frame = 0;
    const cancel = () => { cancelAnimationFrame(frame); animations.forEach((animation) => animation.cancel()); animations = []; };
    const capture = () => {
      const next = new Map<string, DOMRect>();
      root.querySelectorAll<HTMLElement>('[data-card-index]').forEach((node) => {
        const box = node.getBoundingClientRect();
        const identity = node.dataset.cardKey;
        if (!identity || box.bottom < 0 || box.top > window.innerHeight) return;
        const before = positions.get(identity);
        next.set(identity, box);
        if (!before || media.matches || document.hidden || !node.animate || box.bottom < 0 || box.top > window.innerHeight) return;
        const dx = before.left - box.left;
        const dy = before.top - box.top;
        if (!dx && !dy) return;
        animations.push(node.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 480, easing: 'cubic-bezier(.2,.85,.25,1.15)' }));
      });
      // El remonte por filtros puede mostrar un skeleton antes de la nueva grilla.
      if (next.size === 0) return;
      positions = next;
      memory?.set(scopeKey, { positions: next, capturedAt: performance.now() });
    };
    capture();
    const observer = new MutationObserver((records) => {
      const changedCells = records.some((record) => [...record.addedNodes, ...record.removedNodes].some((node) =>
        node instanceof Element && (node.matches('[data-card-index]') || node.querySelector('[data-card-index]'))));
      // Los contadores cambian texto por frame; no son cambios de distribución.
      if (!changedCells) return;
      cancel(); frame = requestAnimationFrame(capture);
    });
    observer.observe(root, { childList: true, subtree: true });
    const preference = () => { if (media.matches || document.hidden) cancel(); };
    media.addEventListener('change', preference); document.addEventListener('visibilitychange', preference);
    return () => {
      if (positions.size > 0) memory?.set(scopeKey, { positions, capturedAt: performance.now() });
      cancel(); observer.disconnect(); media.removeEventListener('change', preference); document.removeEventListener('visibilitychange', preference);
    };
  }, [active, paused, memory, scopeKey]);
  return <div ref={ref} className={className}>{children}</div>;
}
