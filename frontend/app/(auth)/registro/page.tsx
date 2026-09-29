import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthShell, RegisterForm } from '@/components/auth';

export const metadata: Metadata = {
  title: 'Crear cuenta',
  description: 'Creá tu cuenta de PokéScan para escanear cartas y armar tu colección.',
};

/**
 * `/registro` — Server Component, por las mismas razones que `/login`: la
 * metadata y el chrome son de servidor, y el estado del formulario (cinco
 * valores, los errores de campo y el del 409) vive en `RegisterForm`.
 *
 * La card es más alta que en el login —cinco campos en vez de dos— y por eso
 * `AuthShell` la centra con `justify-center` en vez de pegarla arriba: en mobile
 * el centrado no se nota porque no sobra alto, y en desktop evita que el título
 * quede flotando con un vacío abajo.
 */
export default function RegisterPage() {
  return (
    <AuthShell
      title="Crear cuenta"
      description="Empezá a armar tu colección hoy."
      footer={
        <p>
          ¿Ya tenés cuenta?{' '}
          <Link
            href={"/login"}
            className="rounded-control text-body-strong text-brand transition-colors duration-fast ease-standard hover:underline focus-visible:ring-2 focus-visible:ring-brand/20 dark:focus-visible:ring-brand/40"
          >
            Entrá
          </Link>
        </p>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
