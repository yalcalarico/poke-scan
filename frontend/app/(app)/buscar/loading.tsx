import { ScreenContainer } from '@/components/layout/screen-container';
import { SearchFallback } from '@/components/search/search-fallback';

/**
 * El skeleton de `/buscar` mientras vuela el Server Component.
 *
 * Comparte el `SearchFallback` con el `fallback` del `Suspense` de `page.tsx`
 * en vez de duplicarlo: son el mismo hueco visto desde los dos lados, y dos
 * versiones del mismo skeleton que no coinciden son un salto de layout
 * esperando a aparecer.
 *
 * El `aria-busy` va en el `<main>` y no adentro del `SearchFallback`: la región
 * que está ocupada es la pantalla entera, y un `aria-busy` en un `<div>` interno
 * describe un subtree que no es el que se está reemplazando. `ScreenContainer`
 * reparte props al elemento, así que no hace falta un `<main>` propio con las
 * clases copiadas. El anuncio, en el `role="status"` de adentro (§8.12).
 */
export default function Loading() {
  return (
    <ScreenContainer aria-busy="true">
      <SearchFallback />
    </ScreenContainer>
  );
}
