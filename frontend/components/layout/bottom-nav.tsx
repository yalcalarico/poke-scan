'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { NAV_ITEMS, isNavItemActive } from '@/components/nav';
import { cn } from '@/lib/cn';

/**
 * La navegación principal, y **la misma barra en dos lugares**.
 *
 * Abajo hasta `lg`, arriba de `lg` en adelante. No son dos componentes ni dos
 *rutas: es la misma barra con los mismos cuatro items y el mismo ícono de
 * pestaña activa, que se apoya en el borde de arriba en vez del de abajo.
 *
 * ## Por el corte en `lg` y no en `md`
 *
 * Porque `md` son 768 px, y una tablet en vertical entra ahí. En una tablet se
 * sostiene con una mano y el pulgar no llega a la esquina superior: una barra
 * abajo sigue siendo lo correcto. `lg` (1024 px) ya es un monitor o una tablet
 * en horizontal, y ahí abajo la barra se convierte en una tira angosta flotando
 * en el medio del ancho de la ventana, que no se parece a nada.
 *
 * ## Por qué la de arriba es un navbar y no el `ScreenHeader`
 *
 * Porque el `ScreenHeader` que usan las pantallas dice **"Buscar"**, que es lo
 * mismo que ya dice la pestaña marcada. La barra de abajo se elige por la
 * posición —pulgar, siempre alcanzable— y por eso se resigna el título
 * redundante. Arriba no hay esa razón: el navbar es la navegación del sitio y
 * además identifica la sección, así que los labels se leen y no hace falta que
 * compitan con un título de pantalla.
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegación principal"
      className={cn(
        'fixed inset-x-0 z-nav border-line bg-surface/90 backdrop-blur-lg',
        // Abajo: borde de arriba, safe area de abajo, sombra hacia abajo.
        'bottom-0 border-t pb-[env(safe-area-inset-bottom)] shadow-md',
        // Arriba: se da vuelta. Sin borde de abajo y con el safe area de arriba,
        // que es donde está la muesca en horizontal.
        'lg:bottom-auto lg:top-0 lg:border-b lg:border-t-0 lg:pb-0 lg:shadow-sm',
        'lg:pt-[env(safe-area-inset-top)]',
      )}
    >
      {/*
        `max-w-lg` evita que los 4 items queden tirados en un monitor de 1920, y
        en `lg:` se abre a `max-w-6xl` para acompañar el ancho del contenido y
        dejar la marca a la izquierda con las pestañas a la derecha, que es la
        convención de un navbar de sitio.
      */}
      <ul
        className={cn(
          'mx-auto flex h-16 max-w-lg items-stretch',
          // En `lg:` los items se alinean a la derecha y el ícono y el label
          // van en fila: hay ancho de sobra y en vertical con el ícono al lado
          // del texto la barra queda más baja y más parecida a un navbar.
          'lg:h-14 lg:max-w-6xl lg:items-center lg:justify-end lg:gap-1',
          'lg:px-6',
        )}
      >
        {NAV_ITEMS.map((item) => {
          const isActive = isNavItemActive(pathname, item.href);
          const Icon = item.icon;

          return (
            <li key={item.href} className="flex-1 lg:flex-none">
              <Link
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex h-full flex-col items-center justify-center gap-1 px-1 transition-colors duration-fast',
                  // En `lg:` el texto del item activo pasa a tener la misma
                  // forma que el link de texto de un navbar (subrayado), porque
                  // la banda de color del ícono sola alcanza menos cuando el
                  // label está al lado y no debajo.
                  'lg:flex-row lg:gap-2 lg:rounded-control lg:px-3 lg:py-2 lg:hover:bg-surface-2',
                  isActive ? 'text-brand' : 'text-tertiary hover:text-secondary',
                )}
              >
                <Icon className="h-6 w-6" strokeWidth={isActive ? 2.25 : 1.75} aria-hidden="true" />
                <span
                  className={cn(
                    'text-caption leading-none lg:text-body',
                    isActive && 'font-semibold',
                    isActive && 'lg:underline lg:decoration-2 lg:underline-offset-4',
                  )}
                >
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
