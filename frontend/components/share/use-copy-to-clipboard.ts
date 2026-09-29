'use client';

import { useCallback } from 'react';

import { copyToClipboard } from '@/components/share/copy-to-clipboard';
import { useToast } from '@/components/ui';

export interface CopyOptions {
  /** Lo que se copió, para el toast: "Enlace copiado", "Invitación copiada". */
  message?: string;
  /** Para el error: qué puede hacer el usuario a mano si el portapapeles no está. */
  fallback?: string;
}

/**
 * Copiar + avisar, en un hook.
 *
 * **Por qué `useToast()` y no un feedback propio.** Resolver el "copiado" con un
 * `setTimeout` de 1,8 s y un `<p role="status">` con `min-h-4` que cada tarjeta
 * mantiene en el DOM para que el texto no saltara de alto es exactamente lo que
 * §8.10 viene a reemplazar: un temporizador propio por componente, un nodo de
 * reserva permanente por tarjeta, y un anuncio que se pierde si el usuario
 * scrollea. El toast vive en un portal único, se apila, se descarta solo a los
 * 4 s, pausa el timer en hover y —lo que más importa acá— **no ocupa lugar en el
 * layout**.
 *
 * Se conserva `copyToClipboard()` con su fallback a `execCommand`, que hace
 * falta en contexto no seguro (ver el comentario de ese archivo). Ese fallback
 * es la diferencia entre "copiar funciona en la PWA probada desde el celular" y
 * "no funciona nunca en la wifi de casa", así que no se toca.
 */
export function useCopyToClipboard(): (text: string, options?: CopyOptions) => Promise<boolean> {
  const toast = useToast();

  return useCallback(
    async (text: string, options: CopyOptions = {}): Promise<boolean> => {
      const copied = await copyToClipboard(text);

      if (copied) {
        toast.success(options.message ?? 'Enlace copiado');
        return true;
      }

      toast.error(options.fallback ?? 'No pudimos copiar. Mantené presionado el link para copiarlo a mano.');
      return false;
    },
    [toast],
  );
}
