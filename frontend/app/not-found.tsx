import Link from 'next/link';

import { Button, EmptyState } from '@/components/ui';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas font-sans text-primary">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-12">
        <EmptyState
          kind="first-use"
          tone="brand"
          title="Esta pantalla no existe"
          description="El link puede estar viejo, o la carta se borró. Buscá por nombre desde el catálogo."
          action={
            <Link href={"/buscar"}>
              <Button>Ir al catálogo</Button>
            </Link>
          }
        />
      </main>
    </div>
  );
}
