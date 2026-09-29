'use client';

import { Bluetooth, Infinity as InfinityIcon, Volume2, VolumeX, Zap, ZapOff } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/cn';

/**
 * Lo que el **dispositivo y el browser** efectivamente pueden hacer.
 *
 * Existe porque la referencia de diseño muestra cuatro controles y dos de
 * ellos no tienen contraparte real: un botón de flash que no puede prender el
 * flash, o uno de silencio sobre un stream que no tiene audio, son promesas que
 * la app no puede cumplir (§8.14: un ícono nunca es la única fuente de
 * información, y un control que no hace nada es peor que no estar).
 *
 * Por eso la lista se arma **por capacidad**, no con un array fijo: si mañana
 * `lib/scanner/camera.ts` abre el stream con audio, el botón de silencio
 * aparece solo, sin tocar este archivo.
 */
export interface CameraCapabilities {
  /** `MediaTrackCapabilities.torch` es `true` y el browser expone `ImageCapture`. */
  torch: boolean;
  /** El stream trae un track de audio: hay algo que silenciar. */
  audio: boolean;
  /**
   * Lector/accessorio Bluetooth apareado. Hoy es siempre `'none'`: no hay
   * integración ni protocolo, y ofrecerlo sería un botón vacío.
   */
  accessory: 'none' | 'bluetooth';
}

export const NO_CAMERA_CAPABILITIES: CameraCapabilities = {
  torch: false,
  audio: false,
  accessory: 'none',
};

interface CameraControl {
  key: string;
  Icon: LucideIcon;
  /** Nombre de la acción cuando está apagado. */
  label: string;
  /** Nombre de la acción cuando está encendido. */
  activeLabel: string;
  active: boolean;
  onToggle: () => void;
}

function buildControls(props: {
  capabilities: CameraCapabilities;
  torchOn: boolean;
  onToggleTorch: () => void;
  continuous: boolean;
  onToggleContinuous: () => void;
  audioOn: boolean;
  onToggleAudio: () => void;
}): CameraControl[] {
  const {
    capabilities,
    torchOn,
    onToggleTorch,
    continuous,
    onToggleContinuous,
    audioOn,
    onToggleAudio,
  } = props;

  const controls: CameraControl[] = [];

  if (capabilities.torch) {
    controls.push({
      key: 'torch',
      Icon: torchOn ? Zap : ZapOff,
      label: 'Prender el flash',
      activeLabel: 'Apagar el flash',
      active: torchOn,
      onToggle: onToggleTorch,
    });
  }

  // El modo continuo es software nuestro, no una capacidad del dispositivo:
  // siempre está disponible, y por eso es el único control sin condición.
  controls.push({
    key: 'continuous',
    Icon: InfinityIcon,
    label: 'Activar el escaneo continuo',
    activeLabel: 'Detener el escaneo continuo',
    active: continuous,
    onToggle: onToggleContinuous,
  });

  if (capabilities.audio) {
    controls.push({
      key: 'audio',
      Icon: audioOn ? Volume2 : VolumeX,
      label: 'Silenciar el micrófono',
      activeLabel: 'Activar el micrófono',
      active: !audioOn,
      onToggle: onToggleAudio,
    });
  }

  if (capabilities.accessory === 'bluetooth') {
    controls.push({
      key: 'accessory',
      Icon: Bluetooth,
      label: 'Conectar el lector Bluetooth',
      activeLabel: 'Desconectar el lector Bluetooth',
      active: false,
      onToggle: () => {},
    });
  }

  return controls;
}

export interface CameraControlsProps {
  capabilities: CameraCapabilities;
  torchOn: boolean;
  onToggleTorch: () => void;
  continuous: boolean;
  onToggleContinuous: () => void;
  audioOn: boolean;
  onToggleAudio: () => void;
  className?: string;
}

/**
 * La píldora de controles de cámara, arriba a la derecha, en `bg-on-media`.
 *
 * Es un pill único y no botones sueltos porque comparten fondo y tamaño: en
 * `z-media` sobre foto, cuatro círculos independientes se leen como ruido.
 *
 * 44 px por botón (§0.5): es la pantalla donde se usa con una sola mano y con
 * la cámara abierta, que es el peor contexto posible para un target chico.
 */
export function CameraControls({
  capabilities,
  torchOn,
  onToggleTorch,
  continuous,
  onToggleContinuous,
  audioOn,
  onToggleAudio,
  className,
}: CameraControlsProps) {
  const controls = buildControls({
    capabilities,
    torchOn,
    onToggleTorch,
    continuous,
    onToggleContinuous,
    audioOn,
    onToggleAudio,
  });

  if (controls.length === 0) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-0.5 rounded-full bg-on-media p-1 text-on-media-text shadow-lg backdrop-blur-md',
        className,
      )}
    >
      {controls.map((control) => (
        <button
          key={control.key}
          type="button"
          onClick={control.onToggle}
          aria-pressed={control.active}
          aria-label={control.active ? control.activeLabel : control.label}
          title={control.active ? control.activeLabel : control.label}
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-full',
            'transition-colors duration-fast ease-standard',
            'focus-visible:ring-2 focus-visible:ring-on-media-text/60',
            control.active ? 'bg-brand-soft text-brand' : 'hover:bg-on-media-text/15',
          )}
        >
          <control.Icon aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-5 w-5" />
        </button>
      ))}
    </div>
  );
}
