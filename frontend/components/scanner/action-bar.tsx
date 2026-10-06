'use client';

import { Images, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

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
  onPickFromGallery: () => void;
  onDiscard: () => void;
  onCapture: () => void;
  onOrganize: () => void;
  /** Se anuncia a lectores de pantalla y se ve bajo la barra. */
  status: string;
}

/**
 * 44 px: es la pantalla de una mano con la cámara abierta (§0.5).
 *
 * ## El foco acá no usa `--focus-ring`
 *
 * Es la única excepción de la app al patrón de `Button`/`Chip`, y no por
 * gusto. `--focus-ring` es el rojo de marca: sobre el velo `--on-media` —que es
 * negro al 72 % sobre una foto— mide 1,9:1 en claro y 2,6:1 en dark, y los dos
 * están muy por debajo de los 3:1 de SC 1.4.11. El token correcto acá es
 * `--on-media-text` a color pleno: blanco contra ese mismo velo da más de 9:1 en
 * los dos temas, y el control es redondo, así que el contraste contra el fondo
 * es lo único que hay que defender.
 *
 * `outline` y no `ring` por lo de siempre: el UA lo fuerza a `none` en high
 * contrast, que es donde más hace falta. Y `outline-offset-2` **no mueve nada**:
 * el `outline` se dibuja afuera de la caja y no participa del layout, así que
 * los 4 px de aire no empujan la fila del obturador ni la barra contra el borde
 * inferior. Ver el comentario de `pb-[calc(...)]` más abajo.
 */
const MEDIA_ICON_BUTTON = [
  'flex h-11 w-11 items-center justify-center rounded-full',
  'bg-on-media text-on-media-text shadow-lg backdrop-blur-md',
  'transition-colors duration-fast ease-standard hover:bg-on-media-text/20',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-media-text',
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
        La barra del reconocimiento visual va ACÁ y no en un modal porque la cámara sigue viva
        mientras corre: tapar la pantalla para decir "leyendo" le quita al
        usuario el control de la foto, que es justo lo que puede corregir
        mientras espera.

        ─── El `pb` y los 4 px del `outline` ───

        Ese padding de abajo no es decorativo: es el clearance del foco. El
        `Organizar (N)` es el control más bajo de la barra, y su `outline` de
        2 px con `offset-2` se dibuja 4 px **por fuera** de la caja. Con los 12 px
        de `pb` más `env(safe-area-inset-bottom)` (34 px en un iPhone con
        indicador) el borde externo del outline queda a 46 px del borde de la
        pantalla: no se recorta ni contra la barra ni contra el indicador de
        inicio. El `pt-3` del otro lado hace lo mismo por arriba de la fila del
        obturador.

        Y nada de esto **desplaza** la barra: el `outline` no es parte del layout,
        a diferencia del `ring`, que era un `box-shadow` y tampoco — pero que al
        ser 2 px sin offset tampoco daba el aire que hace legible el indicador.
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
            // Mismo token que `MEDIA_ICON_BUTTON` y por el mismo motivo: el rojo
            // de `--focus-ring` no llega a 3:1 sobre la foto. El obturador mide
            // 80 px y vive en el centro de una fila de 358 px de ancho, así que
            // los 4 px del outline caen de sobra dentro de la barra; el
            // `overflow` que sí lo recortaría es el del `stage` de la
            // `CameraView`, y el obturador no está adentro de él.
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-media-text',
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
        <p className="min-w-0 flex-1 truncate text-caption text-on-media-text">{status}</p>

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
    </div>
  );
}
