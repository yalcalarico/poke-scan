import type { ReactNode } from 'react';

import styles from '@/components/visual-preview/visual-preview.module.css';
import { cn } from '@/lib/cn';
import { OfflineToast } from '@/components/layout/offline-toast';

/**
 * Shell de las pantallas que **no** llevan `BottomNav`: auth y la vista
 * pública de una colección compartida.
 *
 * La nav manda a inicio, buscar, escanear, colecciones y ajustes: pantallas de
 * *tu* cuenta. Abajo de un formulario de dos campos, o arriba de la colección
 * de otra persona, es un convite a salir de la pantalla. En la pública además
 * puede no haber cuenta, y el "Iniciar sesión" sería un pitched fuera de lugar.
 *
 * El `OfflineToast` avisa si falta conexión: el enlace público necesita la red
 * para comprobar su vigencia y no conserva copias de la colección para offline.
 */
export function PlainShell({ children }: { children: ReactNode }) {
  return (
    <div className={cn(styles.scope,"flex min-h-dvh flex-col bg-canvas font-sans text-primary")}>
      {children}
      <OfflineToast />
    </div>
  );
}
