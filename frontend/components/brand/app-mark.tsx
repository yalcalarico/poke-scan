import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";
import styles from "./brand.module.css";

export interface AppMarkProps {
  size?: number;
  className?: string;
}

/** La P es decorativa: el nombre accesible vive en el texto o enlace de marca. */
export function AppMark({ size = 40, className }: AppMarkProps) {
  return <span aria-hidden="true" className={cn(styles.mark, className)}
    style={{ width: size, height: size, fontSize: size * 5 / 9 } as CSSProperties}>P</span>;
}

/** Un solo wordmark para que cabeceras y autenticación no diverjan. */
export function AppWordmark({ className }: { className?: string }) {
  return <span data-brand-wordmark className={cn(styles.wordmark, className)}>POKÉSCAN</span>;
}
