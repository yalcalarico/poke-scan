'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

import { Skeleton } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';

/**
 * Guarda de sesión para Ajustes.
 *
 * Referencia histórica: el `ProtectedRoute` anterior hardcodeaba un spinner con
 * clases crudas sobre el canvas claro.
 *
 * Por qué un guard y no un redirect en el server: la sesión vive en el
 * navegador (`sessionStorage`), así que el server no sabe si hay token. El
 * patrón del proyecto es renderizar igual y decidir en el cliente
 * (`docs/routes.md`, "Ninguna bloquea el acceso en el server").
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/login`);
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div role="status" aria-label="Verificando sesión" className="flex flex-col gap-4">
        <Skeleton variant="block" className="h-40" />
        <Skeleton variant="block" className="h-32" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return <>{children}</>;
}
