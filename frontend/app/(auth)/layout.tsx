import type { ReactNode } from 'react';

import { PlainShell } from '@/components/layout/plain-shell';

/**
 * Layout de `/login` y `/registro`. Vive en `(auth)` y no en `(app)` para no
 * heredar la `BottomNav`: las cuatro tabs apuntan a la cuenta de un usuario
 * que en una pantalla de auth todavía no existe.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <PlainShell>{children}</PlainShell>;
}
