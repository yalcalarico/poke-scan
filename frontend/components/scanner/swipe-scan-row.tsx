'use client';

import { useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui';

export function SwipeScanRow({ children, name, disabled, onRemove }: {
  children: ReactNode; name: string; disabled: boolean; onRemove: () => void;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const [revealed, setRevealed] = useState(false);
  return <li className="relative overflow-hidden rounded-control bg-negative-soft">
    <div className="absolute inset-y-0 right-0 flex w-24 items-center justify-center md:hidden">
      <Button variant="ghost" disabled={disabled} tabIndex={revealed ? 0 : -1}
        aria-hidden={!revealed} aria-label={`Eliminar ${name}`} onClick={onRemove} className="text-negative">Eliminar</Button>
    </div>
    <div
      className={`relative touch-pan-y transition-transform duration-fast motion-reduce:transition-none md:touch-auto md:translate-x-0 ${revealed ? '-translate-x-24' : ''}`}
      onPointerDown={(event) => {
        if (!disabled && window.matchMedia('(max-width: 767px)').matches) start.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event) => {
        const origin = start.current;
        start.current = null;
        if (!origin || disabled) return;
        const dx = event.clientX - origin.x;
        if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(event.clientY - origin.y)) setRevealed(dx < 0);
      }}
      onPointerCancel={() => { start.current = null; }}>
      {children}
    </div>
  </li>;
}
