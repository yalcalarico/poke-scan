'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { AppMark } from '@/components/brand';
import { NAV_ITEMS, isNavItemActive } from '@/components/nav';
import { cn } from '@/lib/cn';

/**
 * La navegación principal, y **la misma barra en dos lugares**.
 *
 * Abajo hasta `lg`, arriba de `lg` en adelante. No son dos componentes ni dos
 * rutas: en móvil muestra los cinco destinos; en desktop el enlace de marca
 * reemplaza la tab Inicio y quedan cuatro secciones a la derecha.
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
        El contenedor evita que las tabs queden tiradas en un monitor de 1920.
        En `lg:` se abre a `max-w-6xl`, con la marca a la izquierda y las secciones
        a la derecha, que es la convención de un navbar de sitio.
      */}
      <div className="mx-auto flex h-16 max-w-lg items-stretch lg:h-14 lg:max-w-6xl lg:px-6">
        <Link
          href="/inicio"
          aria-label="PokéScan, inicio de la app"
          className="hidden shrink-0 items-center gap-2 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)] lg:flex"
        >
          <AppMark size={32} />
          <span className="text-body-strong text-primary">PokéScan</span>
        </Link>

        <ul
          className={cn(
            'mx-auto flex h-full max-w-lg flex-1 items-stretch',
            // En `lg:` los items se alinean a la derecha y el ícono y el label
            // van en fila: hay ancho de sobra y en vertical con el ícono al lado
            // del texto la barra queda más baja y más parecida a un navbar.
            'lg:ml-auto lg:flex-none lg:items-center lg:justify-end lg:gap-1',
          )}
        >
          {NAV_ITEMS.map((item) => {
            const isActive = isNavItemActive(pathname, item.href);
            const Icon = item.icon;

            return (
              <li
                key={item.href}
                className={cn(
                  'min-w-0 flex-1 lg:flex-none',
                  item.href === '/inicio' && 'lg:hidden',
                )}
              >
                <Link
                  href={item.href}
                  aria-label={item.label}
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
                    {item.href === '/colecciones' ? (
                      <>
                        <span className="sm:hidden">Cartas</span>
                        <span className="hidden sm:inline">Colecciones</span>
                      </>
                    ) : (
                      item.label
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
