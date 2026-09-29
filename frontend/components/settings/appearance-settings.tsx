'use client';

import { Moon, Sun, SunMoon } from 'lucide-react';

import { SegmentedControl, type SegmentedControlOption } from '@/components/ui';
import { useTheme, type Theme } from '@/lib/theme';

import { SettingsSection } from './settings-section';

const THEME_OPTIONS: readonly SegmentedControlOption<Theme>[] = [
  { value: 'system', label: 'Sistema', icon: SunMoon },
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Oscuro', icon: Moon },
];

/**
 * El toggle de tema: la sección que faltaba entera.
 *
 * **La preferencia vive en `localStorage` (`pokescan.theme`) y no en el backend,
 * y es una decisión del diseño.** `UserDto` no tiene campo de tema y no se le
 * va a agregar: la apariencia es del dispositivo, no de la cuenta. El caso que
 * lo confirma es el teléfono de la familia que comparte el mismo login que vos y
 * quiere el claro mientras vos caminás con el oscuro en la calle; si fuera del
 * lado del servidor, cada cambio pisaría al otro.
 *
 * No se monta un `ThemeProvider` acá: ya está en el layout raíz, y por eso
 * `useTheme()` funciona en cualquier pantalla sin provider propio.
 */
export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();

  return (
    <SettingsSection
      title="Apariencia"
      description="El tema se guarda en este dispositivo y no se sincroniza con tu cuenta."
    >
      <SegmentedControl
        label="Tema"
        value={theme}
        onChange={setTheme}
        options={THEME_OPTIONS}
      />
    </SettingsSection>
  );
}
