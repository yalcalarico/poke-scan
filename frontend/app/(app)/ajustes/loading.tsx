import { ScreenContainer } from '@/components/layout/screen-container';
import { ScreenHeader } from '@/components/layout/screen-header';
import { Skeleton } from '@/components/ui';

/**
 * Esqueleto de Ajustes con **la forma real** de la pantalla (§9.2): un header,
 * una tarjeta de identidad con avatar y tres filas, y cuatro bloques más.
 *
 * No es un `Spinner` porque la estructura de esta pantalla se conoce de antemano
 * — y el `Spinner` y el `Skeleton` nunca van juntos (§8.12).
 */
export default function SettingsLoading() {
  return (
    <>
      <ScreenHeader title="Ajustes" />

      {/*
        `aria-busy` va en el `<main>` y no en el contenedor del skeleton: la
        región que está ocupada es la pantalla entera, no el bloque. Se puede
        poner acá porque `ScreenContainer` reparte props al elemento que
        renderiza.
      */}
      <ScreenContainer aria-busy="true">
        <h1 className="sr-only">Ajustes</h1>

        <div
          role="status"
          aria-label="Cargando tus ajustes"
          className="flex flex-col gap-6 sm:gap-8"
        >
          {/* Identidad: avatar + nombre + la fila de "Miembro desde". */}
          <div className="flex flex-col gap-4 rounded-surface border border-line bg-surface p-4 shadow-sm">
            <div className="flex items-center gap-4">
              <Skeleton variant="avatar" className="size-16" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton variant="text" className="w-32" />
                <Skeleton variant="text" className="w-44" />
              </div>
            </div>
            <Skeleton variant="block" className="h-11" />
          </div>

          {/* Apariencia, moneda y enlaces: tres bloques con su esqueleto. */}
          <div className="flex flex-col gap-4 rounded-surface border border-line bg-surface p-4 shadow-sm">
            <Skeleton variant="text" className="w-24" />
            <Skeleton variant="block" className="h-11" />
          </div>

          <div className="flex flex-col gap-4 rounded-surface border border-line bg-surface p-4 shadow-sm">
            <Skeleton variant="text" className="w-24" />
            <Skeleton variant="block" className="h-11" />
            <Skeleton variant="text" className="w-52" />
          </div>

          <div className="flex flex-col gap-4 rounded-surface border border-line bg-surface p-4 shadow-sm">
            <Skeleton variant="text" className="w-40" />
            <Skeleton variant="block" className="h-44" />
          </div>

          {/* Sesión. */}
          <div className="flex flex-col gap-4 rounded-surface border border-line bg-surface p-4 shadow-sm">
            <Skeleton variant="text" className="w-20" />
            <Skeleton variant="block" className="h-10" />
          </div>
        </div>
      </ScreenContainer>
    </>
  );
}
