'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { NAV_ITEMS, isNavItemActive } from '@/components/nav';
import { cn } from '@/lib/cn';

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-nav border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] shadow-md backdrop-blur-lg"
    >
      {/*
        `max-w-lg` evita que los 4 items queden tirados en un monitor de 1920.
        El safe area va en la nav y no en el contenido porque el contenido
        necesita un inset distinto (más alto, para que la última fila de cartas
        no quede bajo la nav).
      */}
      <ul className="mx-auto flex h-16 max-w-lg items-stretch">
        {NAV_ITEMS.map((item) => {
          const isActive = isNavItemActive(pathname, item.href);
          const Icon = item.icon;

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex h-full flex-col items-center justify-center gap-1 px-1 transition-colors duration-fast',
                  isActive ? 'text-brand' : 'text-tertiary hover:text-secondary',
                )}
              >
                <Icon className="h-6 w-6" strokeWidth={isActive ? 2.25 : 1.75} aria-hidden="true" />
                <span className={cn('text-caption leading-none', isActive && 'font-semibold')}>
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
