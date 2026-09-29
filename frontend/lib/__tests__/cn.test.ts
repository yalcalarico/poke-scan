import { describe, expect, it } from 'vitest';

// El alias `@/` no está configurado en `vitest.config.ts` (ver `select-utils.test.ts`),
// así que los tests de `lib/` usan rutas relativas.
import { cn } from '../cn';

/**
 * Regresión de un bug silencioso: `tailwind-merge` no conoce las utilidades
 * tipográficas propias del design system, así que las metía en el mismo grupo
 * que los colores de texto y `cn('text-label', 'text-positive')` devolvía solo
 * `text-positive`. El componente se veía con 16 px en vez de 13 px y no había
 * ningún error en ningún lado: solo se veía mal.
 */
describe('cn', () => {
  it('deja convivir un tamaño de la escala con un color de texto', () => {
    expect(cn('text-label', 'text-positive')).toBe('text-label text-positive');
    expect(cn('text-body', 'text-tertiary')).toBe('text-body text-tertiary');
    expect(cn('text-display', 'text-primary')).toBe('text-display text-primary');
  });

  it('funciona en cualquier orden', () => {
    expect(cn('text-positive', 'text-label')).toBe('text-positive text-label');
  });

  it('pisa el tamaño cuando el call site manda otro tamaño de la escala', () => {
    expect(cn('text-label', 'text-h3')).toBe('text-h3');
  });

  it('no deja competir la escala con un tamaño arbitrario de Tailwind', () => {
    // `text-[13px]` está además prohibido por §3.1 del design system, pero si
    // llegara a colarse tiene que pisar a la escala, no competir con ella.
    expect(cn('text-label', 'text-[13px]')).toBe('text-[13px]');
    expect(cn('text-[13px]', 'text-label')).toBe('text-label');
  });

  it('conserva utilidades que no son de tamaño ni de color', () => {
    expect(cn('text-display', 'text-positive', 'tabular-nums')).toBe(
      'text-display text-positive tabular-nums',
    );
  });

  it('sigue resolviendo condicionales y arrays como clsx', () => {
    expect(cn('px-4', false && 'hidden', ['gap-2', null], undefined)).toBe('px-4 gap-2');
  });

  it('pisa el padding duplicado del call site', () => {
    expect(cn('rounded-control px-4 py-2.5', 'px-6')).toBe('rounded-control py-2.5 px-6');
  });
});
