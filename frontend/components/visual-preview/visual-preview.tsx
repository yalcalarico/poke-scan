'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { isVisualVersionEnabled, visualVersionHref } from './navigation';
import styles from './visual-preview.module.css';

const VisualContext = createContext<boolean | undefined>(undefined);
type GridPositions = Map<string, { positions: Map<string, DOMRect>; capturedAt: number }>;
const GridMemoryContext = createContext<GridPositions | null>(null);
export function useVisualGridMemory() { return useContext(GridMemoryContext); }
export function useVisualPreview() { return useContext(VisualContext); }
export function useVisualPanelClassName() {
  return useVisualPreview() ? cn(styles.scope, styles.glass) : undefined;
}

/** También sirve dentro de portales: hereda contexto y vuelve a aplicar tokens. */
export function VisualScope({ children, className }: { children: ReactNode; className?: string }) {
  const active = useVisualPreview();
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

export function VisualPreviewProvider({ children }: { children: ReactNode }) {
  const [grids] = useState<GridPositions>(() => new Map());
  const pathname = usePathname();
  const query = useSearchParams();
  const active = isVisualVersionEnabled(query.get('visual'));
  const canSwitch = /^\/(inicio|buscar(?:-v2)?|carta\/[^/]+|colecciones(?:\/.*)?|escanear)$/.test(pathname);
  return <VisualContext.Provider value={active}><GridMemoryContext.Provider value={grids}>
    <VisualScope className="flex min-h-dvh flex-col">
      {active ? <div aria-hidden="true" className={styles.ambient}><i /><i /><i /><i /></div> : null}
      {canSwitch ? <div className={styles.versionBar}>
        <div aria-label="Versión visual" className={styles.versionControl}>
          <Link href={visualVersionHref(pathname, query.toString(), false)} aria-current={!active ? 'page' : undefined}>Clásica</Link>
          <Link href={visualVersionHref(pathname, query.toString(), true)} aria-current={active ? 'page' : undefined}>Actual</Link>
        </div>
        <p className="text-caption text-secondary">{active ? 'Apariencia actual' : 'Apariencia clásica'}</p>
      </div> : null}
      {children}
    </VisualScope>
  </GridMemoryContext.Provider></VisualContext.Provider>;
}
