'use client';

import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';

import { formatCount } from './copy';
import { ScanPreview } from './scan-preview';

export interface ActionBarProps {
  /** 0..1 del reconocimiento visual en curso, o `null` si no hay nada corriendo. */
  progress: number | null;
  /** Frase de la fase, corta. Ya vive en `copy.ts`. */
  headline: string;
  /** Detalle de la fase, una línea más abajo. */
  detail: string;
  /**
   * Miniatura del recorte exacto que se está leyendo. No es lo mismo que lo que
   * muestra el visor: la captura viene recortada al rectángulo del marco, así
   * que sirve en los dos caminos —obturador y galería— para que el usuario vea
   * qué foto va a leer el reconocimiento visual.
   */
  previewUrl: string | null;
  sessionCount: number;
  canCapture: boolean;
  isCapturing: boolean;
  onCapture: () => void;
  onOrganize: () => void;
  /** Estado de cámara anunciado a lectores de pantalla. */
  status: string;
}

/**
 * La barra prioriza la captura y el paso siguiente en una única fila.
 *
 * El obturador mide 80 px y lleva `border-on-media-text` en vez de
 * `border-inverse`: `inverse` es blanco en claro y **negro en dark**, así que
 * sobre la foto el borde desaparecería con el tema oscuro. Es exactamente para
 * esto que existe `--on-media-text` — el chrome del scanner se ve igual en los
 * dos temas.
 */
export function ActionBar({
  progress,
  headline,
  detail,
  previewUrl,
  sessionCount,
  canCapture,
  isCapturing,
  onCapture,
  onOrganize,
  status,
}: ActionBarProps) {
  return (
    <div className="shrink-0 bg-on-media px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 text-on-media-text">
      {/*
        La barra de progreso acompaña el video para no tapar el marco. El
        espacio inferior conserva el área segura y el aire para el foco visible.
      */}
      {progress !== null ? (
        <div className="mb-3 flex flex-col gap-1.5" role="status" aria-live="polite">
          <div className="flex items-center gap-2.5">
            <ScanPreview url={previewUrl} onMedia />

            <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
              <p className="min-w-0 truncate text-caption">{headline}</p>
              <p className="shrink-0 text-caption text-on-media-text tabular-nums">
                {Math.round(progress * 100)}%
              </p>
            </div>
          </div>

          <div
            role="progressbar"
            aria-label="Progreso de la lectura de la carta"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            className="h-1.5 w-full overflow-hidden rounded-full bg-on-media-text/20"
          >
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-base ease-standard"
              style={{ width: `${Math.max(4, Math.round(progress * 100))}%` }}
            />
          </div>

          <p className="text-caption text-on-media-text">{detail}</p>
        </div>
      ) : null}

      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={onCapture}
          disabled={!canCapture || isCapturing}
          aria-label="Tomar foto de la carta"
          className={cn(
            'flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-on-media-text',
            'bg-on-media-text/20 shadow-lg backdrop-blur-md',
            'transition-transform duration-instant ease-standard active:scale-90',
            // El contorno blanco conserva contraste sobre la foto en ambos temas.
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-media-text',
            'disabled:pointer-events-none disabled:opacity-40',
          )}
        >
          <span aria-hidden="true" className="h-7 w-7 rounded-full bg-on-media-text" />
        </button>

        <Button
          variant="inverse"
          size="md"
          onClick={onOrganize}
          disabled={sessionCount === 0}
          className="shrink-0"
        >
          Continuar ({formatCount(sessionCount)})
        </Button>
      </div>
      <p className="sr-only" role="status" aria-live="polite">{status}</p>
    </div>
  );
}
