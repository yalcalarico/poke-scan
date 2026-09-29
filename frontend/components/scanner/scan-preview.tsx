'use client';

import { cn } from '@/lib/cn';

export interface ScanPreviewProps {
  /** `data:` de la captura de la cámara o `blob:` del archivo elegido. */
  url: string | null;
  className?: string;
  /** `true` sobre la foto: el fondo del marco es `bg-on-media`. */
  onMedia?: boolean;
}

/**
 * La miniatura de lo que se está leyendo.
 *
 * La excepción de `<img>` en vez de `next/image` está prevista por el propio
 * design system (§12): son URLs `blob:`/`data:` locales que el optimizer no
 * puede tocar, y no salen del dispositivo.
 */
export function ScanPreview({ url, className, onMedia = false }: ScanPreviewProps) {
  if (!url) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="Foto que estamos leyendo"
      className={cn(
        'h-12 w-10 shrink-0 rounded-control object-cover',
        onMedia ? 'bg-on-media' : 'border border-line bg-surface-2',
        className,
      )}
    />
  );
}
