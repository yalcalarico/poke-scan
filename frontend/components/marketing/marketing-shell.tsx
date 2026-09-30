import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';

import { AppMark } from '@/components/brand';
import { buttonVariants } from '@/components/ui';
import { cn } from '@/lib/cn';

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas font-sans text-primary">
      <header className="sticky top-0 z-sticky border-b border-line-subtle bg-surface/90 pt-[env(safe-area-inset-top)] backdrop-blur-lg">
        <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            aria-label="PokéScan, inicio"
            className="flex shrink-0 items-center gap-2 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]"
          >
            <AppMark size={36} />
            <span className="text-body-strong text-primary">PokéScan</span>
          </Link>

          <nav aria-label="Navegación del sitio" className="hidden items-center gap-6 md:flex">
            <Link href="/#producto" className="text-label text-secondary transition-colors hover:text-primary">
              La app
            </Link>
            <Link href="/#planes" className="text-label text-secondary transition-colors hover:text-primary">
              Gratis y Pro
            </Link>
            <Link href="/faq" className="text-label text-secondary transition-colors hover:text-primary">
              FAQ
            </Link>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/login"
              className="hidden min-h-11 items-center rounded-control px-3 text-label text-secondary transition-colors hover:bg-surface-2 hover:text-primary sm:inline-flex"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/escanear"
              className={cn(buttonVariants({ variant: 'primary', size: 'md' }), 'px-3 sm:px-4')}
            >
              <span className="sm:hidden">Probar</span>
              <span className="hidden sm:inline">Probar gratis</span>
              <ArrowRight aria-hidden="true" focusable="false" className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      {children}

      <footer className="border-t border-line-subtle bg-surface pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div className="flex items-center gap-2">
            <AppMark size={32} />
            <div>
              <p className="text-label text-primary">PokéScan</p>
              <p className="text-caption text-tertiary">Tu colección, más clara.</p>
            </div>
          </div>

          <nav aria-label="Enlaces del pie" className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/faq" className="text-caption text-secondary hover:text-primary">
              Preguntas frecuentes
            </Link>
            <Link href="/#planes" className="text-caption text-secondary hover:text-primary">
              Planes
            </Link>
            <Link href="/buscar" className="text-caption text-secondary hover:text-primary">
              Catálogo
            </Link>
          </nav>

          <p className="max-w-sm text-caption text-tertiary md:text-right">
            PokéScan es un proyecto independiente y no está afiliado ni respaldado por The Pokémon Company,
            Nintendo, Creatures o GAME FREAK.
          </p>
        </div>
      </footer>
    </div>
  );
}
