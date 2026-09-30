import type { Metadata } from 'next';

import { CollectionsScreen } from '@/components/collections';

export const metadata: Metadata = {
  title: 'Colecciones',
  description: 'Tus colecciones de cartas: cuántas tenés y cuánto valen.',
  robots: { index: false, follow: false },
};

/**
 * `/colecciones` — la lista de colecciones.
 *
 * Server Component, pero finito: no pide datos ni calcula nada. El trabajo todo
 * está en `CollectionsScreen`, que es client porque el token vive en
 * `sessionStorage` (el servidor no puede pedir nada) y porque el chrome depende
 * de los datos —la acción del header abre el `Sheet` de alta, y el contador y el
 * total combinado se formatean con la moneda activa del usuario.
 *
 * Partir el `ScreenHeader` en un Server Component y dejar solo el cuerpo client
 * obligaría a un contexto para pasarle el nombre de la colección recién creada o
 * a una segunda request para obtener el mismo dato dos veces. El shell
 * (`BottomNav`, `OfflineToast`) ya está montado en `app/(app)/layout.tsx` y no
 * se repite acá.
 */
export default function CollectionsPage() {
  return <CollectionsScreen />;
}
