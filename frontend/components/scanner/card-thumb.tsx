'use client';

import Image from 'next/image';

import { cn } from '@/lib/cn';
import type { CardDto } from '@/types/api';

export interface CardThumbProps {
  card: Pick<CardDto, 'name' | 'imageSmall' | 'imageLarge'>;
  /** Ancho en px. El alto sale de la proporción real de una carta (63 × 88). */
  width?: number;
  className?: string;
  /** `true` cuando la miniatura está sobre la foto: el marco no compite. */
  onMedia?: boolean;
  priority?: boolean;
}

const RATIO = 63 / 88;

/**
 * La miniatura de una carta. Vive en `scanner/` y no en `cards/` porque solo la
 * usa el escáner: es más chica que la del `CardTile` y no comparte layout con
 * él.
 */
export function CardThumb({
  card,
  width = 44,
  className,
  onMedia = false,
  priority = false,
}: CardThumbProps) {
  const height = Math.round(width / RATIO);

  return (
    <div
      className={cn(
        'shrink-0 overflow-hidden rounded-control',
        onMedia ? 'bg-on-media' : 'border border-line bg-surface-2',
        className,
      )}
    >
      <Image
        src={card.imageSmall || card.imageLarge}
        alt=""
        width={width}
        height={height}
        sizes={`${width}px`}
        priority={priority}
        className="h-auto w-full object-contain"
      />
    </div>
  );
}
