import type { ReactNode } from 'react';

import { OfflineToast } from '@/components/layout/offline-toast';

/**
 * Shell de las pantallas que **no** llevan `BottomNav`: auth y la vista
 * pública de una colección compartida.
 *
 * La nav manda a buscar, escanear, colecciones y ajustes: cuatro pantallas de
 * *tu* cuenta. Abajo de un formulario de dos campos, o arriba de la colección
 * de otra persona, es un convite a salir de la pantalla. En la pública además
 * puede no haber cuenta, y el "Iniciar sesión" sería un pitched fuera de lugar.
 *
 * El `OfflineToast` sí va: la lectura de una colección compartida funciona sin
 * conexión, y el visitante tiene que enterarse de por qué.
 */
export function PlainShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas font-sans text-primary">
      {children}
      <OfflineToast />
    </div>
  );
}
