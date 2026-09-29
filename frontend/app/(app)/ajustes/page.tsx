import type { Metadata } from 'next';

import { ScreenContainer } from '@/components/layout/screen-container';
import { ScreenHeader } from '@/components/layout/screen-header';
import {
  AppearanceSettings,
  CurrencySettings,
  IdentityCard,
  RequireAuth,
  SessionSettings,
} from '@/components/settings';
import { ShareLinksSection } from '@/components/share/share-links-section';

/**
 * `/ajustes` — el centro de ajustes.
 *
 * **Por qué la ruta se llama `perfil` y la pantalla "Ajustes"**: la tab de la
 * `BottomNav` dice "Ajustes" (`nav.ts`) y ese es el nombre de la pantalla. El
 * renombre de la ruta a `/ajustes` quedó pendiente: hay que mover la página y
 * dejar acá un `permanentRedirect('/ajustes', '/ajustes')` en el mismo commit,
 * porque `/ajustes` ya está linkeada desde la tab y desde los enlaces públicos.
 * Ver `docs/redesign-2026.md`.
 */
export const metadata: Metadata = {
  title: 'Ajustes',
  description: 'Tu perfil, el tema, la moneda y los enlaces que compartiste.',
};

export default function SettingsPage() {
  return (
    <>
      <ScreenHeader title="Ajustes" />

      <ScreenContainer labelledBy="ajustes-titulo">
        {/*
          El `ScreenHeader` pinta el título en un `<p>` (es chrome, no estructura),
          así que el `<h1>` de la pantalla va acá, para lectores de pantalla, y
          `<main>` se rotula con él. Es la solución estándar cuando el título
          visible vive en un componente de chrome.
        */}
        <h1 id="ajustes-titulo" className="sr-only">
          Ajustes
        </h1>

        <RequireAuth>
          <div className="flex flex-col gap-6 sm:gap-8">
            <IdentityCard />
            <AppearanceSettings />
            <CurrencySettings />
            <ShareLinksSection />
            <SessionSettings />
          </div>
        </RequireAuth>
      </ScreenContainer>
    </>
  );
}
