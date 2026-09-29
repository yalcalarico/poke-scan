'use client';

import { Avatar, StatRow, Surface } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { formatDate } from '@/lib/format';

import { SettingsSection } from './settings-section';

/**
 * Quién sos.
 *
 * **Acá se usa `UserDto.avatarUrl`, que estaba en el contrato desde el
 * principio y nunca se había pintado**: antes se hardcodeaba la inicial
 * (`profile-view.tsx`) con un `div` y clases sueltas.
 *
 * El email se muestra sin problema: esta es la pantalla de la cuenta del
 * propio usuario, detrás de la sesión, y es el único lugar donde tiene sentido
 * verlo.
 */
export function IdentityCard() {
  const { user } = useAuth();

  // Sin sesión el guard no deja llegar acá, pero los tipos no lo saben: se
  // escribe el caso igual y no se rompe la pantalla.
  if (!user) return null;

  return (
    <SettingsSection title="Identidad" description="Así te ven los demás cuando compartís una colección.">
      <div className="flex items-center gap-4">
        <Avatar src={user.avatarUrl} name={user.displayName} size="xl" />
        <div className="min-w-0">
          <p className="truncate text-h3 text-primary">{user.displayName}</p>
          <p className="truncate text-caption text-secondary">{user.email}</p>
          <p className="mt-0.5 truncate text-caption text-tertiary">@{user.username}</p>
        </div>
      </div>

      <Surface className="bg-surface-2 shadow-none">
        <dl>
          <StatRow title="Miembro desde" value={formatDate(user.createdAt)} />
        </dl>
      </Surface>
    </SettingsSection>
  );
}
