'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Download, Share } from 'lucide-react';

import { Button, Surface } from '@/components/ui';

/**
 * `beforeinstallprompt` no está en `lib.dom.d.ts`, así que el evento se tipa con
 * un guard en vez de con un `as`. La regla del proyecto es "cero `any`; si el
 * tipo es unknowable, tipalo con un guard", y este es exactamente el caso.
 */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function isInstallPrompt(value: unknown): value is InstallPromptEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'prompt' in value &&
    typeof value.prompt === 'function' &&
    'userChoice' in value &&
    typeof value.userChoice === 'object'
  );
}

type InstallState = 'unavailable' | 'installable' | 'installed';

/**
 * La CTA de instalar la PWA, en el footer de la colección compartida.
 *
 * Es el momento con la mejor conversión de toda la app: alguien que está
 * mirando la colección de otro está a un paso de querer tener la suya.
 *
 * **Los tres estados, porque los tres existen** (gotchas #5: una suposición
 * sobre el entorno sin fallback es pantalla en blanco):
 *
 * - `installable` — Chromium guardó el evento y hay botón.
 * - `installed` — ya se está corriendo standalone: no se ofrece instalar.
 * - `unavailable` — **el caso por defecto en iOS y Safari**, que no implementan
 *   `beforeinstallprompt` nunca. Ahí no se puede programmatically instalar, así
 *   que en vez de un botón que no hace nada se explica el camino real
 *   ("Compartir → Agregar a pantalla de inicio").
 */
export function InstallCta() {
  const [state, setState] = useState<InstallState>('unavailable');
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const media = window.matchMedia('(display-mode: standalone)');
    const syncFromEnvironment = () => {
      setState(media.matches ? 'installed' : 'unavailable');
    };
    syncFromEnvironment();
    media.addEventListener('change', syncFromEnvironment);

    const onBeforeInstall = (event: Event) => {
      // Sin esto Chromium abre su propio mini-infobar y el `prompt()` nunca
      // devuelve, así que el botón quedaría muerto.
      event.preventDefault();
      if (isInstallPrompt(event)) {
        setPromptEvent(event);
        setState('installable');
      }
    };
    const onInstalled = () => {
      setPromptEvent(null);
      setState('installed');
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      media.removeEventListener('change', syncFromEnvironment);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    await promptEvent.userChoice;
    setPromptEvent(null);
  }, [promptEvent]);

  if (state === 'installed') {
    return (
      <Surface className="w-full max-w-sm bg-surface-2 shadow-none">
        <p className="flex items-center justify-center gap-2 text-caption text-secondary">
          <Check aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-4 w-4" />
          Ya tenés PokéScan instalada en este dispositivo.
        </p>
      </Surface>
    );
  }

  if (state === 'unavailable') {
    return (
      <Surface className="w-full max-w-sm bg-surface-2 shadow-none">
        <p className="flex items-center justify-center gap-2 text-caption text-secondary">
          <Share aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-4 w-4" />
          Sumala a tu pantalla de inicio desde el menú de compartir del navegador.
        </p>
      </Surface>
    );
  }

  return (
    <Surface className="w-full max-w-sm">
      <p className="text-caption text-secondary">
        Escaneá tus cartas, mirá su valor y armá tu propia colección.
      </p>
      <Button
        fullWidth
        className="mt-3"
        onClick={() => void handleInstall()}
        // El link a la app es la alternativa para el que no puede instalar
        // (iOS): queda en la misma línea, no en un segundo botón que compite.
      >
        <Download aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-4 w-4" />
        Instalar la app
      </Button>
    </Surface>
  );
}
