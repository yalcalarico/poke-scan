import { ScreenContainer } from '@/components/layout/screen-container';
import { Skeleton } from '@/components/ui';

/**
 * El esqueleto de `/escanear`.
 *
 * Es la forma real del primer estado de la pantalla —el reposo—, no una
 * aproximación: un panel con círculo, dos líneas y tres botones. `aria-busy` va
 * en el `<main>` y el `role="status"` con su label en el grupo, como manda
 * §11; los `Skeleton` son `aria-hidden` por diseño.
 *
 * No es un Server Component que espere datos: la pantalla es cliente y todo su
 * trabajo es en el navegador. El `loading.tsx` existe igual porque la ruta se
 * navega desde la `BottomNav` y, en la primera carga fría, este es lo que
 * muestra en vez de un frame en blanco.
 */
export default function ScanLoading() {
  return (
    <ScreenContainer aria-busy="true">
      <div className="mb-4 h-14" aria-hidden="true" />

      <div
        role="status"
        aria-label="Preparando el escáner"
        className="flex flex-col items-center gap-4 rounded-panel border border-line bg-surface px-6 py-8"
      >
        <div className="h-20 w-20 rounded-full bg-shimmer animate-shimmer" aria-hidden="true" />

        <div className="flex w-full max-w-sm flex-col items-center gap-2" aria-hidden="true">
          <Skeleton variant="text" className="h-5 w-40" />
          <Skeleton variant="text" className="w-full" />
          <Skeleton variant="text" className="w-3/4" />
        </div>

        <div className="flex w-full max-w-xs flex-col gap-3" aria-hidden="true">
          <Skeleton variant="block" className="h-12 w-full" />
          <Skeleton variant="block" className="h-12 w-full" />
          <Skeleton variant="block" className="h-12 w-full" />
        </div>
      </div>
    </ScreenContainer>
  );
}
