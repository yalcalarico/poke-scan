import type { ReactNode } from 'react';

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
  return (
    <div className="flex min-h-dvh flex-col bg-canvas font-sans text-primary">
      {children}
      <BottomNav />
      <OfflineToast />
    </div>
  );
}
