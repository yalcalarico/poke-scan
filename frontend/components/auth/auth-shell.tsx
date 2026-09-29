import type { ReactNode } from 'react';

import { AppMark } from '@/components/brand';
import { ScreenContainer } from '@/components/layout/screen-container';
import { Surface } from '@/components/ui';

export interface AuthShellProps {
  /** `h1` de la pantalla. Máximo 4 palabras (§10.1). */
  title: string;
  /** Una línea: qué pasa cuando terminás el form. */
  description: string;
  /** El formulario. */
  children: ReactNode;
  /** Link a la pantalla alternativa ("¿No tenés cuenta? Registrate"). */
  footer?: ReactNode;
}

/**
 * La card angosta y centrada de las pantallas de autenticación.
 *
 * ## Qué trae y qué no
 *
 * - **El logo y el nombre.** Los dos, y los dos dicen **"PokéScan"**: antes
 *   convivían "PokéScan" (manifest, home) y "Pokémon Scanner" (auth y top bar),
 *   que era un bug de branding y no una variante intencional.
 * - **Sin `ScreenHeader`**: no hay nada que volver (o sí, a la home, y eso lo
 *   resuelve el link de abajo) y un header de 56 px encima de una card de 400
 *   deja la pantalla menos compacta de lo que el patrón de auth necesita.
 * - **Sin `BottomNav`**: eso lo resuelve el route group `(auth)`, hermano de
 *   `(app)`, que es el único que puede sacarla.
 *
 * Server Component: la card es puro layout. El formulario que recibe es client y
 * se le pasa como `children`, así que la página puede seguir siendo server y
 * exportar `metadata`.
 */
export function AuthShell({ title, description, children, footer }: AuthShellProps) {
  return (
    <ScreenContainer
      labelledBy="auth-title"
      // El `pb` de `ScreenContainer` reserva la `BottomNav`, y acá no hay nav que
      // reservar: sin este override queda media pantalla de hueco abajo.
      className="flex flex-1 flex-col items-center justify-center pb-8 pt-10 sm:pb-12 sm:pt-14"
    >
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <AppMark size={56} className="shadow-sm" />
          <p className="text-h3 text-primary">PokéScan</p>
        </div>

        <Surface as="section" className="flex flex-col gap-5 rounded-panel p-5 sm:p-6">
          <div>
            <h1 id="auth-title" className="text-h2 text-primary">
              {title}
            </h1>
            <p className="mt-1 text-body text-secondary">{description}</p>
          </div>

          {children}
        </Surface>

        {footer ? <div className="text-center text-body text-secondary">{footer}</div> : null}
      </div>
    </ScreenContainer>
  );
}
