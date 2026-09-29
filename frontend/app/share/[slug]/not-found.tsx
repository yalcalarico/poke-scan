import Link from 'next/link';
import { Link2Off } from 'lucide-react';

import { Button, EmptyState } from '@/components/ui';

/**
 * 404 propia del enlace público, y no la general de la app: un enlace revocado o
 * vencido es un caso de negocio con su propio guion, no una URL mal tipeada
 * (`docs/routes.md`).
 *
 * El backend devuelve 404 para las tres cosas —no existe, lo revocaron, venció
 * — y desde el servidor no se puede saber cuál, así que el copy las cubre a las
 * tres sin mentir sobre ninguna.
 */
export default function SharedLinkNotFound() {
  return (
    <main
      id="contenido"
      className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-4 py-12 sm:px-6"
    >
      <EmptyState
        kind="first-use"
        icon={Link2Off}
        title="Este enlace no está disponible"
        description="Puede haber sido revocado, haber vencido, o el link puede estar incompleto. Pedile a quien lo compartió que te mande uno nuevo."
        action={
          <Link href={"/buscar"}>
            <Button>Ir al catálogo</Button>
          </Link>
        }
      />
    </main>
  );
}
