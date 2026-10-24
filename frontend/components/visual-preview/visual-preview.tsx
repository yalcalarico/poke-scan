'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import styles from './visual-preview.module.css';

// El contexto delimita los efectos de la app; las vistas públicas usan otro shell.
const VisualContext = createContext(false);
type GridPositions = Map<string, { positions: Map<string, DOMRect>; capturedAt: number }>;
const GridMemoryContext = createContext<GridPositions | null>(null);
export function useVisualGridMemory() { return useContext(GridMemoryContext); }
export function useAppVisuals() { return useContext(VisualContext); }
export function useVisualPanelClassName() {
  return useAppVisuals() ? cn(styles.scope, styles.glass) : undefined;
}

/** También sirve dentro de portales: hereda contexto y vuelve a aplicar tokens. */
export function VisualScope({ children, className }: { children: ReactNode; className?: string }) {
  const active = useAppVisuals();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;
    const update = () => { node.dataset.paused = String(document.hidden); };
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, [active]);
  return <div ref={ref} data-visual-preview={active ? 'v2' : undefined} className={cn(active && styles.scope, className)}>{children}</div>;
}

export function AppVisualsProvider({ children }: { children: ReactNode }) {
  const [grids] = useState<GridPositions>(() => new Map());
  return <VisualContext.Provider value={true}><GridMemoryContext.Provider value={grids}>
    <VisualScope className="flex min-h-dvh flex-col">
      <div aria-hidden="true" className={styles.ambient}><i /><i /><i /><i /></div>
      {children}
    </VisualScope>
  </GridMemoryContext.Provider></VisualContext.Provider>;
}
