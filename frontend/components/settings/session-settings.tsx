'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';

import { Button } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';

import { SettingsSection } from './settings-section';

/**
 * Cerrar sesión.
 *
 * Va en su propia sección y no al pie de Identidad: es la única acción
 * destructiva de la pantalla y mezclada con el avatar se lee como una más de la
 * tarjeta.
 */
export function SessionSettings() {
  const router = useRouter();
  const { logout } = useAuth();
  const [isPending, setIsPending] = useState(false);

  async function handleLogout() {
    setIsPending(true);
    try {
      await logout();
      router.replace(`/login`);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <SettingsSection title="Sesión" description="Tu colección queda guardada en el servidor.">
      <Button
        variant="secondary"
        loading={isPending}
        pendingLabel="Saliendo…"
        onClick={() => void handleLogout()}
        className="self-start"
      >
        <LogOut aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-4 w-4" />
        Cerrar sesión
      </Button>
    </SettingsSection>
  );
}
