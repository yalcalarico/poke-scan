import type { ReactNode } from 'react';

import { PlainShell } from '@/components/layout/plain-shell';

/**
 * Layout de la colección compartida. Existe para que `/share/[slug]` NO
 * herede la `BottomNav` de `(app)`: la navegación de la cuenta del visitante
 * arriba de la colección de otra persona es un convite a dejar de mirarla.
 *
 * No es un route group como `(auth)` porque no aporta nada: no lleva `error.tsx`
 * ni `not-found.tsx` propios, y los providers ya están en el layout raíz.
 */
export default function ShareLayout({ children }: { children: ReactNode }) {
  return <PlainShell>{children}</PlainShell>;
}
