"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import styles from "./visual-preview.module.css";

// El contexto delimita los efectos de la app; las vistas públicas usan otro shell.
const VisualContext = createContext(false);
const MotionContext = createContext({
  paused: false,
  reduced: false,
  toggle: () => {},
});
const reducedQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotion(callback: () => void) {
  const media = window.matchMedia(reducedQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
function readMotion() {
  return (
    typeof window !== "undefined" && window.matchMedia(reducedQuery).matches
  );
}
export function useVisualMotionPaused() {
  return useContext(MotionContext).paused;
}

type GridPositions = Map<
  string,
  { positions: Map<string, DOMRect>; capturedAt: number }
>;
const GridMemoryContext = createContext<GridPositions | null>(null);
export function useVisualGridMemory() {
  return useContext(GridMemoryContext);
}
export function useAppVisuals() {
  return useContext(VisualContext);
}
export function useVisualPanelClassName() {
  return useAppVisuals() ? cn(styles.scope, styles.glass) : undefined;
}

/** También sirve dentro de portales: hereda contexto y vuelve a aplicar tokens. */
export function VisualScope({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const active = useAppVisuals();
  const paused = useVisualMotionPaused();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;
    const update = () => {
      node.dataset.paused = String(document.hidden || paused);
    };
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, [active, paused]);
  return (
    <div
      ref={ref}
      data-visual-preview={active ? "v2" : undefined}
      className={cn(active && styles.scope, className)}
    >
      {children}
    </div>
  );
}

export function AppVisualsProvider({ children }: { children: ReactNode }) {
  const [grids] = useState<GridPositions>(() => new Map());
  const [userPaused, setUserPaused] = useState(false);
  const reduced = useSyncExternalStore(
    subscribeMotion,
    readMotion,
    () => false,
  );
  const motion = useMemo(
    () => ({
      paused: userPaused || reduced,
      reduced,
      toggle: () => setUserPaused((value) => !value),
    }),
    [userPaused, reduced],
  );
  return (
    <VisualContext.Provider value={true}>
      <MotionContext.Provider value={motion}>
        <GridMemoryContext.Provider value={grids}>
          <VisualScope className="flex min-h-dvh flex-col">
            <div aria-hidden="true" className={styles.ambient}>
              <i />
              <i />
              <i />
              <i />
            </div>
            {children}
          </VisualScope>
        </GridMemoryContext.Provider>
      </MotionContext.Provider>
    </VisualContext.Provider>
  );
}

export function MotionControl() {
  const motion = useContext(MotionContext);
  return (
    <Button
      variant="secondary"
      disabled={motion.reduced}
      aria-pressed={motion.paused}
      onClick={motion.toggle}
    >
      {motion.reduced
        ? "Movimiento reducido"
        : motion.paused
          ? "Activar efectos"
          : "Pausar efectos"}
    </Button>
  );
}
