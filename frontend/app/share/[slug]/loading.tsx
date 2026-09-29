import { CardGridSkeleton, Skeleton } from '@/components/ui';

/**
 * Esqueleto de la landing pública con **la forma real** (§9.2): header con
 * avatar y nombre, la banda de solo lectura, la grilla de stats y la grilla de
 * cartas de 3 columnas.
 *
 * `aria-busy` va en el `<main>` que escribimos acá y no en el
 * `ScreenContainer`: esta pantalla no usa el contenedor de la app porque no
 * hereda su layout.
 */
export default function SharedCollectionLoading() {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="border-b border-line bg-surface pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6 sm:py-8">
          <div className="flex items-center gap-3">
            <Skeleton variant="avatar" className="size-12" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton variant="text" className="w-40" />
              <Skeleton variant="text" className="w-56" />
            </div>
          </div>
          <Skeleton variant="text" className="w-52" />
        </div>
      </div>

      <main
        id="contenido"
        aria-busy="true"
        className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8"
      >
        {/*
          Dos regiones `status` y no una: el `CardGridSkeleton` ya trae la suya
          con su label, y anidar un `role="status"` dentro de otro hace que el
          lector anuncie "cargando" dos veces y no diga qué está cargando. Cada
          región anuncia una cosa.
        */}
        <div
          role="status"
          aria-label="Cargando los datos de la colección"
          className="flex flex-col gap-6"
        >
          <Skeleton variant="block" className="h-16" />
          <Skeleton variant="block" className="h-24" />
        </div>

        <div className="flex flex-col gap-4">
          <Skeleton variant="text" className="w-32" />
          <CardGridSkeleton count={12} variant="collection" label="Cargando las cartas" />
        </div>
      </main>
    </div>
  );
}
