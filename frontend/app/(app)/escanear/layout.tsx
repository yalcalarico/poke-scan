import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/**
 * Existe solo por el `metadata`.
 *
 * `app/(app)/escanear/page.tsx` es `'use client'` —la cámara, el reconocimiento visual y la
 * máquina de estados no se pueden renderizar en el servidor— y un Client
 * Component no puede exportar `metadata`. La salida idiomática es un layout
 * hermano que aporta el título y devuelve los hijos sin tocarlos: `page.tsx`
 * sigue siendo enteramente cliente y la ruta no gana ni un request.
 */
export const metadata: Metadata = {
  title: 'Escanear',
  description: 'Escaneá una carta con la cámara y agrejala a tu colección al instante.',
  robots: { index: false, follow: false },
};

export default function ScanLayout({ children }: { children: ReactNode }) {
  return children;
}
