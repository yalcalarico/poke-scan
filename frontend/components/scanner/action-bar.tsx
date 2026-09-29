'use client';

import { Images, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';

import { formatCount } from './copy';
import { ScanPreview } from './scan-preview';

export interface ActionBarProps {
  /** 0..1 del OCR en curso, o `null` si no hay nada corriendo. */
  progress: number | null;
  /** Frase de la fase, corta. Ya vive en `copy.ts`. */
  headline: string;
  /** Detalle de la fase, una línea más abajo. */
  detail: string;
  /**
   * Miniatura del recorte exacto que se está leyendo. No es lo mismo que lo que
   * muestra el visor: la captura viene recortada al rectángulo del marco, así
   * que sirve en los dos caminos —obturador y galería— para que el usuario vea
   * qué foto va a leer el OCR.
   */
  previewUrl: string | null;
  sessionCount: number;
  canCapture: boolean;
  isCapturing: boolean;
  onPickFromGallery: () => void;
  onDiscard: () => void;
  onCapture: () => void;
  onOrganize: () => void;
  /** Se anuncia a lectores de pantalla y se ve bajo la barra. */
  status: string;
}

/** 44 px: es la pantalla de una mano con la cámara abierta (§0.5). */
const MEDIA_ICON_BUTTON = [
  'flex h-11 w-11 items-center justify-center rounded-full',
  'bg-on-media text-on-media-text shadow-lg backdrop-blur-md',
  'transition-colors duration-fast ease-standard hover:bg-on-media-text/20',
  'focus-visible:ring-2 focus-visible:ring-on-media-text/60',
  'disabled:pointer-events-none disabled:opacity-40',
];

function MediaIconButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(MEDIA_ICON_BUTTON)}
    >
      <Icon aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-5 w-5" />
    </button>
  );
}

/**
 * La barra de acciones del scanner: galería, descartar, obturador y
 * `Organizar (N)`.
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
  onPickFromGallery,
  onDiscard,
  onCapture,
  onOrganize,
  status,
}: ActionBarProps) {
  return (
    <div className="shrink-0 bg-on-media px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 text-on-media-text">
      {/*
        La barra del OCR va ACÁ y no en un modal porque la cámara sigue viva
        mientras corre: tapar la pantalla para decir "leyendo" le quita al
        usuario el control de la foto, que es justo lo que puede corregir
        mientras espera.
      */}
      {progress !== null ? (
        <div className="mb-3 flex flex-col gap-1.5" role="status" aria-live="polite">
          <div className="flex items-center gap-2.5">
            <ScanPreview url={previewUrl} onMedia />

            <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
              <p className="min-w-0 truncate text-caption">{headline}</p>
              <p className="shrink-0 text-caption text-on-media-text/60 tabular-nums">
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

          <p className="text-caption text-on-media-text/60">{detail}</p>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <MediaIconButton
          icon={Images}
          label="Elegir una foto de la carta"
          onClick={onPickFromGallery}
        />

        <button
          type="button"
          onClick={onCapture}
          disabled={!canCapture || isCapturing}
          aria-label="Tomar foto de la carta"
          className={cn(
            'flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-on-media-text',
            'bg-on-media-text/20 shadow-lg backdrop-blur-md',
            'transition-transform duration-instant ease-standard active:scale-90',
            'focus-visible:ring-2 focus-visible:ring-on-media-text/70',
            'disabled:pointer-events-none disabled:opacity-40',
          )}
        >
          <span aria-hidden="true" className="h-7 w-7 rounded-full bg-on-media-text" />
        </button>

        <MediaIconButton
          icon={Trash2}
          label="Descartar la última lectura"
          onClick={onDiscard}
          disabled={sessionCount === 0}
        />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <p className="min-w-0 flex-1 truncate text-caption text-on-media-text/70">{status}</p>

        <Button
          variant="inverse"
          size="sm"
          onClick={onOrganize}
          disabled={sessionCount === 0}
          className="shrink-0"
        >
          Organizar ({formatCount(sessionCount)})
        </Button>
      </div>
    </div>
  );
}
