'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ScanLine } from 'lucide-react';

import { readSession } from '@/components/scanner/session-storage';
import { buttonVariants } from '@/components/ui';
import { cn } from '@/lib/cn';
import { pluralize } from '@/lib/format';

/**
 * `Intl.NumberFormat` en el módulo y no en el render: el constructor es caro y se
 * puede cachear una vez para toda la sesión. Es el mismo criterio que
 * `collection-options.ts` y `scanner/copy.ts`, y está duplicado a propósito en vez
 * de importado: una función de conteo de **cartas** no debería ser dependencia de
 * la landing, que no tiene nada de colecciones.
 */
const COUNT_FORMAT = new Intl.NumberFormat('es-AR');

/**
 * La fila de "Continuás donde quedaste" de la home.
 *
 * ## Por qué es un client component chico
 *
 * `sessionStorage` no existe en el server, así que la fila **no se puede
 * decidir en el render de `page.tsx`**. Es la misma razón por la que
 * `HomeCta` es client: la home sigue siendo Server Component y solo esta pieza
 * entra al bundle, con el `count` en 0 como valor inicial del servidor.
 *
 * ## Por qué no usa `useSyncExternalStore`
 *
 * `navigator.onLine` y `theme` usan ese hook porque son **stores externos que
 * pueden cambiar sin que nadie los toque**. La sesión de escaneo cambia cuando el
 * usuario escanea, y ese usuario **no está en la home** en ese momento: la fila
 * se monta cuando él llega. No hay suscripción que registrar, así que
 * `useSyncExternalStore` sería `subscribe: () => () => {}` con tres funciones y
 * un snapshot server, que es el caso degenerado.
 *
 * ## Por qué lee en un efecto y no en el inicializador
 *
 * Igual que en `escanear/page.tsx`: leer `sessionStorage` en el inicializador de
 * `useState` da una hydration mismatch (el server no la tiene, el cliente sí), y
 * en React 19 eso es un error. El `useEffect` con `+0` deps lee una vez, después
 * de hidratar, y el primer render ya mostró el placeholder.
 *
 * ## La ruta
 *
 * Va a `/escanear`, no a una ruta nueva: el destino de una sesión guardada es
 * exactamente el `OrganizeSheet` de esa pantalla, y agregar una ruta intermedia
 * que solo reabra el sheet sería un segundo lugar donde la decisión de "abrir el
 * sheet" está escrita.
 */
export function ScanSessionResume({ className }: { className?: string }) {
  // El server no tiene `sessionStorage`, así que el primer render es siempre 0
  // y la fila aparece recién después de hidratar. Ver el bloque del efecto.
  const [count, setCount] = useState(0);

  /*
   * La lectura en una **microtask**, no en el cuerpo del efecto.
   *
   * Es el patrón de `docs/gotchas.md` §9, y el motivo concreto acá es doble:
   *
   * 1. `setCount(...)` directo en el cuerpo del efecto es un render en cascada,
   *    que el linter de React 19 marca como error.
   * 2. Con el doble montaje de `StrictMode` en dev, el `setCount` sincrónico
   *    corre en la primera pasada, el cleanup descarta la fila y la segunda
   *    pasada la vuelve a pintar: un parpadeo en la pantalla de arranque.
   *
   * La `queueMicrotask` saca el setter del camino síncrono del efecto, así que el
   * render ocurre **después** del commit, que es cuando el storage ya está
   * disponible y el usuario ya ve la pantalla.
   */
  useEffect(() => {
    let disposed = false;
    queueMicrotask(() => {
      if (disposed) return;
      setCount(readSession().length);
    });
    return () => {
      disposed = true;
    };
  }, []);

  /*
   * Sin fila cuando no hay nada guardado, y no una fila de "0 cartas": una
   * llamada a la acción que no lleva a ninguna parte es ruido en la pantalla de
   * arranque, que es la que más se mira de la app.
   */
  if (count === 0) return null;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/*
        `Surface` y no un `Alert`: esto no es un estado que está pasando, es un
        hecho permanente de la sesión. Un `Alert tone="info"` con ícono de alerta
        haría que leer 7 cartas se sintiera como un problema, y no lo es.
      */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-panel sm:grid-cols-[auto_minmax(0,1fr)_auto] border border-line bg-surface-2 p-4 shadow-sm">
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
          <ScanLine aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-5 w-5" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <p className="text-body-strong text-primary">Continuás donde quedaste</p>
          <p className="text-caption text-secondary tabular-nums">
            {COUNT_FORMAT.format(count)}{' '}
            {pluralize(count, 'carta escaneada', 'cartas escaneadas')} sin agregar a tu colección
          </p>
        </div>

        {/*
          `buttonVariants` sobre un `<Link>` y no un `<Button>`: el `Button` del
          design system **no** tiene `asChild` (es siempre un `<button>`, y un
          botón no navega). Es el mismo criterio que usa `CollectionBottomBar`.
        */}
        <Link
          href="/escanear"
          className={cn(buttonVariants({ variant: 'secondary', size: 'md' }), 'col-span-2 w-full sm:col-span-1 sm:w-auto')}
        >
          Organizar
        </Link>
      </div>
    </div>
  );
}
