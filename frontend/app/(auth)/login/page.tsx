import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthShell, LoginForm } from '@/components/auth';

export const metadata: Metadata = {
  title: 'Iniciar sesión',
  description: 'Entrá a tu cuenta de PokéScan para ver tus colecciones y el valor de tus cartas.',
};

/**
 * `/login` — Server Component.
 *
 * La pantalla no pide datos: el único estado es el del submit, que vive en
 * `LoginForm`. Lo único que necesita el servidor es la `metadata` y el chrome, y
 * por eso la página no lleva `'use client'` y el formulario se le pasa como
 * `children` del shell.
 *
 * El nombre de la app va arriba de la card, en `AuthShell`, compartido con el
 * registro, y dice "PokéScan" y no "Pokémon Scanner".
 */
export default function LoginPage() {
  return (
    <AuthShell
      title="Iniciar sesión"
      description="Entrá a tu cuenta para ver tus colecciones."
      footer={
        <p>
          ¿No tenés cuenta?{' '}
          <Link
            href={"/registro"}
            className="rounded-control text-body-strong text-brand transition-colors duration-fast ease-standard hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]"
          >
            Registrate
          </Link>
        </p>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
