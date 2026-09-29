'use client';

import Link from 'next/link';

import { Button, ErrorState, Surface } from '@/components/ui';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas font-sans text-primary">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-12">
        <ErrorState
          title="Algo se rompió"
          message="No pudimos mostrar esta pantalla. Es un problema de la app, no tuyo — reintentá y si sigue, volvé al catálogo."
          onRetry={reset}
          supportingAction={
            <Link href={"/buscar"}>
              <Button variant="secondary">Volver al catálogo</Button>
            </Link>
          }
        />

        {/*
          El digest lo genera Next en el server y es lo único que nos permite
          correlacionar con los logs. Va en un `details` porque a un usuario no
          le sirve y ocupa espacio, pero sin él no hay forma de depurar.
        */}
        {error.digest ? (
          <Surface className="w-full">
            <details className="text-caption text-tertiary">
              <summary className="cursor-pointer select-none">Detalle técnico</summary>
              <p className="mt-2 font-mono text-caption">{error.digest}</p>
            </details>
          </Surface>
        ) : null}
      </main>
    </div>
  );
}
