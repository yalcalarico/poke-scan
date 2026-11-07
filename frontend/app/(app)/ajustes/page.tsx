import type { Metadata } from 'next';
import {
  AppearanceSettings, AccountDeletionSettings, CurrencySettings,
  IdentityCard, RequireAuth, SessionSettings,
} from '@/components/settings';
import { AccountControls } from '@/components/settings/account-controls';
import { SettingsLayout } from '@/components/settings/settings-layout';
import { ShareLinksSection } from '@/components/share/share-links-section';

export const metadata: Metadata = {
  title: 'Ajustes',
  description: 'Tu perfil, el tema, la moneda y los enlaces que compartiste.',
  robots: { index: false, follow: false },
};

export default function SettingsPage() {
  return (
    <SettingsLayout>
      <RequireAuth>
        <IdentityCard />
        <AccountControls
          sharing={<ShareLinksSection />}
          preferences={<>
            <AppearanceSettings />
            <CurrencySettings />
            <SessionSettings />
            <AccountDeletionSettings />
          </>}
        />
      </RequireAuth>
    </SettingsLayout>
  );
}
