import type { ReactNode } from 'react';

import { Surface } from '@/components/ui';
import { cn } from '@/lib/cn';

export interface SettingsSectionProps {
  title: string;
  /** Una línea de contexto: qué hace esto y cuándo lo vas a querer. */
  description?: ReactNode;
  /** Acción a la derecha del título. Un solo `Button`, nunca dos (§8.1). */
  action?: ReactNode;
  /** Se separa de la anterior: son bloques independientes, no una lista. */
  className?: string;
  children?: ReactNode;
}

/**
 * El bloque de una pantalla de ajustes: `Surface` + título `h2` + descripción +
 * acción.
 *
 * Existe porque Ajustes es la primera pantalla con cinco secciones y, sin esto,
 * cada una repite `<section>` + `<h2 class="text-base font-semibold">` + `<p
 * class="text-sm">` + `aria-labelledby` con un id escrito a mano. Antes esa forma
 * estaba repetida en `profile-view.tsx`, `currency-settings.tsx` y
 * `share-links-section.tsx`.
 *
 * Server-safe a propósito: el `h2` real y el `aria-labelledby` los pone este
 * componente, así que un Server Component puede componerlo sin que todo el
 * archivo se vuelva client.
 */
export function SettingsSection({
  title,
  description,
  action,
  className,
  children,
}: SettingsSectionProps) {
  // El id sale del texto y no de `useId()`: dos secciones con el mismo título no
  // pueden existir en una pantalla, y un id estable hace que el `aria-labelledby`
  // sea legible en el HTML. Es el mismo criterio que usa `stat-row.tsx` para no
  // importar `useId` en un componente server-safe.
  const titleId = `ajustes-${slugify(title)}`;

  return (
    <Surface as="section" aria-labelledby={titleId} className={cn('flex flex-col gap-4', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={titleId} className="text-h3 text-primary">
            {title}
          </h2>
          {description ? <p className="mt-1 text-caption text-secondary">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      {children}
    </Surface>
  );
}

/** "Enlaces compartidos" → `enlaces-compartidos`. Sin acentos, sin mayúsculas. */
function slugify(value: string): string {
  return value
    .normalize('NFD')
    // Rango de marcas diacríticas combinantes: `NFD` separa la tilde de la `a`.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
