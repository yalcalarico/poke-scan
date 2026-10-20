import { Suspense, type ReactNode } from 'react';
import { VisualPreviewProvider } from '@/components/visual-preview/visual-preview';

import { BottomNav } from '@/components/layout/bottom-nav';
import { OfflineToast } from '@/components/layout/offline-toast';

/**
 * Chrome de las pantallas de cuenta: buscar, escanear, colecciones, ajustes y
 * la home. Son las que llevan `BottomNav`.
 *
 * Lo único que hace es pintar el canvas y montar la nav. `ThemeProvider`,
 * `ToastProvider`, `AuthProvider` y `CurrencyProvider` están **arriba**, en el
 * layout raíz: son de la app entera y no de un tipo de pantalla, así que
 * montarlos por rama los duplicaría y el estado de la moneda y del tema se
 * perdería al navegar.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const content = <>
    {children}
    <BottomNav />
    <OfflineToast />
  </>;
  return (
    <div className="flex min-h-dvh flex-col bg-canvas font-sans text-primary">
      <Suspense fallback={content}>
        <VisualPreviewProvider>{content}</VisualPreviewProvider>
      </Suspense>
    </div>
  );
}
