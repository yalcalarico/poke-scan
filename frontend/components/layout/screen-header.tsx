import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface ScreenHeaderProps {
  /** Título centrado. Se trunca en los dos lados para que el chevron y la acción no lo descentren. */
  title: ReactNode;
  /** Destino del chevron izquierdo. Sin esto, no hay chevron y el título se alinea a la izquierda. */
  back?: { href: string; label?: string };
  /** Acción a la derecha: un `IconButton`, un avatar, un link. */
  action?: ReactNode;
  /** Segunda línea bajo el título. */
  subtitle?: ReactNode;
  className?: string;
}

/**
 * El header de una pantalla, no un header global. Referencia histórica: la app
 * anterior tenía un `TopBar` fijo para todas.
 *
 * Un header global obliga a pelear desde adentro con cada caso: la pantalla de
 * escaneo no quiere un header, la de colección quiere el nombre de la colección
 * y la de búsqueda quiere un "cerrar". Uno por pantalla los resuelve en el lugar
 * donde se conoce la información.
 */
export function ScreenHeader({ title, back, action, subtitle, className }: ScreenHeaderProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-sticky bg-surface/85 pt-[env(safe-area-inset-top)] backdrop-blur-md',
        className,
      )}
    >
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 sm:px-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center">
          {back ? (
            <Link
              href={back.href}
              aria-label={back.label ? `Volver a ${back.label}` : 'Volver'}
              className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-secondary transition-colors duration-fast hover:bg-surface-3 hover:text-primary focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <ChevronLeft className="h-6 w-6" aria-hidden="true" />
            </Link>
          ) : null}
        </div>

        <div className={cn('min-w-0 flex-1', back || action ? 'text-center' : 'text-left')}>
          <p className="truncate text-h3 text-primary">{title}</p>
          {subtitle ? (
            <p className="truncate text-caption text-tertiary">{subtitle}</p>
          ) : null}
        </div>

        <div className="flex h-10 w-10 shrink-0 items-center justify-center">
          {action ?? null}
        </div>
      </div>
    </header>
  );
}
