'use client';

import Link from 'next/link';
import { Layers, ScanLine, Search, UserRound } from 'lucide-react';

import { buttonVariants } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useAuth } from '@/hooks/use-auth';

/** 3 palabras, el tope de §10.1 para un botón. */
const PRIMARY_LABEL = 'Empezar a escanear';
const PRIMARY_LABEL_AUTH = 'Ver mis colecciones';
const SECONDARY_LABEL = 'Explorar el catálogo';

/**
 * La fila de CTA del hero, y el link de sesión que va abajo.
 *
 * ## Por qué este componente es client y la home no
 *
 * El CTA depende de si hay sesión, y la sesión vive en el navegador
 * (`sessionStorage`): el server no la puede leer y no la puede pasar como prop
 * (docs/routes.md, "Ninguna bloquea el acceso en el server"). La única forma de
 * saberlo en el render es un `useAuth()`. Para no arrastrar el hero entero —con
 * su `h1`, sus features y las imágenes del mock— al bundle de cliente, la
 * página sigue siendo Server Component y solo esta pieza lleva la directiva.
 *
 * ## El label salta una vez
 *
 * Mientras `AuthProvider` resuelve `GET /users/me`, `isLoading` está en `true` y
 * el CTA dice la versión de invitado. Un usuario que vuelve con la sesión puesta
 * ve "Empezar a escanear" durante ese frame y después "Ver mis colecciones".
 *
 * Se podía tapar con un `Skeleton`, y es la opción que usa `RequireAuth`, pero
 * acá no: el CTA primario es lo más importante de la pantalla y un `shimmer` en
 * el lugar del botón hace saltar la composición en cada visita, también de
 * alguien sin sesión (que es el caso común). Un label que se corrige solo es más
 * barato que un placeholder, y el peor caso —que alguien entre al escáner en vez
 * de a sus colecciones— es una pantalla igual de válida.
 *
 * ## Los dos links de abajo llevan su propio `outline`
 *
 * Los dos CTA de arriba no lo necesitan: heredan el de `buttonVariants`. Estos
 * dos sí, y lo llevan **hacia afuera** con `offset-2`, como `Button`/`Chip`/
* `Select`: el `ring-brand/20` viejo medía 1.38:1 contra el canvas y SC 1.4.11
 * pide 3:1. Los 4 px de aire entran de sobra —el padre es un `flex-col gap-3` y
 * el hero no recorta— así que acá no hace falta padding de salvaguarda.
 */
export function HomeCta() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="flex w-full flex-col items-stretch gap-4 sm:items-center">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
        {isAuthenticated ? (
          <Link
            href={"/colecciones"}
            className={cn(
              buttonVariants({ variant: 'primary', size: 'lg' }),
              'w-full sm:w-auto',
            )}
          >
            <Layers aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-5 w-5" />
            {PRIMARY_LABEL_AUTH}
          </Link>
        ) : (
          <Link
            href={"/escanear"}
            className={cn(
              buttonVariants({ variant: 'primary', size: 'lg' }),
              'w-full sm:w-auto',
            )}
          >
            <ScanLine aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-5 w-5" />
            {PRIMARY_LABEL}
          </Link>
        )}

        {/*
          `secondary` y no `ghost`: acompaña a la primaria y tiene que verse
          como un botón (§8.1), no como un link suelto.
        */}
        <Link
          href={"/buscar"}
          className={cn(
            buttonVariants({ variant: 'secondary', size: 'lg' }),
            'w-full sm:w-auto',
          )}
        >
          <Search aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-5 w-5" />
          {SECONDARY_LABEL}
        </Link>
      </div>

      {isAuthenticated ? (
        <Link
          href={"/ajustes"}
          className="inline-flex items-center justify-center gap-1.5 rounded-control text-label text-secondary transition-colors duration-fast ease-standard hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]"
        >
          <UserRound aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-4 w-4" />
          Ver tu perfil
        </Link>
      ) : (
        <p className="text-body text-secondary">
          ¿Ya tenés cuenta?{' '}
          <Link
            href={"/login"}
            className="rounded-control text-body-strong text-brand transition-colors duration-fast ease-standard hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]"
          >
            Iniciá sesión
          </Link>
        </p>
      )}
    </div>
  );
}
