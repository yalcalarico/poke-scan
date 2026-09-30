import Image from 'next/image';

import { cn } from '@/lib/cn';

/** `/public/icons/icon-192.png`, el ícono que ya genera `scripts/generate-icons.mjs`. */
const MARK_SRC = '/icons/icon-192.png';

export interface AppMarkProps {
  /** Alto y ancho en px. El ícono es cuadrado y siempre se ve a lo ancho. */
  size?: number;
  /** Solo para ubicación y sombra. */
  className?: string;
}

/**
 * La marca de la app: el ícono real, no un SVG dibujado a mano.
 *
 * Referencia histórica: la app anterior tenía dos logos distintos dibujados
 * como `<svg>` inline —uno en la antigua home y otro en `app/(auth)/layout.tsx`—
 * y el design system pide explícitamente que los SVG sueltos desaparezcan
 * (§8.14). El ícono del manifest ya existe, ya es el que el launcher muestra
 * en el home screen, y usarlo acá garantiza que la web y la PWA instalada
 * digan lo mismo.
 *
 * **Vive en `brand/` y no en `home/` ni en `auth/`:** la marca es de la
 * *aplicación*, no de una pantalla. Estaba en `home/` y la importaban la home y
 * el shell de autenticación, que es un acoplamiento que no dice nada del
 * dominio: cuando aparezca una tercera pantalla que la use (el perfil, un
 * fallback de error, la pantalla de instalar) el import va a seguir siendo el
 * mismo en los tres casos.
 *
 * `alt=""` a propósito: el nombre de la app siempre está al lado como texto, y
 * un `alt` que repite lo que dice el texto de al lado hace que el lector de
 * pantalla lo lea dos veces.
 */
export function AppMark({ size = 40, className }: AppMarkProps) {
  return (
    <Image
      src={MARK_SRC}
      alt=""
      width={size}
      height={size}
      // El PNG pesa 5 KB; servirlo directo evita el optimizador y su caché
      // intermedio para una marca local que no necesita transformación.
      unoptimized
      // `priority` en todas las pantallas que lo usan: la marca está siempre
      // arriba del fold y es el primer request de la ruta.
      priority
      className={cn('rounded-control', className)}
    />
  );
}
