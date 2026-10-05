'use client';

import { Camera, ImageUp, Search } from 'lucide-react';

import { Button, Surface } from '@/components/ui';

export interface IdlePanelProps {
  visualCamera?: boolean;
  showCamera?: boolean;
  cameraAvailable: boolean;
  sessionCount: number;
  onScan: () => void;
  onPickFromGallery: () => void;
  onManualSearch: () => void;
  onOrganize: () => void;
}

/**
 * El estado en reposo.
 *
 * Sin gradiente oscuro: pasa a `Surface` con `rounded-panel`, el
 * ícono de cámara en un círculo `bg-brand-soft text-brand` y los tres CTAs como
 * `Button`. El beneficio real no es estético: sobre `bg-canvas` los tokens de
 * superficie funcionan, y el panel se lee con el tema claro sin haber hecho una
 * variante a mano.
 *
 * Cuando la cámara no está disponible el CTA primario no desaparece —se
 * deshabilita con su motivo al lado—, porque la pantalla **sí** tiene para qué
 * estar: subir una foto o buscar a mano hacen lo mismo.
 */
export function IdlePanel({
  visualCamera = true,
  showCamera = true,
  cameraAvailable,
  sessionCount,
  onScan,
  onPickFromGallery,
  onManualSearch,
  onOrganize,
}: IdlePanelProps) {
  return (
    <Surface className="flex flex-col items-center gap-4 rounded-panel px-6 py-8 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-soft text-brand">
        {showCamera ? <Camera aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-10 w-10" /> : <ImageUp aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-10 w-10" />}
      </div>

      <div className="flex max-w-sm flex-col gap-1">
        <h2 className="text-h3 text-primary">{showCamera ? 'Escanear carta' : 'Reconocer una carta'}</h2>
        <p className="text-body text-secondary">
          {showCamera && visualCamera
            ? 'Encuadrá la carta y mantenela quieta. La primera coincidencia se suma a esta sesión para que la revises.'
            : 'Subí una foto nítida, sin reflejos y con una sola carta. La primera coincidencia se suma a esta sesión para que la revises.'}
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3">
        {showCamera ? <Button variant="primary" size="lg" onClick={onScan} disabled={!cameraAvailable} fullWidth>
          Escanear carta
        </Button> : null}

        {showCamera && !cameraAvailable ? (
          <p className="text-caption text-tertiary">
            La cámara no está disponible en este dispositivo o conexión. Subí una foto o buscá a
            mano.
          </p>
        ) : null}

        <Button variant={showCamera ? 'secondary' : 'primary'} size="lg" onClick={onPickFromGallery} fullWidth>
          <ImageUp aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-5 w-5" />
          Subir una foto
        </Button>
        <p className="text-caption text-tertiary">
          Útil en desktop o si no querés usar la cámara.
        </p>

        <Button variant="secondary" size="lg" onClick={onManualSearch} fullWidth>
          <Search aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-5 w-5" />
          Buscar a mano
        </Button>

        {sessionCount > 0 ? (
          <Button variant="ghost" size="md" onClick={onOrganize} fullWidth>
            Organizar la sesión ({sessionCount})
          </Button>
        ) : null}
      </div>
    </Surface>
  );
}
