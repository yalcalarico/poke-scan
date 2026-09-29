'use client';

import Link from 'next/link';

import { Button, ErrorState, Surface } from '@/components/ui';

/**
 * Frontera de error de `/login` y `/registro`.
 *
 * Next resuelve `error.tsx` por segmento, así que el de `(app)` no cubre esta
 * rama: sin esta copia, un error de render en el login muestra la pantalla de
 * error pelada de Next.
 *
 * Es el mismo componente que `app/(app)/error.tsx` con dos diferencias: el link
 * de salida es la home —en una pantalla de auth lo útil es volver al inicio, no
 * ir al catálogo— y no repite el shell `min-h-dvh bg-canvas`, porque acá sí lo
 * monta el layout del grupo.
 */
export default function AuthBranchError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      id="contenido"
      className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-12"
    >
      <ErrorState
        title="Algo se rompió"
        message="No pudimos mostrar esta pantalla. Es un problema de la app, no tuyo — reintentá y si sigue, volvé al inicio."
        onRetry={reset}
        supportingAction={
          <Link href="/">
            <Button variant="secondary">Volver al inicio</Button>
          </Link>
        }
      />

      {error.digest ? (
        <Surface className="w-full">
          <details className="text-caption text-tertiary">
            <summary className="cursor-pointer select-none">Detalle técnico</summary>
            <p className="mt-2 font-mono text-caption">{error.digest}</p>
          </details>
        </Surface>
      ) : null}
    </main>
  );
}
