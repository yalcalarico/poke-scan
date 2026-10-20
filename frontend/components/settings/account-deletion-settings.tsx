import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

import { buttonVariants } from '@/components/ui';
import { SettingsSection } from './settings-section';

export function AccountDeletionSettings() {
  return (
    <SettingsSection title="Eliminar cuenta" description="Retirá tu cuenta y administrá tus datos personales.">
      <div className="flex flex-col items-start gap-3">
        <p className="text-caption text-secondary">
          La pantalla siguiente te permite revisar qué implica y confirmar con tu contraseña actual.
        </p>
        <Link href="/eliminar-cuenta" className={buttonVariants({ variant: 'secondary', size: 'md' })}>
          Revisar eliminación <ChevronRight aria-hidden="true" focusable="false" className="h-4 w-4" />
        </Link>
      </div>
    </SettingsSection>
  );
}
