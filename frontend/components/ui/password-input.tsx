'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

import { Input, type InputProps, type InputSize } from './input';
import { IconButton } from './icon-button';

export interface PasswordInputProps
  extends Omit<InputProps, 'type' | 'leadingIcon' | 'trailingSlot'> {
  /** Etiqueta accesible del toggle en estado apagado. */
  showLabel?: string;
  /** Etiqueta accesible del toggle en estado encendido. */
  hideLabel?: string;
}

/**
 * `Input` + un toggle de visibilidad. El login no lo tenía y era un gap
 * conocido: en mobile, con la contraseña autocompletada, no hay forma de
 * verificar qué se escribió sin larga pulsación sobre el campo (que en iOS
 * dispara el menu de pegar).
 *
 * El toggle es un `IconButton`, o sea un `<button>` de verdad: llega con Tab y
 * se activa con Enter y con Espacio. Anuncia su estado de dos formas —`aria-label`
 * dinámico ("Mostrar contraseña" / "Ocultar contraseña") y `aria-pressed`— porque
 * un ícono sin nombre ni estado es un botón que no se puede usar a ciegas.
 */
export function PasswordInput({
  className,
  size = 'md',
  showLabel = 'Mostrar contraseña',
  hideLabel = 'Ocultar contraseña',
  disabled,
  ...props
}: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false);
  const resolvedSize: InputSize = size ?? 'md';
  // El botón no puede exceder el alto del campo: en `sm` un botón de 40 px
  // dentro de un input de 32 px se sale del track.
  const toggleSize = resolvedSize === 'lg' ? 'h-10 w-10' : 'h-8 w-8';

  return (
    <Input
      {...props}
      className={className}
      size={resolvedSize}
      type={isVisible ? 'text' : 'password'}
      trailingSlot={
        <IconButton
          icon={isVisible ? EyeOff : Eye}
          label={isVisible ? hideLabel : showLabel}
          aria-pressed={isVisible}
          disabled={disabled}
          onClick={() => setIsVisible((visible) => !visible)}
          className={toggleSize}
        />
      }
    />
  );
}
