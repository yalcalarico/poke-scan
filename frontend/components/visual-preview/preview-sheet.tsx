'use client';

import type { ComponentProps } from 'react';
import { Sheet } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useVisualPanelClassName } from './visual-preview';

/** Conserva el diálogo, foco y acciones existentes; solo cambia su superficie. */
export function PreviewSheet({ className, ...props }: ComponentProps<typeof Sheet>) {
  const visualClass = useVisualPanelClassName();
  return <Sheet {...props} className={cn(visualClass, className)} />;
}
