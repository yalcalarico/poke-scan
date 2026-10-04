import Link from 'next/link';
import { Layers, ScanLine, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Surface } from '@/components/ui';

interface Feature {
  href: string;
  icon: LucideIcon;
  title: string;
  /** Una línea (§10.1). */
  description: string;
}

/**
 * Las tres cosas que la app hace, y su `href`. Los textos están así a propósito:
 * verbo en voseo, tildes, y una idea por tarjeta.
 */
const FEATURES: readonly Feature[] = [
  {
    href: `/escanear`,
    icon: ScanLine,
    title: 'Escaneá',
    description: 'Encuadrá la carta y DINOv2 reconoce el dibujo automáticamente.',
  },
  {
    href: `/buscar`,
    icon: Search,
    title: 'Buscá',
    description: 'Encontrá cartas por nombre, número o artista en el catálogo.',
  },
  {
    href: `/colecciones`,
    icon: Layers,
    title: 'Coleccioná',
    // "tu progreso" era una promesa genérica que no decía dónde se miraba. El
    // progreso por set es lo que hay detrás de "Progreso por set" en
    // `/colecciones`, y nombrarlo acá es lo que hace que alguien entre a
    // buscarlo.
    description: 'Armá tus colecciones, seguí cuánto completaste de cada set y compartí.',
  },
] as const;

/**
 * Las tres feature cards. Server Component: son links y superficies, no hay
 * nada que hidratar.
 *
 * Cada tarjeta es un link a la pantalla que describe. Un ícono de lucide por
 * tarjeta (§8.14) sobre una caja `bg-brand-soft`, y el texto nunca depende del
 * ícono: el ícono es `aria-hidden`.
 *
 * El `heading` es `sr-only` porque las tres tarjetas ya dicen para qué sirve cada
 * cosa en su propio título: un encabezado visible arriba sería una cuarta frase
 * que repite lo que está abajo (§10.1).
 *
 * El `outline` del foco va **por fuera** con sus 4 px de aire (`offset-2` + 2 px
 * de grosor), que es el patrón de `Button`/`Chip`/`Select`. Acá se puede: la
 * grilla tiene `gap-3` y el `<li>` no recorta, así que el indicador queda
 * entero. El `ring-brand/20` que tenía antes medía 1.38:1 contra el canvas, y
 * WCAG 2.2 SC 1.4.11 pide 3:1.
 */
export function FeatureGrid() {
  return (
    <section aria-labelledby="home-features" className="flex flex-col gap-4">
      <h2 id="home-features" className="sr-only">
        Qué podés hacer con PokéScan
      </h2>

      <ul className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        {FEATURES.map((feature) => (
          <li key={feature.href} className="min-w-0">
            {/*
              `h-full` en el link y en la `Surface`: las tres descripciones no
              miden lo mismo, y sin esto las tarjetas quedan con alturas
              distintas dentro de la misma fila del grid.
            */}
            <Link
              href={feature.href}
              className="block h-full rounded-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]"
            >
              <Surface interactive className="flex h-full flex-col gap-2">
                <span className="grid size-10 place-items-center rounded-control bg-brand-soft text-brand">
                  <feature.icon
                    aria-hidden="true"
                    focusable="false"
                    strokeWidth={1.75}
                    className="h-5 w-5"
                  />
                </span>
                <span className="text-h3 text-primary">{feature.title}</span>
                <span className="text-body text-secondary">{feature.description}</span>
              </Surface>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
