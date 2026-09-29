import { SetProgressFallback } from '@/components/set-progress/set-progress-skeleton';

/**
 * El skeleton de la ruta mientras vuela el Server Component.
 *
 * Comparte el componente con el `fallback` del `Suspense` de `page.tsx` en vez
 * de duplicarlo: son el mismo hueco visto desde los dos lados, y dos versiones
 * del mismo skeleton que no coinciden son un salto de layout esperando a
 * aparecer (el riesgo que el plan anota para cada fase que cambia una pantalla).
 *
 * La forma es la real —tira de totales, títulos de sección, tarjetas con símbolo
 * y barra, botón de "Ver más sets"— y no un bloque de líneas genérico, por §9.1.
 */
export default function SetProgressLoading() {
  return <SetProgressFallback />;
}
